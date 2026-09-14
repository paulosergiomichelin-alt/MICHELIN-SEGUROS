import { eq, and, gte, lte, isNull } from 'drizzle-orm';
import { fsGet, fsSet, fsUpdate, fsDelete } from '../lib/pgData.js';
import { getDb } from '../lib/db.js';
import { calendarEvents } from '../db/schema/campaigns-email.js';
import {
  listEvents as googleListEvents, createEvent as googleCreateEvent,
  updateEvent as googleUpdateEvent, deleteEvent as googleDeleteEvent,
  parseGoogleEvent, CalendarEventInput as GoogleEventInput,
} from '../lib/googleCalendarClient.js';
import {
  listEvents as msListEvents, createEvent as msCreateEvent,
  updateEvent as msUpdateEvent, deleteEvent as msDeleteEvent,
  parseMicrosoftEvent, CalendarEventInput as MsEventInput,
} from '../lib/microsoftCalendarClient.js';

function generateId(): string {
  return `cal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface EventBody {
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone?: string;
  attendees?: Array<{ email: string; name?: string }>;
}

async function loadEventsFromProvider(account: Record<string, any>, from: string, to: string): Promise<void> {
  // Roda em toda visualização de calendário (Task 5) — gravar um evento de cada vez,
  // esperando cada um terminar antes do próximo, faz esse passo escalar linearmente
  // com o número de eventos no período (visto em produção: 1.8-2.7s pra poucas
  // dezenas de eventos). Os upserts são independentes entre si (ids diferentes), então
  // rodar em paralelo é seguro e reduz isso ao tempo do upsert mais lento, não a soma.
  if (account.provider === 'gmail') {
    const events = await googleListEvents(account as any, from, to);
    await Promise.all(events.map(event => {
      const parsed = parseGoogleEvent(event, account.id, account.userId);
      return fsSet('calendar_events', `google_${parsed.providerEventId}`, parsed);
    }));
  } else if (account.provider === 'microsoft') {
    const events = await msListEvents(account as any, from, to);
    await Promise.all(events.map(event => {
      const parsed = parseMicrosoftEvent(event, account.id, account.userId);
      return fsSet('calendar_events', `microsoft_${parsed.providerEventId}`, parsed);
    }));
  }
}

async function createOnProvider(account: Record<string, any>, input: EventBody): Promise<string | null> {
  const timezone = input.timezone ?? 'America/Sao_Paulo';
  if (account.provider === 'gmail') {
    const created = await googleCreateEvent(account as any, { ...input, timezone } as GoogleEventInput);
    return created.id;
  }
  if (account.provider === 'microsoft') {
    const created = await msCreateEvent(account as any, { ...input, timezone } as MsEventInput);
    return created.id;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  try {
    const eventId: string | undefined = req.params?.id;

    // ── GET /api/calendar/events?userId&accountId&from&to ──────────────────────
    if (req.method === 'GET') {
      const { userId, accountId, from, to } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
      if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios' });

      // Filtra por INÍCIO do evento dentro do intervalo — simplificação aceita pra esta
      // fase: um evento que começa antes de `from` mas termina depois (atravessa a borda)
      // não aparece. Registrado como limitação conhecida (ver seção 6 do SPEC), não um
      // requisito quebrado — refinar pra checar sobreposição completa (startAt <= to AND
      // endAt >= from) só se o uso real mostrar necessidade.
      const overlapClause = and(
        eq(calendarEvents.userId, String(userId)),
        gte(calendarEvents.startAt, String(from)),
        lte(calendarEvents.startAt, String(to)),
      );

      if (!accountId || accountId === 'internal') {
        const rows = await getDb().select().from(calendarEvents).where(
          and(overlapClause, isNull(calendarEvents.accountId)),
        );
        return res.status(200).json({ events: rows });
      }

      const account = await fsGet('email_accounts', String(accountId));
      if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

      if (account.provider !== 'imap' && !account.calendarScopeGranted) {
        return res.status(200).json({ events: [], needsReauth: true });
      }

      if (account.calendarScopeGranted) {
        await loadEventsFromProvider(account, String(from), String(to));
      }

      const rows = await getDb().select().from(calendarEvents).where(
        and(overlapClause, eq(calendarEvents.accountId, String(accountId))),
      );
      return res.status(200).json({ events: rows });
    }

    // ── POST /api/calendar/events ───────────────────────────────────────────────
    if (req.method === 'POST') {
      const { userId, accountId, ...body } = req.body ?? {};
      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
      if (!body.title) return res.status(400).json({ error: 'title é obrigatório' });
      if (!body.startAt || !body.endAt) return res.status(400).json({ error: 'startAt e endAt são obrigatórios' });

      let provider: 'google' | 'microsoft' | 'internal' = 'internal';
      let providerEventId: string | null = null;
      let account: Record<string, any> | null = null;

      if (accountId && accountId !== 'internal') {
        account = await fsGet('email_accounts', String(accountId));
        if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
        if (account.provider !== 'imap' && !account.calendarScopeGranted) {
          return res.status(400).json({ error: 'Conta ainda não autorizou o escopo de calendário' });
        }
        if (account.provider === 'gmail') provider = 'google';
        else if (account.provider === 'microsoft') provider = 'microsoft';
        if (provider !== 'internal') {
          providerEventId = await createOnProvider(account, body as EventBody);
        }
      }

      // Quando o evento é criado num provedor real, usa o MESMO esquema de id que
      // loadEventsFromProvider usa pra sincronizar (`google_<id>`/`microsoft_<id>`) —
      // senão o próximo GET (que sempre resincroniza do provedor quando
      // calendarScopeGranted) cria uma SEGUNDA linha pro mesmo evento, duplicando-o
      // na grade da Agenda.
      const id = providerEventId
        ? `${provider === 'google' ? 'google' : 'microsoft'}_${providerEventId}`
        : generateId();
      await fsSet('calendar_events', id, {
        userId: String(userId),
        accountId: account ? String(accountId) : null,
        provider,
        providerEventId,
        title: body.title,
        description: body.description ?? null,
        location: body.location ?? null,
        startAt: body.startAt,
        endAt: body.endAt,
        allDay: Boolean(body.allDay),
        timezone: body.timezone ?? 'America/Sao_Paulo',
        attendees: body.attendees ?? null,
        status: 'confirmed',
      });

      return res.status(200).json({ id, success: true });
    }

    // ── PATCH /api/calendar/events/:id ──────────────────────────────────────────
    if (req.method === 'PATCH' && eventId) {
      const existing = await fsGet('calendar_events', eventId);
      if (!existing) return res.status(404).json({ error: 'Evento não encontrado' });

      const body = req.body ?? {};

      if (existing.accountId && existing.providerEventId) {
        const account = await fsGet('email_accounts', existing.accountId);
        // Um PATCH parcial (ex.: arrastar um evento só manda startAt/endAt) não
        // necessariamente inclui allDay/timezone — sem isso, o cliente do provedor não
        // sabe se deve formatar a data como dia inteiro (meia-noite, sem hora) ou como
        // horário com fuso, podendo mandar um formato inválido pro evento existente.
        const providerInput = {
          ...body,
          allDay: body.allDay !== undefined ? body.allDay : existing.allDay,
          timezone: body.timezone !== undefined ? body.timezone : existing.timezone,
        };
        if (account?.provider === 'gmail') {
          await googleUpdateEvent(account as any, existing.providerEventId, providerInput as Partial<GoogleEventInput>);
        } else if (account?.provider === 'microsoft') {
          await msUpdateEvent(account as any, existing.providerEventId, providerInput as Partial<MsEventInput>);
        }
      }

      await fsUpdate('calendar_events', eventId, body);
      return res.status(200).json({ success: true });
    }

    // ── DELETE /api/calendar/events/:id ─────────────────────────────────────────
    if (req.method === 'DELETE' && eventId) {
      const existing = await fsGet('calendar_events', eventId);
      if (!existing) return res.status(404).json({ error: 'Evento não encontrado' });

      if (existing.accountId && existing.providerEventId) {
        const account = await fsGet('email_accounts', existing.accountId);
        if (account?.provider === 'gmail') {
          await googleDeleteEvent(account as any, existing.providerEventId);
        } else if (account?.provider === 'microsoft') {
          await msDeleteEvent(account as any, existing.providerEventId);
        }
      }

      await fsDelete('calendar_events', eventId);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[calendar/events] error:', err);
    return res.status(500).json({ error: 'Erro na operação de evento', detail: err?.message });
  }
}
