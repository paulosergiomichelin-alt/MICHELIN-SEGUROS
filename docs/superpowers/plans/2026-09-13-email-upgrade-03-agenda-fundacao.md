# Agenda — Fundação (Fase 8a) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma Agenda funcional dentro do CRM — schema, reautorização OAuth sob demanda, sincronização real com Google Calendar e Microsoft Graph Calendar, CRUD de evento avulso (sem recorrência ainda), e as 4 visões (Dia/Semana de Trabalho/Semana/Mês) com clicar-arrastar pra criar/mover/redimensionar, estilo Outlook.

**Architecture:** Nova tabela `calendar_events` no Postgres é o cache de leitura E a fonte de verdade pra contas não sincronizadas (`provider: 'internal'`); pra contas Gmail/Microsoft sincronizadas, cada operação de escrita (criar/editar/excluir) primeiro chama a API do provedor e só then reflete no Postgres, e cada leitura de um intervalo de datas primeiro atualiza o Postgres a partir do provedor antes de responder — mesmo padrão "provedor é fonte de verdade, Postgres é cache" já usado pro e-mail, mas aqui persistente em vez de em memória. Reautorização OAuth é sob demanda, por conta, via um fluxo separado do de conectar e-mail (não força quem só usa e-mail a conceder acesso de calendário). UI é 100% componentes próprios (sem biblioteca de calendário/drag), consistente com o resto do sistema.

**Tech Stack:** TypeScript, Express (`server.ts`), Google Calendar API v3, Microsoft Graph Calendar API, React 18, date-fns, Vitest.

**Spec:** `docs/email-upgrade/SPEC.md` (seção 5.3, ADR-13/ADR-18). Este plano implementa a Fase 8a; a Fase 8b (recorrência + convites `.ics`) é um plano separado, feito depois deste.

## Global Constraints

- Recorrência e convites `.ics` **não** entram nesta fase — os campos de recorrência já existem no schema (seção 3.8 do SPEC) mas nenhuma lógica de aplicação os usa ainda; isso é Fase 8b.
- Reautorização é **sob demanda, por conta** — nunca força uma conta que só usa e-mail a passar por consentimento de calendário.
- Uma conta selecionada por vez na Agenda (mesmo padrão do seletor de contas do e-mail) — sem sobrepor calendários de contas diferentes nesta fase.
- Contas IMAP e a opção "Calendário local" nunca sincronizam com provedor externo — só Postgres, `provider: 'internal'`, `accountId: null`.
- Sem biblioteca de calendário/drag-and-drop externa (`react-big-calendar`, `dnd-kit`, etc.) — grades e interações de arraste são componentes próprios.
- Todo código novo em `_api/**` usa `.js` nos imports relativos (ESM), igual ao resto do arquivo.
- Depois de cada task: `npx tsc --noEmit` e `npx vitest run` têm que passar limpos antes do commit.

---

### Task 1: Schema — `calendarScopeGranted`, tabela `calendar_events`, registro no entityMap

**Files:**
- Modify: `_api/db/schema/campaigns-email.ts`
- Modify: `_api/data/entityMap.ts`

**Interfaces:**
- Produces: `schema.calendarEvents` (tabela Drizzle), `emailAccounts.calendarScopeGranted` (coluna nova), `ENTITY_TABLE['calendar_events']`.

- [ ] **Step 1: Adicionar a coluna `calendarScopeGranted` em `emailAccounts`**

Em `_api/db/schema/campaigns-email.ts`, dentro da definição de `emailAccounts` (depois de `passwordEncrypted`), adicionar:

```ts
  passwordEncrypted: text('password_encrypted'),
  // Diz se essa conta já reautorizou com o escopo de calendário (ADR-18) — evita ter
  // que fazer uma chamada de teste na API do provedor só pra descobrir isso.
  calendarScopeGranted: boolean('calendar_scope_granted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
```

(a linha `createdAt` já existe logo depois de `passwordEncrypted` — só inserir a linha nova entre as duas.)

- [ ] **Step 2: Criar a tabela `calendarEvents`**

No mesmo arquivo, logo depois da definição de `emailSettings` (final do arquivo), adicionar:

```ts
export const calendarEvents = pgTable('calendar_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
  accountId: text('account_id').references(() => emailAccounts.id), // null quando provider='internal'
  provider: text('provider').notNull(), // 'google' | 'microsoft' | 'internal'
  providerEventId: text('provider_event_id'), // null quando provider='internal'
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startAt: timestamp('start_at', { withTimezone: true, mode: 'string' }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true, mode: 'string' }).notNull(),
  allDay: boolean('all_day').notNull().default(false),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  organizerEmail: text('organizer_email'),
  attendees: jsonb('attendees'), // [{ email, name, responseStatus }]
  reminderMinutesBefore: integer('reminder_minutes_before').default(15),
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'cancelled' | 'tentative'

  // Recorrência (schema pronto pra Fase 8b — nenhuma lógica usa isso ainda nesta fase)
  recurrenceRule: text('recurrence_rule'),
  excludedDates: jsonb('excluded_dates'),
  masterEventId: text('master_event_id'),
  originalStartAt: timestamp('original_start_at', { withTimezone: true, mode: 'string' }),

  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_calendar_events_user').on(t.userId, t.startAt),
  index('idx_calendar_events_master').on(t.masterEventId),
]);
```

Confirme que `organizations` já está importado no topo do arquivo (`import { organizations } from './core';`) — já está, usado por `campaigns`.

- [ ] **Step 3: Registrar a tabela no `entityMap.ts`**

Em `_api/data/entityMap.ts`, no `ENTITY_TABLE`, adicionar depois de `email_settings: schema.emailSettings,`:

```ts
  calendar_events: schema.calendarEvents,
```

- [ ] **Step 4: Aplicar o schema no Postgres**

Run: `npm run db:push`
Expected: confirma a criação da tabela `calendar_events` e a nova coluna `calendar_scope_granted` em `email_accounts` sem pedir pra apagar dado nenhum (é tudo aditivo — tabela nova + coluna nova com default).

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/db/schema/campaigns-email.ts _api/data/entityMap.ts
git commit -m "feat: schema calendar_events e coluna calendarScopeGranted em email_accounts"
```

---

### Task 2: `_api/lib/googleCalendarClient.ts` — cliente Google Calendar API

**Files:**
- Create: `_api/lib/googleCalendarClient.ts`
- Test: `_api/lib/__tests__/googleCalendarClient.test.ts`

**Interfaces:**
- Consumes: `ensureValidToken`, `GmailAccount` (de `_api/lib/gmailClient.ts`, já existem — reaproveita o mesmo token OAuth da conta de e-mail, só com escopo adicional).
- Produces: `listEvents(account, from, to)`, `createEvent(account, input)`, `updateEvent(account, providerEventId, input)`, `deleteEvent(account, providerEventId)`, `parseGoogleEvent(event, accountId, userId)`, tipo `CalendarEventInput`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `_api/lib/__tests__/googleCalendarClient.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../emailEncryption.js', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

import {
  listEvents, createEvent, updateEvent, deleteEvent, parseGoogleEvent,
} from '../googleCalendarClient.js';
import { GmailAccount } from '../gmailClient.js';

function makeAccount(): GmailAccount {
  return {
    id: 'acc1', userId: 'u1', email: 'a@b.com',
    accessToken: 'token', refreshToken: 'refresh',
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    provider: 'gmail',
  };
}

describe('googleCalendarClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('listEvents chama /calendars/primary/events com timeMin/timeMax', async () => {
    global.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toContain('/calendars/primary/events');
      expect(String(url)).toContain('timeMin=2026-01-01');
      expect(String(url)).toContain('timeMax=2026-02-01');
      return { ok: true, status: 200, json: async () => ({ items: [{ id: 'ev1', summary: 'Reunião' }] }) };
    }) as any;

    const events = await listEvents(makeAccount(), '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
    expect(events).toEqual([{ id: 'ev1', summary: 'Reunião' }]);
  });

  it('createEvent monta payload com dateTime/timeZone quando não é dia inteiro', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body).toEqual({
        summary: 'Reunião', description: undefined, location: undefined,
        start: { dateTime: '2026-01-10T14:00:00', timeZone: 'America/Sao_Paulo' },
        end: { dateTime: '2026-01-10T15:00:00', timeZone: 'America/Sao_Paulo' },
      });
      return { ok: true, status: 200, json: async () => ({ id: 'ev2', summary: 'Reunião' }) };
    }) as any;

    await createEvent(makeAccount(), {
      title: 'Reunião', startAt: '2026-01-10T14:00:00', endAt: '2026-01-10T15:00:00',
      allDay: false, timezone: 'America/Sao_Paulo',
    });
  });

  it('createEvent monta payload com date quando é dia inteiro', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      expect(body.start).toEqual({ date: '2026-01-10' });
      expect(body.end).toEqual({ date: '2026-01-11' });
      return { ok: true, status: 200, json: async () => ({ id: 'ev3' }) };
    }) as any;

    await createEvent(makeAccount(), {
      title: 'Feriado', startAt: '2026-01-10T00:00:00', endAt: '2026-01-11T00:00:00',
      allDay: true, timezone: 'America/Sao_Paulo',
    });
  });

  it('updateEvent faz PATCH só com os campos informados', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/calendars/primary/events/ev1');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ summary: 'Novo título' });
      return { ok: true, status: 200, json: async () => ({ id: 'ev1' }) };
    }) as any;

    await updateEvent(makeAccount(), 'ev1', { title: 'Novo título' });
  });

  it('deleteEvent chama DELETE no evento certo', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/calendars/primary/events/ev1');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteEvent(makeAccount(), 'ev1');
  });

  it('parseGoogleEvent extrai os campos do formato do Google pro nosso formato', () => {
    const result = parseGoogleEvent({
      id: 'ev1',
      summary: 'Reunião',
      description: 'Pauta X',
      location: 'Sala 2',
      start: { dateTime: '2026-01-10T14:00:00-03:00', timeZone: 'America/Sao_Paulo' },
      end: { dateTime: '2026-01-10T15:00:00-03:00', timeZone: 'America/Sao_Paulo' },
      attendees: [{ email: 'x@y.com', displayName: 'X', responseStatus: 'accepted' }],
      organizer: { email: 'org@y.com' },
      status: 'confirmed',
    }, 'acc1', 'u1');

    expect(result).toMatchObject({
      accountId: 'acc1', userId: 'u1', provider: 'google', providerEventId: 'ev1',
      title: 'Reunião', description: 'Pauta X', location: 'Sala 2',
      allDay: false, organizerEmail: 'org@y.com', status: 'confirmed',
      attendees: [{ email: 'x@y.com', name: 'X', responseStatus: 'accepted' }],
    });
  });

  it('parseGoogleEvent trata evento de dia inteiro (start.date em vez de dateTime)', () => {
    const result = parseGoogleEvent({
      id: 'ev2', summary: 'Feriado',
      start: { date: '2026-01-10' }, end: { date: '2026-01-11' },
    }, 'acc1', 'u1');

    expect(result.allDay).toBe(true);
    expect(result.startAt).toBe('2026-01-10T00:00:00');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/lib/__tests__/googleCalendarClient.test.ts`
Expected: FAIL — o arquivo não existe ainda.

- [ ] **Step 3: Implementar `_api/lib/googleCalendarClient.ts`**

```ts
import { ensureValidToken, GmailAccount } from './gmailClient.js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  organizer?: { email: string };
  status?: string;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  startAt: string; // ISO, sem timezone quando allDay=false (a timeZone vai separada)
  endAt: string;
  allDay: boolean;
  timezone: string;
  attendees?: Array<{ email: string; name?: string }>;
}

async function googleCalendarRequest(
  account: GmailAccount,
  path: string,
  opts: RequestInit = {},
): Promise<any> {
  const token = await ensureValidToken(account);
  const url = path.startsWith('http') ? path : `${CALENDAR_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API ${path}: ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function listEvents(
  account: GmailAccount,
  from: string,
  to: string,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  });
  const data = await googleCalendarRequest(account, `/calendars/primary/events?${params}`);
  return data?.items ?? [];
}

// Um evento de dia inteiro usa {date: "YYYY-MM-DD"} no Google (sem hora nem timezone);
// um evento com hora usa {dateTime, timeZone}. As duas formas nunca se misturam no mesmo campo.
function toDateOrDateTime(iso: string, timezone: string, allDay: boolean): { date: string } | { dateTime: string; timeZone: string } {
  if (allDay) return { date: iso.slice(0, 10) };
  return { dateTime: iso, timeZone: timezone };
}

export async function createEvent(account: GmailAccount, input: CalendarEventInput): Promise<GoogleCalendarEvent> {
  const payload: any = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: toDateOrDateTime(input.startAt, input.timezone, input.allDay),
    end: toDateOrDateTime(input.endAt, input.timezone, input.allDay),
  };
  if (input.attendees?.length) {
    payload.attendees = input.attendees.map(a => ({ email: a.email, displayName: a.name }));
  }
  return googleCalendarRequest(account, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEvent(
  account: GmailAccount,
  providerEventId: string,
  input: Partial<CalendarEventInput>,
): Promise<GoogleCalendarEvent> {
  const payload: any = {};
  if (input.title !== undefined) payload.summary = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.location !== undefined) payload.location = input.location;
  if (input.startAt !== undefined && input.allDay !== undefined && input.timezone !== undefined) {
    payload.start = toDateOrDateTime(input.startAt, input.timezone, input.allDay);
  }
  if (input.endAt !== undefined && input.allDay !== undefined && input.timezone !== undefined) {
    payload.end = toDateOrDateTime(input.endAt, input.timezone, input.allDay);
  }
  if (input.attendees !== undefined) {
    payload.attendees = input.attendees.map(a => ({ email: a.email, displayName: a.name }));
  }
  return googleCalendarRequest(account, `/calendars/primary/events/${encodeURIComponent(providerEventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEvent(account: GmailAccount, providerEventId: string): Promise<void> {
  await googleCalendarRequest(account, `/calendars/primary/events/${encodeURIComponent(providerEventId)}`, {
    method: 'DELETE',
  });
}

export interface ParsedCalendarEvent {
  accountId: string;
  userId: string;
  provider: 'google';
  providerEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  organizerEmail: string | null;
  attendees: Array<{ email: string; name?: string; responseStatus: string }>;
  status: 'confirmed' | 'cancelled' | 'tentative';
}

export function parseGoogleEvent(event: GoogleCalendarEvent, accountId: string, userId: string): ParsedCalendarEvent {
  const allDay = Boolean(event.start.date);
  const startAt = event.start.dateTime ?? `${event.start.date}T00:00:00`;
  const endAt = event.end.dateTime ?? `${event.end.date}T00:00:00`;

  return {
    accountId,
    userId,
    provider: 'google',
    providerEventId: event.id,
    title: event.summary ?? '(sem título)',
    description: event.description ?? null,
    location: event.location ?? null,
    startAt,
    endAt,
    allDay,
    timezone: event.start.timeZone ?? 'America/Sao_Paulo',
    organizerEmail: event.organizer?.email ?? null,
    attendees: (event.attendees ?? []).map(a => ({
      email: a.email, name: a.displayName, responseStatus: a.responseStatus ?? 'needsAction',
    })),
    status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/lib/__tests__/googleCalendarClient.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/lib/googleCalendarClient.ts _api/lib/__tests__/googleCalendarClient.test.ts
git commit -m "feat: cliente Google Calendar API (listar/criar/editar/excluir evento)"
```

---

### Task 3: `_api/lib/microsoftCalendarClient.ts` — cliente Microsoft Graph Calendar

**Files:**
- Create: `_api/lib/microsoftCalendarClient.ts`
- Test: `_api/lib/__tests__/microsoftCalendarClient.test.ts`

**Interfaces:**
- Consumes: `ensureValidToken`, `MicrosoftAccount` (de `_api/lib/microsoftClient.ts`).
- Produces: mesma forma pública da Task 2 (`listEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `parseMicrosoftEvent`), pro dispatcher da Task 5 poder tratar os dois provedores de forma simétrica.

- [ ] **Step 1: Escrever os testes que falham**

Criar `_api/lib/__tests__/microsoftCalendarClient.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../emailEncryption.js', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

import {
  listEvents, createEvent, updateEvent, deleteEvent, parseMicrosoftEvent,
} from '../microsoftCalendarClient.js';
import { MicrosoftAccount } from '../microsoftClient.js';

function makeAccount(): MicrosoftAccount {
  return {
    id: 'acc1', userId: 'u1', email: 'a@b.com',
    accessToken: 'token', refreshToken: 'refresh',
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    provider: 'microsoft',
  };
}

describe('microsoftCalendarClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('listEvents chama me/calendarView com startDateTime/endDateTime', async () => {
    global.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toContain('me/calendarView');
      expect(String(url)).toContain('startDateTime=2026-01-01');
      expect(String(url)).toContain('endDateTime=2026-02-01');
      return { ok: true, status: 200, json: async () => ({ value: [{ id: 'ev1', subject: 'Reunião' }] }) };
    }) as any;

    const events = await listEvents(makeAccount(), '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
    expect(events).toEqual([{ id: 'ev1', subject: 'Reunião' }]);
  });

  it('createEvent monta payload no formato do Graph', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('me/events');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body).toEqual({
        subject: 'Reunião',
        body: { contentType: 'text', content: '' },
        isAllDay: false,
        start: { dateTime: '2026-01-10T14:00:00', timeZone: 'America/Sao_Paulo' },
        end: { dateTime: '2026-01-10T15:00:00', timeZone: 'America/Sao_Paulo' },
      });
      return { ok: true, status: 200, json: async () => ({ id: 'ev2' }) };
    }) as any;

    await createEvent(makeAccount(), {
      title: 'Reunião', startAt: '2026-01-10T14:00:00', endAt: '2026-01-10T15:00:00',
      allDay: false, timezone: 'America/Sao_Paulo',
    });
  });

  it('updateEvent faz PATCH só com os campos informados', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('me/events/ev1');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ subject: 'Novo título' });
      return { ok: true, status: 200, json: async () => ({ id: 'ev1' }) };
    }) as any;

    await updateEvent(makeAccount(), 'ev1', { title: 'Novo título' });
  });

  it('deleteEvent chama DELETE no evento certo', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('me/events/ev1');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteEvent(makeAccount(), 'ev1');
  });

  it('parseMicrosoftEvent extrai os campos do formato do Graph pro nosso formato', () => {
    const result = parseMicrosoftEvent({
      id: 'ev1',
      subject: 'Reunião',
      body: { content: 'Pauta X', contentType: 'text' },
      location: { displayName: 'Sala 2' },
      start: { dateTime: '2026-01-10T14:00:00', timeZone: 'America/Sao_Paulo' },
      end: { dateTime: '2026-01-10T15:00:00', timeZone: 'America/Sao_Paulo' },
      isAllDay: false,
      attendees: [{ emailAddress: { address: 'x@y.com', name: 'X' }, status: { response: 'accepted' } }],
      organizer: { emailAddress: { address: 'org@y.com' } },
    }, 'acc1', 'u1');

    expect(result).toMatchObject({
      accountId: 'acc1', userId: 'u1', provider: 'microsoft', providerEventId: 'ev1',
      title: 'Reunião', description: 'Pauta X', location: 'Sala 2',
      allDay: false, organizerEmail: 'org@y.com', status: 'confirmed',
      attendees: [{ email: 'x@y.com', name: 'X', responseStatus: 'accepted' }],
    });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/lib/__tests__/microsoftCalendarClient.test.ts`
Expected: FAIL — o arquivo não existe ainda.

- [ ] **Step 3: Implementar `_api/lib/microsoftCalendarClient.ts`**

```ts
import { ensureValidToken, MicrosoftAccount } from './microsoftClient.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface MsCalendarEvent {
  id: string;
  subject?: string;
  body?: { content?: string; contentType?: string };
  location?: { displayName?: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  attendees?: Array<{ emailAddress: { address: string; name?: string }; status?: { response?: string } }>;
  organizer?: { emailAddress: { address: string } };
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  attendees?: Array<{ email: string; name?: string }>;
}

async function graphCalendarRequest(
  account: MicrosoftAccount,
  path: string,
  opts: RequestInit = {},
): Promise<any> {
  const token = await ensureValidToken(account);
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph Calendar API ${path}: ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function listEvents(
  account: MicrosoftAccount,
  from: string,
  to: string,
): Promise<MsCalendarEvent[]> {
  const params = new URLSearchParams({
    startDateTime: from, endDateTime: to, $orderby: 'start/dateTime', $top: '250',
  });
  const data = await graphCalendarRequest(account, `me/calendarView?${params}`);
  return data?.value ?? [];
}

export async function createEvent(account: MicrosoftAccount, input: CalendarEventInput): Promise<MsCalendarEvent> {
  const payload: any = {
    subject: input.title,
    body: { contentType: 'text', content: input.description ?? '' },
    isAllDay: input.allDay,
    start: { dateTime: input.startAt, timeZone: input.timezone },
    end: { dateTime: input.endAt, timeZone: input.timezone },
  };
  if (input.location) payload.location = { displayName: input.location };
  if (input.attendees?.length) {
    payload.attendees = input.attendees.map(a => ({ emailAddress: { address: a.email, name: a.name } }));
  }
  return graphCalendarRequest(account, 'me/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEvent(
  account: MicrosoftAccount,
  providerEventId: string,
  input: Partial<CalendarEventInput>,
): Promise<MsCalendarEvent> {
  const payload: any = {};
  if (input.title !== undefined) payload.subject = input.title;
  if (input.description !== undefined) payload.body = { contentType: 'text', content: input.description };
  if (input.location !== undefined) payload.location = { displayName: input.location };
  if (input.allDay !== undefined) payload.isAllDay = input.allDay;
  if (input.startAt !== undefined && input.timezone !== undefined) {
    payload.start = { dateTime: input.startAt, timeZone: input.timezone };
  }
  if (input.endAt !== undefined && input.timezone !== undefined) {
    payload.end = { dateTime: input.endAt, timeZone: input.timezone };
  }
  if (input.attendees !== undefined) {
    payload.attendees = input.attendees.map(a => ({ emailAddress: { address: a.email, name: a.name } }));
  }
  return graphCalendarRequest(account, `me/events/${encodeURIComponent(providerEventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEvent(account: MicrosoftAccount, providerEventId: string): Promise<void> {
  await graphCalendarRequest(account, `me/events/${encodeURIComponent(providerEventId)}`, { method: 'DELETE' });
}

export interface ParsedCalendarEvent {
  accountId: string;
  userId: string;
  provider: 'microsoft';
  providerEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  organizerEmail: string | null;
  attendees: Array<{ email: string; name?: string; responseStatus: string }>;
  status: 'confirmed' | 'cancelled' | 'tentative';
}

export function parseMicrosoftEvent(event: MsCalendarEvent, accountId: string, userId: string): ParsedCalendarEvent {
  return {
    accountId,
    userId,
    provider: 'microsoft',
    providerEventId: event.id,
    title: event.subject ?? '(sem título)',
    description: event.body?.content ?? null,
    location: event.location?.displayName ?? null,
    startAt: event.start.dateTime,
    endAt: event.end.dateTime,
    allDay: Boolean(event.isAllDay),
    timezone: event.start.timeZone ?? 'America/Sao_Paulo',
    organizerEmail: event.organizer?.emailAddress?.address ?? null,
    attendees: (event.attendees ?? []).map(a => ({
      email: a.emailAddress.address, name: a.emailAddress.name, responseStatus: a.status?.response ?? 'notResponded',
    })),
    status: 'confirmed',
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/lib/__tests__/microsoftCalendarClient.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/lib/microsoftCalendarClient.ts _api/lib/__tests__/microsoftCalendarClient.test.ts
git commit -m "feat: cliente Microsoft Graph Calendar API (listar/criar/editar/excluir evento)"
```

---

### Task 4: Reautorização OAuth sob demanda (calendário)

**Files:**
- Create: `_api/email/auth/gmail-calendar.ts`
- Create: `_api/email/auth/microsoft-calendar.ts`
- Modify: `server.ts`

**Interfaces:**
- Consumes: `fsGet`/`fsUpdate` (`_api/lib/pgData.js`), `encrypt` (`_api/lib/emailEncryption.js`).
- Produces: rotas `GET /api/email/auth/gmail/calendar-init`, `GET /api/email/auth/gmail/calendar-callback`, `GET /api/email/auth/microsoft/calendar-init`, `GET /api/email/auth/microsoft/calendar-callback`.

- [ ] **Step 1: Criar `_api/email/auth/gmail-calendar.ts`**

```ts
import { fsGet, fsUpdate } from '../../lib/pgData.js';
import { encrypt } from '../../lib/emailEncryption.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// União do escopo de e-mail já concedido + calendário — o Google reemite um refresh_token
// novo cobrindo os dois quando os dois são pedidos juntos com prompt=consent.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url: string = req.url ?? '';

  // ── Init: redireciona pro consentimento do Google, pedindo o escopo de calendário ──
  if (url.includes('/calendar-init')) {
    try {
      const { accountId, returnUrl } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const account = await fsGet('email_accounts', String(accountId));
      if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
      if (account.provider !== 'gmail') return res.status(400).json({ error: 'Conta não é Gmail' });

      const clientId = process.env.GMAIL_CLIENT_ID;
      const redirectUri = process.env.GMAIL_CALENDAR_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'GMAIL_CLIENT_ID/GMAIL_CALENDAR_REDIRECT_URI não configurados' });
      }

      const state = Buffer.from(
        JSON.stringify({ accountId: String(accountId), returnUrl: String(returnUrl ?? '/agenda') }),
      ).toString('base64url');

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

      return res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
    } catch (err: any) {
      console.error('[gmail-calendar/init] error:', err);
      return res.status(500).json({ error: 'Erro ao iniciar reautorização', detail: err?.message });
    }
  }

  // ── Callback: troca o code por tokens novos (cobrindo e-mail + calendário) ─────────
  if (url.includes('/calendar-callback')) {
    try {
      const { code, state, error: oauthError } = req.query ?? {};
      if (oauthError) return res.status(400).json({ error: `OAuth2 error: ${oauthError}` });
      if (!code || !state) return res.status(400).json({ error: 'code e state são obrigatórios' });

      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      const redirectUri = process.env.GMAIL_CALENDAR_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({ error: 'GMAIL_CLIENT_ID/SECRET/GMAIL_CALENDAR_REDIRECT_URI não configurados' });
      }

      let parsedState: { accountId: string; returnUrl: string };
      try {
        parsedState = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'state inválido' });
      }
      const { accountId, returnUrl } = parsedState;

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code), client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error('[gmail-calendar/callback] token exchange failed:', text);
        return res.status(500).json({ error: 'Falha na troca de tokens', detail: text });
      }

      const tokenData = await tokenRes.json() as any;
      const { access_token, refresh_token, expires_in } = tokenData;
      if (!access_token || !refresh_token) {
        return res.status(500).json({ error: 'Tokens inválidos na resposta' });
      }

      await fsUpdate('email_accounts', accountId, {
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        tokenExpiry: Date.now() + (expires_in ?? 3600) * 1000,
        calendarScopeGranted: true,
        updatedAt: new Date().toISOString(),
      });

      const separator = returnUrl.includes('?') ? '&' : '?';
      return res.redirect(`${returnUrl}${separator}calendarConnected=1&accountId=${accountId}`);
    } catch (err: any) {
      console.error('[gmail-calendar/callback] error:', err);
      return res.status(500).json({ error: 'Erro no callback de reautorização', detail: err?.message });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada' });
}
```

- [ ] **Step 2: Criar `_api/email/auth/microsoft-calendar.ts`**

```ts
import { fsGet, fsUpdate } from '../../lib/pgData.js';
import { encrypt } from '../../lib/emailEncryption.js';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

const SCOPES = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'offline_access',
].join(' ');

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url: string = req.url ?? '';

  if (url.includes('/calendar-init')) {
    try {
      const { accountId, returnUrl } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const account = await fsGet('email_accounts', String(accountId));
      if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
      if (account.provider !== 'microsoft') return res.status(400).json({ error: 'Conta não é Microsoft' });

      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const redirectUri = process.env.MICROSOFT_CALENDAR_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'MICROSOFT_CLIENT_ID/MICROSOFT_CALENDAR_REDIRECT_URI não configurados' });
      }

      const state = Buffer.from(
        JSON.stringify({ accountId: String(accountId), returnUrl: String(returnUrl ?? '/agenda') }),
      ).toString('base64url');

      const params = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: SCOPES, response_mode: 'query', state,
      });

      return res.redirect(`${MS_AUTH_URL}?${params}`);
    } catch (err: any) {
      console.error('[microsoft-calendar/init] error:', err);
      return res.status(500).json({ error: 'Erro ao iniciar reautorização', detail: err?.message });
    }
  }

  if (url.includes('/calendar-callback')) {
    try {
      const { code, state, error: oauthError, error_description } = req.query ?? {};
      if (oauthError) {
        console.error('[microsoft-calendar/callback] OAuth error:', oauthError, error_description);
        return res.status(400).json({ error: `OAuth2 error: ${oauthError}`, detail: error_description });
      }
      if (!code || !state) return res.status(400).json({ error: 'code e state são obrigatórios' });

      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const redirectUri = process.env.MICROSOFT_CALENDAR_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({ error: 'MICROSOFT_CLIENT_ID/SECRET/MICROSOFT_CALENDAR_REDIRECT_URI não configurados' });
      }

      let parsedState: { accountId: string; returnUrl: string };
      try {
        parsedState = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'state inválido' });
      }
      const { accountId, returnUrl } = parsedState;

      const tokenRes = await fetch(MS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code), client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: 'authorization_code', scope: SCOPES,
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error('[microsoft-calendar/callback] token exchange failed:', text);
        return res.status(500).json({ error: 'Falha na troca de tokens', detail: text });
      }

      const tokenData = await tokenRes.json() as any;
      const { access_token, refresh_token, expires_in } = tokenData;
      if (!access_token || !refresh_token) {
        return res.status(500).json({ error: 'Tokens inválidos na resposta' });
      }

      await fsUpdate('email_accounts', accountId, {
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        tokenExpiry: Date.now() + (expires_in ?? 3600) * 1000,
        calendarScopeGranted: true,
        updatedAt: new Date().toISOString(),
      });

      const separator = returnUrl.includes('?') ? '&' : '?';
      return res.redirect(`${returnUrl}${separator}calendarConnected=1&accountId=${accountId}`);
    } catch (err: any) {
      console.error('[microsoft-calendar/callback] error:', err);
      return res.status(500).json({ error: 'Erro no callback de reautorização', detail: err?.message });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada' });
}
```

- [ ] **Step 3: Registrar as rotas em `server.ts`**

Encontrar o bloco de imports do módulo de e-mail (busca por `emailMicrosoftAuthHandler`) e adicionar logo abaixo:

```ts
  const { default: emailGmailCalendarAuthHandler }     = await import('./_api/email/auth/gmail-calendar.js');
  const { default: emailMicrosoftCalendarAuthHandler } = await import('./_api/email/auth/microsoft-calendar.js');
```

E no bloco de `app.all('/api/email/...)`, logo depois de `app.all('/api/email/auth/microsoft/callback', emailMicrosoftAuthHandler);`, adicionar:

```ts
  app.all('/api/email/auth/gmail/calendar-init',         emailGmailCalendarAuthHandler);
  app.all('/api/email/auth/gmail/calendar-callback',     emailGmailCalendarAuthHandler);
  app.all('/api/email/auth/microsoft/calendar-init',     emailMicrosoftCalendarAuthHandler);
  app.all('/api/email/auth/microsoft/calendar-callback', emailMicrosoftCalendarAuthHandler);
```

- [ ] **Step 4: Documentar as variáveis de ambiente novas**

Em `.env.example`, adicionar (perto de `GMAIL_REDIRECT_URI`/`MICROSOFT_REDIRECT_URI`):

```
GMAIL_CALENDAR_REDIRECT_URI=
MICROSOFT_CALENDAR_REDIRECT_URI=
```

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/email/auth/gmail-calendar.ts _api/email/auth/microsoft-calendar.ts server.ts .env.example
git commit -m "feat: reautorização OAuth sob demanda pra escopo de calendário (Gmail/Microsoft)"
```

---

### Task 5: `_api/calendar/events.ts` — API de eventos

**Files:**
- Create: `_api/calendar/events.ts`
- Modify: `server.ts`
- Test: `_api/calendar/__tests__/events.test.ts`

**Interfaces:**
- Consumes: `fsGet`/`fsSet`/`fsUpdate`/`fsDelete` (`_api/lib/pgData.js`), `getDb` (`_api/lib/db.js`), `calendarEvents` (`_api/db/schema/campaigns-email.js`), `listEvents`/`createEvent`/`updateEvent`/`deleteEvent`/`parseGoogleEvent` (Task 2), `listEvents`/`createEvent`/`updateEvent`/`deleteEvent`/`parseMicrosoftEvent` (Task 3).
- Produces: `GET /api/calendar/events`, `POST /api/calendar/events`, `PATCH /api/calendar/events/:id`, `DELETE /api/calendar/events/:id`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `_api/calendar/__tests__/events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tabela mockada abaixo é um objeto plano (strings), não Column real do Drizzle — os
// operadores reais (eq/and/gte/lte/isNull) esperam um Column de verdade e lançam erro
// se receberem uma string. Como o handler só usa o resultado de where() pra montar a
// query (e o mock de where() abaixo ignora o argumento e devolve `rows` fixo), os
// operadores em si viram stubs que só ecoam os argumentos — não precisam ser reais
// pra este teste, só não podem lançar.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ op: 'eq', a, b })),
  and: vi.fn((...args) => ({ op: 'and', args })),
  gte: vi.fn((a, b) => ({ op: 'gte', a, b })),
  lte: vi.fn((a, b) => ({ op: 'lte', a, b })),
  isNull: vi.fn((a) => ({ op: 'isNull', a })),
}));
vi.mock('../../lib/pgData.js', () => ({
  fsGet: vi.fn(), fsSet: vi.fn(), fsUpdate: vi.fn(), fsDelete: vi.fn(),
}));
vi.mock('../../lib/db.js', () => ({ getDb: vi.fn() }));
vi.mock('../../db/schema/campaigns-email.js', () => ({ calendarEvents: { userId: 'userId', accountId: 'accountId', startAt: 'startAt', endAt: 'endAt' } }));
vi.mock('../../lib/googleCalendarClient.js', () => ({
  listEvents: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), parseGoogleEvent: vi.fn(),
}));
vi.mock('../../lib/microsoftCalendarClient.js', () => ({
  listEvents: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), parseMicrosoftEvent: vi.fn(),
}));

import { fsGet, fsSet, fsUpdate, fsDelete } from '../../lib/pgData.js';
import { getDb } from '../../lib/db.js';
import * as google from '../../lib/googleCalendarClient.js';
import * as ms from '../../lib/microsoftCalendarClient.js';
import handler from '../events.js';

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// O handler só usa getDb() pro SELECT com range de datas (GET) — escritas passam por
// fsSet/fsUpdate/fsDelete (mockados acima), não por getDb().insert()/update() direto.
function makeDbChain(rows: any[]) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

describe('_api/calendar/events handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET com accountId=internal lista só do Postgres, sem chamar provedor', async () => {
    const chain = makeDbChain([{ id: 'ev1', title: 'Reunião local' }]);
    (getDb as any).mockReturnValue(chain);

    const req = { method: 'GET', query: { userId: 'u1', accountId: 'internal', from: '2026-01-01', to: '2026-02-01' } };
    const res = makeRes();

    await handler(req, res);

    expect(google.listEvents).not.toHaveBeenCalled();
    expect(ms.listEvents).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ events: [{ id: 'ev1', title: 'Reunião local' }] });
  });

  it('GET com conta Microsoft sem calendarScopeGranted retorna needsReauth sem listar', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft', calendarScopeGranted: false });
    const req = { method: 'GET', query: { userId: 'u1', accountId: 'acc1', from: '2026-01-01', to: '2026-02-01' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.listEvents).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ events: [], needsReauth: true });
  });

  it('GET com conta Google autorizada busca do provedor, faz upsert e lê do Postgres', async () => {
    (fsGet as any).mockResolvedValue({ id: 'acc1', provider: 'gmail', calendarScopeGranted: true, userId: 'u1' });
    (google.listEvents as any).mockResolvedValue([{ id: 'gcal1' }]);
    (google.parseGoogleEvent as any).mockReturnValue({ providerEventId: 'gcal1', title: 'Reunião' });
    const chain = makeDbChain([{ id: 'row1', title: 'Reunião' }]);
    (getDb as any).mockReturnValue(chain);

    const req = { method: 'GET', query: { userId: 'u1', accountId: 'acc1', from: '2026-01-01', to: '2026-02-01' } };
    const res = makeRes();

    await handler(req, res);

    expect(google.listEvents).toHaveBeenCalledWith({ id: 'acc1', provider: 'gmail', calendarScopeGranted: true, userId: 'u1' }, '2026-01-01', '2026-02-01');
    expect(fsSet).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ events: [{ id: 'row1', title: 'Reunião' }] });
  });

  it('POST sem accountId cria evento interno só no Postgres', async () => {
    const req = {
      method: 'POST',
      body: { userId: 'u1', title: 'Evento local', startAt: '2026-01-10T10:00:00', endAt: '2026-01-10T11:00:00', allDay: false },
    };
    const res = makeRes();

    await handler(req, res);

    expect(google.createEvent).not.toHaveBeenCalled();
    expect(ms.createEvent).not.toHaveBeenCalled();
    expect(fsSet).toHaveBeenCalledWith('calendar_events', expect.any(String), expect.objectContaining({
      provider: 'internal', accountId: null, title: 'Evento local',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('POST com accountId de conta Microsoft não autorizada recusa antes de tentar criar', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft', calendarScopeGranted: false });
    const req = {
      method: 'POST',
      body: { userId: 'u1', accountId: 'acc1', title: 'Reunião', startAt: '2026-01-10T10:00:00', endAt: '2026-01-10T11:00:00', allDay: false },
    };
    const res = makeRes();

    await handler(req, res);

    expect(ms.createEvent).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('POST com accountId de conta Google autorizada cria no provedor e grava no Postgres', async () => {
    (fsGet as any).mockResolvedValue({ id: 'acc1', provider: 'gmail', calendarScopeGranted: true, userId: 'u1' });
    (google.createEvent as any).mockResolvedValue({ id: 'gcal1' });
    const req = {
      method: 'POST',
      body: { userId: 'u1', accountId: 'acc1', title: 'Reunião', startAt: '2026-01-10T10:00:00', endAt: '2026-01-10T11:00:00', allDay: false },
    };
    const res = makeRes();

    await handler(req, res);

    expect(google.createEvent).toHaveBeenCalled();
    expect(fsSet).toHaveBeenCalledWith('calendar_events', expect.any(String), expect.objectContaining({
      provider: 'google', providerEventId: 'gcal1',
    }));
  });

  it('PATCH edita evento existente no provedor e no Postgres', async () => {
    (fsGet as any).mockResolvedValue({ id: 'ev1', accountId: 'acc1', providerEventId: 'gcal1' });
    (fsGet as any).mockImplementation((collection: string, id: string) => {
      if (collection === 'calendar_events') return Promise.resolve({ id: 'ev1', accountId: 'acc1', providerEventId: 'gcal1' });
      return Promise.resolve({ id: 'acc1', provider: 'gmail', calendarScopeGranted: true });
    });
    const req = { method: 'PATCH', params: { id: 'ev1' }, body: { title: 'Novo título' } };
    const res = makeRes();

    await handler(req, res);

    expect(google.updateEvent).toHaveBeenCalledWith(expect.anything(), 'gcal1', expect.objectContaining({ title: 'Novo título' }));
    expect(fsUpdate).toHaveBeenCalledWith('calendar_events', 'ev1', expect.objectContaining({ title: 'Novo título' }));
  });

  it('DELETE remove do provedor e do Postgres', async () => {
    (fsGet as any).mockImplementation((collection: string) => {
      if (collection === 'calendar_events') return Promise.resolve({ id: 'ev1', accountId: 'acc1', providerEventId: 'gcal1' });
      return Promise.resolve({ id: 'acc1', provider: 'microsoft', calendarScopeGranted: true });
    });
    const req = { method: 'DELETE', params: { id: 'ev1' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.deleteEvent).toHaveBeenCalledWith(expect.anything(), 'gcal1');
    expect(fsDelete).toHaveBeenCalledWith('calendar_events', 'ev1');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/calendar/__tests__/events.test.ts`
Expected: FAIL — `_api/calendar/events.ts` não existe ainda.

- [ ] **Step 3: Implementar `_api/calendar/events.ts`**

```ts
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
  if (account.provider === 'gmail') {
    const events = await googleListEvents(account as any, from, to);
    for (const event of events) {
      const parsed = parseGoogleEvent(event, account.id, account.userId);
      await fsSet('calendar_events', `google_${parsed.providerEventId}`, parsed);
    }
  } else if (account.provider === 'microsoft') {
    const events = await msListEvents(account as any, from, to);
    for (const event of events) {
      const parsed = parseMicrosoftEvent(event, account.id, account.userId);
      await fsSet('calendar_events', `microsoft_${parsed.providerEventId}`, parsed);
    }
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

      const id = generateId();
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
        if (account?.provider === 'gmail') {
          await googleUpdateEvent(account as any, existing.providerEventId, body as Partial<GoogleEventInput>);
        } else if (account?.provider === 'microsoft') {
          await msUpdateEvent(account as any, existing.providerEventId, body as Partial<MsEventInput>);
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
```

- [ ] **Step 4: Registrar as rotas em `server.ts`**

Depois do bloco `log.info('Email Module routes registradas');`, adicionar:

```ts
  // ── Calendar Module routes ───────────────────────────────────────────────────
  const { default: calendarEventsHandler } = await import('./_api/calendar/events.js');
  app.all('/api/calendar/events',     calendarEventsHandler);
  app.all('/api/calendar/events/:id', calendarEventsHandler);
  log.info('Calendar Module routes registradas');
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/calendar/__tests__/events.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/calendar/events.ts server.ts
git commit -m "feat: API de eventos de calendário (GET/POST/PATCH/DELETE, sync com Google/Microsoft)"
```

---

### Task 6: Frontend — `AgendaService.ts` + tipos

**Files:**
- Create: `src/services/AgendaService.ts`
- Modify: `src/services/EmailService.ts`
- Test: `src/services/__tests__/AgendaService.test.ts`

**Interfaces:**
- Produces: `AgendaService.getEvents/createEvent/updateEvent/deleteEvent/getCalendarConnectUrl`; `EmailAccount.calendarScopeGranted?: boolean` (novo campo).

- [ ] **Step 1: Adicionar `calendarScopeGranted` em `EmailAccount`**

Em `src/services/EmailService.ts`, na interface `EmailAccount`, adicionar depois de `errorMessage?: string;`:

```ts
  calendarScopeGranted?: boolean;
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `src/services/__tests__/AgendaService.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AgendaService } from '../AgendaService';

describe('AgendaService', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('getEvents monta a query string com userId/accountId/from/to', async () => {
    let captured: string = '';
    global.fetch = vi.fn(async (url: any) => {
      captured = String(url);
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    }) as any;

    await AgendaService.getEvents('u1', 'acc1', '2026-01-01', '2026-02-01');

    expect(captured).toContain('/api/calendar/events?');
    expect(captured).toContain('userId=u1');
    expect(captured).toContain('accountId=acc1');
    expect(captured).toContain('from=2026-01-01');
    expect(captured).toContain('to=2026-02-01');
  });

  it('createEvent faz POST com o body completo', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ id: 'ev1', success: true }) };
    }) as any;

    await AgendaService.createEvent({
      userId: 'u1', accountId: 'acc1', title: 'Reunião',
      startAt: '2026-01-10T10:00:00', endAt: '2026-01-10T11:00:00', allDay: false,
    });

    expect(captured.url).toBe('/api/calendar/events');
    expect(captured.opts.method).toBe('POST');
    expect(JSON.parse(captured.opts.body)).toMatchObject({ title: 'Reunião' });
  });

  it('updateEvent faz PATCH no id certo', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await AgendaService.updateEvent('ev1', { title: 'Novo título' });

    expect(captured.url).toBe('/api/calendar/events/ev1');
    expect(captured.opts.method).toBe('PATCH');
  });

  it('deleteEvent faz DELETE no id certo', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await AgendaService.deleteEvent('ev1');

    expect(captured.url).toBe('/api/calendar/events/ev1');
    expect(captured.opts.method).toBe('DELETE');
  });

  it('getCalendarConnectUrl monta a URL de reautorização certa por provedor', () => {
    expect(AgendaService.getCalendarConnectUrl('gmail', 'acc1', '/agenda'))
      .toBe('/api/email/auth/gmail/calendar-init?accountId=acc1&returnUrl=%2Fagenda');
    expect(AgendaService.getCalendarConnectUrl('microsoft', 'acc2', '/agenda'))
      .toBe('/api/email/auth/microsoft/calendar-init?accountId=acc2&returnUrl=%2Fagenda');
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/services/__tests__/AgendaService.test.ts`
Expected: FAIL — `AgendaService` não existe ainda.

- [ ] **Step 4: Implementar `src/services/AgendaService.ts`**

```ts
export interface CalendarEventAttendee {
  email: string;
  name?: string;
  responseStatus?: string;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  accountId: string | null;
  provider: 'google' | 'microsoft' | 'internal';
  providerEventId: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  organizerEmail?: string | null;
  attendees?: CalendarEventAttendee[] | null;
  status: 'confirmed' | 'cancelled' | 'tentative';
}

export interface CreateEventPayload {
  userId: string;
  accountId?: string | null;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone?: string;
  attendees?: CalendarEventAttendee[];
}

export type UpdateEventPayload = Partial<Omit<CreateEventPayload, 'userId' | 'accountId'>>;

export interface GetEventsResponse {
  events: CalendarEvent[];
  needsReauth?: boolean;
}

export const AgendaService = {
  getEvents: (userId: string, accountId: string, from: string, to: string): Promise<GetEventsResponse> =>
    fetch(
      `/api/calendar/events?userId=${encodeURIComponent(userId)}&accountId=${encodeURIComponent(accountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ).then(r => r.json()),

  createEvent: (payload: CreateEventPayload): Promise<{ id: string; success: boolean }> =>
    fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()),

  updateEvent: (id: string, payload: UpdateEventPayload): Promise<{ success: boolean }> =>
    fetch(`/api/calendar/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()),

  deleteEvent: (id: string): Promise<{ success: boolean }> =>
    fetch(`/api/calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => r.json()),

  getCalendarConnectUrl: (provider: 'gmail' | 'microsoft', accountId: string, returnUrl: string): string =>
    `/api/email/auth/${provider}/calendar-init?accountId=${encodeURIComponent(accountId)}&returnUrl=${encodeURIComponent(returnUrl)}`,
};
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/services/__tests__/AgendaService.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add src/services/AgendaService.ts src/services/EmailService.ts src/services/__tests__/AgendaService.test.ts
git commit -m "feat: AgendaService (API de eventos) e campo calendarScopeGranted em EmailAccount"
```

---

### Task 7: `AgendaContext.tsx`

**Files:**
- Create: `src/contexts/AgendaContext.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AgendaService` (Task 6), `useEmail()` (pra lista de contas).
- Produces: `useAgenda()` hook com `state`, `selectAccount`, `setView`, `navigate('prev'|'next'|'today')`, `createEvent`, `updateEvent`, `deleteEvent`.

- [ ] **Step 1: Implementar `src/contexts/AgendaContext.tsx`**

```tsx
import React, {
  createContext, useContext, useReducer, useEffect, useCallback, useRef,
} from 'react';
import { usePermissions } from './PermissionsContext';
import {
  AgendaService, CalendarEvent, CreateEventPayload, UpdateEventPayload,
} from '../services/AgendaService';

export type AgendaView = 'day' | 'workweek' | 'week' | 'month';

interface AgendaState {
  selectedAccountId: string; // 'internal' ou o id de uma conta de e-mail
  view: AgendaView;
  currentDate: string; // ISO da data "focada" na visão atual
  events: CalendarEvent[];
  loading: boolean;
  needsReauth: boolean;
  error: string | null;
}

type AgendaAction =
  | { type: 'SET_ACCOUNT'; payload: string }
  | { type: 'SET_VIEW'; payload: AgendaView }
  | { type: 'SET_DATE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_EVENTS'; payload: { events: CalendarEvent[]; needsReauth: boolean } }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: AgendaState = {
  selectedAccountId: 'internal',
  view: 'workweek',
  currentDate: new Date().toISOString(),
  events: [],
  loading: false,
  needsReauth: false,
  error: null,
};

function agendaReducer(state: AgendaState, action: AgendaAction): AgendaState {
  switch (action.type) {
    case 'SET_ACCOUNT':
      return { ...state, selectedAccountId: action.payload, events: [], needsReauth: false };
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_DATE':
      return { ...state, currentDate: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_EVENTS':
      return { ...state, events: action.payload.events, needsReauth: action.payload.needsReauth, loading: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

interface AgendaContextType {
  state: AgendaState;
  selectAccount: (accountId: string) => void;
  setView: (view: AgendaView) => void;
  navigate: (direction: 'prev' | 'next' | 'today') => void;
  goToDate: (isoDate: string) => void;
  createEvent: (payload: Omit<CreateEventPayload, 'userId' | 'accountId'>) => Promise<boolean>;
  updateEvent: (id: string, payload: UpdateEventPayload) => Promise<boolean>;
  deleteEvent: (id: string) => Promise<boolean>;
}

const noop = async () => false;
const DEFAULT_AGENDA_CTX: AgendaContextType = {
  state: initialState,
  selectAccount: () => {},
  setView: () => {},
  navigate: () => {},
  goToDate: () => {},
  createEvent: noop,
  updateEvent: noop,
  deleteEvent: noop,
};

const AgendaContext = createContext<AgendaContextType>(DEFAULT_AGENDA_CTX);

// Intervalo visível de cada visão, em dias, usado só pra calcular o range da API —
// a UI de cada visão decide sua própria grade a partir de currentDate (Task 9/10).
function rangeForView(view: AgendaView, currentDate: Date): { from: Date; to: Date } {
  const from = new Date(currentDate);
  const to = new Date(currentDate);
  if (view === 'day') {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (view === 'workweek' || view === 'week') {
    const day = from.getDay(); // 0=domingo — semana começa no domingo, igual ao MiniCalendar
    // `1 - day` funciona pra todo dia da semana sem caso especial: se hoje é domingo
    // (day=0), dá +1 (a segunda-feira já é da MESMA semana, que começou hoje); se é
    // sábado (day=6), dá -5 (volta pra segunda dessa semana).
    const startOffset = view === 'workweek' ? 1 - day : -day;
    from.setDate(from.getDate() + startOffset);
    from.setHours(0, 0, 0, 0);
    to.setTime(from.getTime());
    to.setDate(to.getDate() + (view === 'workweek' ? 4 : 6));
    to.setHours(23, 59, 59, 999);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    to.setMonth(to.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

export const AgendaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = usePermissions();
  const [state, dispatch] = useReducer(agendaReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadEvents = useCallback(async () => {
    const uid = userProfile?.uid;
    if (!uid) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const { from, to } = rangeForView(stateRef.current.view, new Date(stateRef.current.currentDate));
      const result = await AgendaService.getEvents(uid, stateRef.current.selectedAccountId, from.toISOString(), to.toISOString());
      dispatch({ type: 'SET_EVENTS', payload: { events: result.events, needsReauth: Boolean(result.needsReauth) } });
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar eventos.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.uid]);

  useEffect(() => {
    loadEvents();
  }, [state.selectedAccountId, state.view, state.currentDate, loadEvents]);

  const selectAccount = useCallback((accountId: string) => {
    dispatch({ type: 'SET_ACCOUNT', payload: accountId });
  }, []);

  const setView = useCallback((view: AgendaView) => {
    dispatch({ type: 'SET_VIEW', payload: view });
  }, []);

  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      dispatch({ type: 'SET_DATE', payload: new Date().toISOString() });
      return;
    }
    const current = new Date(stateRef.current.currentDate);
    const delta = direction === 'next' ? 1 : -1;
    if (stateRef.current.view === 'day') current.setDate(current.getDate() + delta);
    else if (stateRef.current.view === 'workweek' || stateRef.current.view === 'week') current.setDate(current.getDate() + delta * 7);
    else current.setMonth(current.getMonth() + delta);
    dispatch({ type: 'SET_DATE', payload: current.toISOString() });
  }, []);

  const goToDate = useCallback((isoDate: string) => {
    dispatch({ type: 'SET_DATE', payload: isoDate });
  }, []);

  const createEvent = useCallback(async (payload: Omit<CreateEventPayload, 'userId' | 'accountId'>): Promise<boolean> => {
    const uid = userProfile?.uid;
    if (!uid) return false;
    try {
      await AgendaService.createEvent({
        ...payload, userId: uid,
        accountId: stateRef.current.selectedAccountId === 'internal' ? null : stateRef.current.selectedAccountId,
      });
      await loadEvents();
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao criar evento.' });
      return false;
    }
  }, [userProfile?.uid, loadEvents]);

  const updateEvent = useCallback(async (id: string, payload: UpdateEventPayload): Promise<boolean> => {
    try {
      await AgendaService.updateEvent(id, payload);
      await loadEvents();
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao editar evento.' });
      return false;
    }
  }, [loadEvents]);

  const deleteEvent = useCallback(async (id: string): Promise<boolean> => {
    try {
      await AgendaService.deleteEvent(id);
      await loadEvents();
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao excluir evento.' });
      return false;
    }
  }, [loadEvents]);

  return (
    <AgendaContext.Provider
      value={{ state, selectAccount, setView, navigate, goToDate, createEvent, updateEvent, deleteEvent }}
    >
      {children}
    </AgendaContext.Provider>
  );
};

export const useAgenda = (): AgendaContextType => useContext(AgendaContext);
```

Nota: o Context não precisa da lista de contas de e-mail — só o `userProfile.uid`. A lista de contas (pra montar o seletor com "Calendário local" + contas Gmail/Microsoft/IMAP) é lida diretamente via `useEmail()` dentro do `AgendaPage.tsx` (Task 8), não duplicada aqui.

- [ ] **Step 2: Adicionar o `AgendaProvider` em `App.tsx`**

Em `src/App.tsx`, importar (perto de `EmailProvider`):

```ts
import { AgendaProvider } from './contexts/AgendaContext';
```

E envolver `MainAppContent` (dentro de `EmailProvider`) com `AgendaProvider`:

```tsx
          <EmailProvider>
            <AgendaProvider>
              <MainAppContent
                user={user}
                ...
                setVisualConfig={setVisualConfig}
              />
            </AgendaProvider>
          </EmailProvider>
```

- [ ] **Step 3: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros (sem teste dedicado pro Context — mesmo padrão já usado no `EmailContext`, verificado manualmente na Task 12).

```bash
git add src/contexts/AgendaContext.tsx src/App.tsx
git commit -m "feat: AgendaContext (estado de visão/data/eventos, CRUD, reautorização)"
```

---

### Task 8: `AgendaPage.tsx` + `ViewSwitcher.tsx` + `MiniCalendar.tsx` + rota

**Files:**
- Create: `src/domains/agenda/AgendaPage.tsx`
- Create: `src/domains/agenda/components/ViewSwitcher.tsx`
- Create: `src/domains/agenda/components/MiniCalendar.tsx`
- Modify: `src/components/AppContentManager.tsx`

**Interfaces:**
- Consumes: `useAgenda()` (Task 7), `useEmail()`, `AccountSelector` (reaproveitado de `../email/components/sidebar/AccountSelector`), `AgendaService.getCalendarConnectUrl` (Task 6).
- Produces: rota `/agenda`.

- [ ] **Step 1: Criar `src/domains/agenda/components/ViewSwitcher.tsx`**

```tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { AgendaView } from '../../../contexts/AgendaContext';

interface Props {
  view: AgendaView;
  currentDate: string;
  onSetView: (view: AgendaView) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
}

const VIEWS: Array<{ id: AgendaView; label: string }> = [
  { id: 'day', label: 'Dia' },
  { id: 'workweek', label: 'Semana de Trabalho' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
];

export const ViewSwitcher: React.FC<Props> = ({ view, currentDate, onSetView, onNavigate }) => {
  const label = new Date(currentDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#141414]">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('today')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:bg-white/5 border border-white/10 transition-colors"
        >
          Hoje
        </button>
        <button onClick={() => onNavigate('prev')} className="p-1.5 rounded-lg text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onNavigate('next')} className="p-1.5 rounded-lg text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-white/80 text-sm font-semibold capitalize ml-2">{label}</span>
      </div>
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => onSetView(v.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              view === v.id ? 'bg-blue-600/30 text-blue-300' : 'text-white/50 hover:text-white/80',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Criar `src/domains/agenda/components/MiniCalendar.tsx`**

```tsx
import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface Props {
  currentDate: string;
  onSelectDate: (isoDate: string) => void;
}

function buildMonthGrid(reference: Date): Date[] {
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const startOffset = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export const MiniCalendar: React.FC<Props> = ({ currentDate, onSelectDate }) => {
  const [visibleMonth, setVisibleMonth] = React.useState(() => new Date(currentDate));
  const selected = new Date(currentDate);
  const today = new Date();

  const days = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const changeMonth = (delta: number) => {
    const next = new Date(visibleMonth);
    next.setMonth(next.getMonth() + delta);
    setVisibleMonth(next);
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div className="p-3 border-b border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-white/50 capitalize">{monthLabel}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => changeMonth(-1)} className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/5">
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button onClick={() => changeMonth(1)} className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/5">
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[9px] text-white/25 py-1">{d}</span>
        ))}
        {days.map((day, i) => (
          <button
            key={i}
            onClick={() => onSelectDate(day.toISOString())}
            className={cn(
              'text-[10px] py-1 rounded transition-colors',
              day.getMonth() !== visibleMonth.getMonth() ? 'text-white/15' : 'text-white/60',
              isSameDay(day, selected) && 'bg-blue-600/30 text-blue-300',
              isSameDay(day, today) && !isSameDay(day, selected) && 'text-blue-400 font-semibold',
              'hover:bg-white/10',
            )}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Criar `src/domains/agenda/AgendaPage.tsx`**

```tsx
import React from 'react';
import { CalendarPlus } from 'lucide-react';
import { useAgenda } from '../../contexts/AgendaContext';
import { useEmail } from '../../contexts/EmailContext';
import { AgendaService } from '../../services/AgendaService';
import { AccountSelector } from '../email/components/sidebar/AccountSelector';
import { ViewSwitcher } from './components/ViewSwitcher';
import { MiniCalendar } from './components/MiniCalendar';
import type { EmailAccount } from '../../services/EmailService';

const INTERNAL_ACCOUNT: EmailAccount = {
  id: 'internal', userId: '', provider: 'imap', email: 'Calendário local',
  isDefault: false, status: 'connected',
};

export const AgendaPage: React.FC = () => {
  const { state, selectAccount, setView, navigate, goToDate } = useAgenda();
  const { state: emailState } = useEmail();

  // Só contas Gmail/Microsoft/IMAP fazem sentido na Agenda — mais o item sintético
  // "Calendário local" pra eventos que não pertencem a nenhuma conta específica.
  const accounts: EmailAccount[] = [INTERNAL_ACCOUNT, ...emailState.accounts];
  const selectedAccount = accounts.find(a => a.id === state.selectedAccountId) ?? INTERNAL_ACCOUNT;
  const needsConnect = state.selectedAccountId !== 'internal'
    && (selectedAccount.provider === 'gmail' || selectedAccount.provider === 'microsoft')
    && !selectedAccount.calendarScopeGranted;

  const handleConnect = () => {
    if (selectedAccount.provider !== 'gmail' && selectedAccount.provider !== 'microsoft') return;
    window.location.href = AgendaService.getCalendarConnectUrl(
      selectedAccount.provider, selectedAccount.id, window.location.pathname,
    );
  };

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] overflow-hidden">
      <aside className="w-64 shrink-0 bg-[#111111] border-r border-white/5 flex flex-col overflow-hidden">
        <AccountSelector accounts={accounts} selectedAccountId={state.selectedAccountId} onSelect={selectAccount} />
        <MiniCalendar currentDate={state.currentDate} onSelectDate={goToDate} />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <ViewSwitcher view={state.view} currentDate={state.currentDate} onSetView={setView} onNavigate={navigate} />

        {needsConnect ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <CalendarPlus className="w-8 h-8 text-blue-400" />
            </div>
            <div className="text-center">
              <h2 className="text-white/80 text-lg font-semibold mb-1">Conectar calendário desta conta</h2>
              <p className="text-white/40 text-sm max-w-sm">
                Pra ver e criar eventos de {selectedAccount.email}, autorize o acesso ao calendário — é uma permissão separada da de e-mail.
              </p>
            </div>
            <button
              onClick={handleConnect}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Conectar calendário
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 text-white/40 text-sm">
            {/* TimeGrid (Dia/Semana de Trabalho/Semana) e MonthGrid (Mês) — Tasks 9 e 10 */}
            {state.loading ? 'Carregando...' : `${state.events.length} evento(s) no período`}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Registrar a rota em `AppContentManager.tsx`**

Adicionar o lazy import (perto de `EmailSettingsPage`):

```ts
const AgendaPage = lazy(() => import('../domains/agenda/AgendaPage').then(m => ({ default: m.AgendaPage })));
```

E a rota (logo depois de `<Route path="/email/configuracoes" ... />`):

```tsx
          <Route path="/agenda" element={<AgendaPage />} />
```

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add src/domains/agenda/AgendaPage.tsx src/domains/agenda/components/ViewSwitcher.tsx src/domains/agenda/components/MiniCalendar.tsx src/components/AppContentManager.tsx
git commit -m "feat: página /agenda com seletor de conta, mini-calendário e estado de reautorização"
```

---

### Task 9: `src/domains/agenda/utils/gridMath.ts` — matemática da grade de horários

**Files:**
- Create: `src/domains/agenda/utils/gridMath.ts`
- Test: `src/domains/agenda/utils/__tests__/gridMath.test.ts`

**Interfaces:**
- Produces: `HOUR_HEIGHT`, `SNAP_MINUTES`, `startOfGridDay(date)`, `timeToY(date)`, `yToTime(y, dayDate)`, `durationToHeight(startAt, endAt)`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/domains/agenda/utils/__tests__/gridMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HOUR_HEIGHT, timeToY, yToTime, durationToHeight, startOfGridDay } from '../gridMath';

describe('gridMath', () => {
  it('startOfGridDay zera hora/minuto/segundo', () => {
    const d = startOfGridDay(new Date('2026-01-10T14:35:20'));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('timeToY(meia-noite) = 0', () => {
    expect(timeToY(new Date('2026-01-10T00:00:00'))).toBe(0);
  });

  it('timeToY(1h) = HOUR_HEIGHT', () => {
    expect(timeToY(new Date('2026-01-10T01:00:00'))).toBe(HOUR_HEIGHT);
  });

  it('timeToY(1h30) = 1.5 * HOUR_HEIGHT', () => {
    expect(timeToY(new Date('2026-01-10T01:30:00'))).toBe(HOUR_HEIGHT * 1.5);
  });

  it('yToTime(0) volta meia-noite do dia informado', () => {
    const result = yToTime(0, new Date('2026-01-10T00:00:00'));
    expect(result.getHours()).toBe(0);
    expect(result.getDate()).toBe(10);
  });

  it('yToTime arredonda pro snap de 15 minutos mais próximo', () => {
    // 7 minutos em pixels: (7/60) * HOUR_HEIGHT -> arredonda pra 0min (mais perto de 0 que de 15)
    const y7min = (7 / 60) * HOUR_HEIGHT;
    const result = yToTime(y7min, new Date('2026-01-10T00:00:00'));
    expect(result.getMinutes()).toBe(0);

    // 10 minutos -> mais perto de 15 que de 0
    const y10min = (10 / 60) * HOUR_HEIGHT;
    const result2 = yToTime(y10min, new Date('2026-01-10T00:00:00'));
    expect(result2.getMinutes()).toBe(15);
  });

  it('durationToHeight(1h) = HOUR_HEIGHT', () => {
    const start = new Date('2026-01-10T10:00:00');
    const end = new Date('2026-01-10T11:00:00');
    expect(durationToHeight(start, end)).toBe(HOUR_HEIGHT);
  });

  it('durationToHeight tem altura mínima pra eventos muito curtos', () => {
    const start = new Date('2026-01-10T10:00:00');
    const end = new Date('2026-01-10T10:05:00');
    expect(durationToHeight(start, end)).toBe(HOUR_HEIGHT / 4);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/domains/agenda/utils/__tests__/gridMath.test.ts`
Expected: FAIL — `gridMath.ts` não existe ainda.

- [ ] **Step 3: Implementar `src/domains/agenda/utils/gridMath.ts`**

```ts
export const HOUR_HEIGHT = 48; // px por hora na grade de Dia/Semana/Semana de Trabalho
export const SNAP_MINUTES = 15;

export function startOfGridDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Converte um horário pro deslocamento vertical (px) dentro da grade do dia dele. */
export function timeToY(date: Date): number {
  const dayStart = startOfGridDay(date);
  const minutesFromMidnight = (date.getTime() - dayStart.getTime()) / 60000;
  return (minutesFromMidnight / 60) * HOUR_HEIGHT;
}

/** Converte um deslocamento vertical (px) dentro de um dia pro horário, arredondado pro snap. */
export function yToTime(y: number, dayDate: Date): Date {
  const dayStart = startOfGridDay(dayDate);
  const rawMinutes = (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  const clamped = Math.max(0, Math.min(24 * 60, snapped));
  return new Date(dayStart.getTime() + clamped * 60000);
}

/** Altura (px) de um bloco de evento na grade, com altura mínima de 15min pra ficar clicável. */
export function durationToHeight(startAt: Date, endAt: Date): number {
  const minutes = (endAt.getTime() - startAt.getTime()) / 60000;
  return Math.max(HOUR_HEIGHT / 4, (minutes / 60) * HOUR_HEIGHT);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/domains/agenda/utils/__tests__/gridMath.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add src/domains/agenda/utils/gridMath.ts src/domains/agenda/utils/__tests__/gridMath.test.ts
git commit -m "feat: matemática de conversão tempo/pixel da grade de horários da Agenda"
```

---

### Task 10: `TimeGrid.tsx` + `EventBlock.tsx` — visões Dia/Semana de Trabalho/Semana

**Files:**
- Create: `src/domains/agenda/components/EventBlock.tsx`
- Create: `src/domains/agenda/components/TimeGrid.tsx`
- Modify: `src/domains/agenda/AgendaPage.tsx`

**Interfaces:**
- Consumes: `gridMath` (Task 9), `useAgenda()` (Task 7), `CalendarEvent` (Task 6).
- Produces: `<TimeGrid days={Date[]} events={CalendarEvent[]} onCreateRange={...} onMoveEvent={...} onResizeEvent={...} onClickEvent={...} />`.

- [ ] **Step 1: Criar `src/domains/agenda/components/EventBlock.tsx`**

```tsx
import React, { useState, useRef, useCallback } from 'react';
import { timeToY, durationToHeight, yToTime, HOUR_HEIGHT } from '../utils/gridMath';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  event: CalendarEvent;
  dayDate: Date;
  columnWidthPercent: number; // pra eventos sobrepostos dividirem a largura
  columnOffsetPercent: number;
  onClick: (e: React.MouseEvent) => void;
  onMove: (event: CalendarEvent, newStartAt: Date) => void;
  onResize: (event: CalendarEvent, newEndAt: Date) => void;
}

export const EventBlock: React.FC<Props> = ({
  event, dayDate, columnWidthPercent, columnOffsetPercent, onClick, onMove, onResize,
}) => {
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [resizingHeight, setResizingHeight] = useState<number | null>(null);
  const startAt = new Date(event.startAt);
  const endAt = new Date(event.endAt);
  const top = timeToY(startAt) + dragOffsetY;
  const height = resizingHeight ?? durationToHeight(startAt, endAt);
  const dragging = useRef(false);

  const handleMoveStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    dragging.current = false;

    const onMouseMove = (moveEvt: MouseEvent) => {
      dragging.current = true;
      setDragOffsetY(moveEvt.clientY - startY);
    };
    const onMouseUp = (upEvt: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (dragging.current) {
        const deltaY = upEvt.clientY - startY;
        const newStart = yToTime(timeToY(startAt) + deltaY, dayDate);
        onMove(event, newStart);
      }
      setDragOffsetY(0);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [event, startAt, dayDate, onMove]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    const initialHeight = durationToHeight(startAt, endAt);

    const onMouseMove = (moveEvt: MouseEvent) => {
      const deltaY = moveEvt.clientY - startY;
      setResizingHeight(Math.max(HOUR_HEIGHT / 4, initialHeight + deltaY));
    };
    const onMouseUp = (upEvt: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const deltaY = upEvt.clientY - startY;
      const newHeightMinutes = ((initialHeight + deltaY) / HOUR_HEIGHT) * 60;
      const snappedMinutes = Math.max(15, Math.round(newHeightMinutes / 15) * 15);
      const newEnd = new Date(startAt.getTime() + snappedMinutes * 60000);
      onResize(event, newEnd);
      setResizingHeight(null);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [event, startAt, endAt, onResize]);

  return (
    <div
      onClick={onClick}
      onMouseDown={handleMoveStart}
      className="absolute rounded-md bg-blue-600/70 hover:bg-blue-600/85 border border-blue-400/40 text-white text-[11px] px-2 py-1 overflow-hidden cursor-pointer select-none transition-colors"
      style={{
        top, height, left: `${columnOffsetPercent}%`, width: `${columnWidthPercent}%`,
      }}
    >
      <div className="font-medium truncate">{event.title}</div>
      {!event.allDay && (
        <div className="text-[10px] text-white/70">
          {startAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize"
      />
    </div>
  );
};
```

- [ ] **Step 2: Criar `src/domains/agenda/components/TimeGrid.tsx`**

```tsx
import React, { useMemo, useState, useCallback } from 'react';
import { HOUR_HEIGHT, yToTime } from '../utils/gridMath';
import { EventBlock } from './EventBlock';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  days: Date[]; // 1 dia (Dia) ou 5/7 dias (Semana de Trabalho/Semana)
  events: CalendarEvent[];
  onCreateRange: (startAt: Date, endAt: Date) => void;
  onMoveEvent: (event: CalendarEvent, newStartAt: Date) => void;
  onResizeEvent: (event: CalendarEvent, newEndAt: Date) => void;
  onClickEvent: (event: CalendarEvent, anchorEl: HTMLElement) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const TimeGrid: React.FC<Props> = ({ days, events, onCreateRange, onMoveEvent, onResizeEvent, onClickEvent }) => {
  const [draftRange, setDraftRange] = useState<{ dayIndex: number; startY: number; endY: number } | null>(null);

  const eventsByDay = useMemo(() => {
    return days.map(day => events.filter(ev => !ev.allDay && isSameDay(new Date(ev.startAt), day)));
  }, [days, events]);

  const handleGridMouseDown = useCallback((dayIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const startY = e.clientY - rect.top;
    setDraftRange({ dayIndex, startY, endY: startY });

    const onMouseMove = (moveEvt: MouseEvent) => {
      const y = moveEvt.clientY - rect.top;
      setDraftRange(prev => (prev ? { ...prev, endY: y } : prev));
    };
    const onMouseUp = (upEvt: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const y = upEvt.clientY - rect.top;
      const day = days[dayIndex];
      // Um clique sem arraste de verdade (diferença menor que 4px, pra absorver o tremor
      // natural do mouse entre mousedown e mouseup) vira um evento padrão de 1h a partir
      // do horário clicado, em vez de um evento de duração ~0.
      const didDrag = Math.abs(y - startY) > 4;
      const from = yToTime(Math.min(startY, y), day);
      const to = didDrag ? yToTime(Math.max(startY, y), day) : new Date(from.getTime() + 60 * 60000);
      onCreateRange(from, to);
      setDraftRange(null);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [days, onCreateRange]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="flex">
        {/* Coluna de horas */}
        <div className="w-14 shrink-0 pt-2">
          {HOURS.map(h => (
            <div key={h} style={{ height: HOUR_HEIGHT }} className="text-[10px] text-white/30 text-right pr-2 -translate-y-1.5">
              {h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}
            </div>
          ))}
        </div>

        {/* Colunas dos dias */}
        {days.map((day, dayIndex) => (
          <div
            key={day.toISOString()}
            onMouseDown={e => handleGridMouseDown(dayIndex, e)}
            className="flex-1 relative border-l border-white/5"
            style={{ height: HOUR_HEIGHT * 24 }}
          >
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-white/5" />
            ))}

            {draftRange && draftRange.dayIndex === dayIndex && (
              <div
                className="absolute left-0.5 right-0.5 rounded bg-blue-500/30 border border-blue-400/50 pointer-events-none"
                style={{
                  top: Math.min(draftRange.startY, draftRange.endY),
                  height: Math.abs(draftRange.endY - draftRange.startY),
                }}
              />
            )}

            {eventsByDay[dayIndex].map(event => (
              <EventBlock
                key={event.id}
                event={event}
                dayDate={day}
                columnWidthPercent={94}
                columnOffsetPercent={2}
                onClick={e => onClickEvent(event, e.currentTarget as HTMLElement)}
                onMove={onMoveEvent}
                onResize={onResizeEvent}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
```

Nota: divisão de eventos sobrepostos lado a lado (`columnWidthPercent`/`columnOffsetPercent` dinâmicos por sobreposição) fica com valores fixos (94%/2%, ou seja, cada evento ocupa quase a coluna inteira) nesta primeira versão — o algoritmo de particionar em colunas quando há sobreposição real é um refinamento visual, não bloqueia a Fase 8a funcionar (eventos sobrepostos ainda aparecem, só ficam um por cima do outro parcialmente). Registrar como melhoria futura se o uso real mostrar necessidade.

- [ ] **Step 3: Ligar o `TimeGrid` no `AgendaPage.tsx`**

Em `src/domains/agenda/AgendaPage.tsx`, importar:

```ts
import { TimeGrid } from './components/TimeGrid';
```

E adicionar uma função que calcula os dias visíveis a partir de `state.view`/`state.currentDate` (mesma lógica de intervalo do `rangeForView` do Context, mas devolvendo a lista de `Date` dia a dia em vez de só from/to):

```tsx
function daysForView(view: string, currentDate: string): Date[] {
  const base = new Date(currentDate);
  if (view === 'day') return [base];
  const day = base.getDay();
  const count = view === 'workweek' ? 5 : view === 'week' ? 7 : 0;
  if (count === 0) return [];
  const startOffset = view === 'workweek' ? 1 - day : -day;
  const start = new Date(base);
  start.setDate(start.getDate() + startOffset);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}
```

E trocar o placeholder `{state.loading ? 'Carregando...' : ...}` por:

```tsx
          state.view === 'month' ? (
            <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
              Visão Mês — Task 11
            </div>
          ) : (
            <TimeGrid
              days={daysForView(state.view, state.currentDate)}
              events={state.events}
              onCreateRange={(startAt, endAt) => {
                // eslint-disable-next-line no-alert
                const title = window.prompt('Título do evento:');
                if (!title || !title.trim()) return;
                createEvent({ title: title.trim(), startAt: startAt.toISOString(), endAt: endAt.toISOString(), allDay: false });
              }}
              onMoveEvent={(event, newStartAt) => {
                const durationMs = new Date(event.endAt).getTime() - new Date(event.startAt).getTime();
                updateEvent(event.id, {
                  startAt: newStartAt.toISOString(),
                  endAt: new Date(newStartAt.getTime() + durationMs).toISOString(),
                });
              }}
              onResizeEvent={(event, newEndAt) => updateEvent(event.id, { endAt: newEndAt.toISOString() })}
              onClickEvent={(event) => {
                // eslint-disable-next-line no-alert
                window.alert(`${event.title}\n${new Date(event.startAt).toLocaleString('pt-BR')}`);
              }}
            />
          )

Também desestruturar `createEvent` e `updateEvent` de `useAgenda()` no topo do componente (`const { state, selectAccount, setView, navigate, goToDate, createEvent, updateEvent } = useAgenda();`).
```

Nota: criar evento via `window.prompt` e ver detalhes via `window.alert` são placeholders temporários **só até a Task 12** trocar isso pelo `EventEditorModal`/`EventPopover` de verdade — igual ao padrão já usado no `FolderNav.tsx` (que usa `window.prompt`/`window.confirm` como solução definitiva, não temporária, pra criar/renomear pasta). Aqui é peça de passagem: a Task 12 substitui os dois `window.*` por componentes reais.

- [ ] **Step 4: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add src/domains/agenda/components/EventBlock.tsx src/domains/agenda/components/TimeGrid.tsx src/domains/agenda/AgendaPage.tsx
git commit -m "feat: grade de horários (Dia/Semana de Trabalho/Semana) com clicar-arrastar pra criar/mover/redimensionar"
```

---

### Task 11: `MonthGrid.tsx` — visão Mês

**Files:**
- Create: `src/domains/agenda/components/MonthGrid.tsx`
- Modify: `src/domains/agenda/AgendaPage.tsx`

**Interfaces:**
- Consumes: `useAgenda()`, `CalendarEvent`.
- Produces: `<MonthGrid referenceDate={Date} events={CalendarEvent[]} onClickDay={...} onClickEvent={...} onMoveEventToDay={...} />`.

- [ ] **Step 1: Criar `src/domains/agenda/components/MonthGrid.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { cn } from '../../../lib/utils';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  referenceDate: Date;
  events: CalendarEvent[];
  onClickEvent: (event: CalendarEvent) => void;
  onCreateOnDay: (day: Date) => void;
  onMoveEventToDay: (event: CalendarEvent, day: Date) => void;
}

function buildMonthGrid(reference: Date): Date[] {
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const startOffset = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MAX_VISIBLE_PER_DAY = 3;

export const MonthGrid: React.FC<Props> = ({ referenceDate, events, onClickEvent, onCreateOnDay, onMoveEventToDay }) => {
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const days = useMemo(() => buildMonthGrid(referenceDate), [referenceDate]);
  const today = new Date();

  return (
    <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-px bg-white/5 overflow-hidden">
      {days.map((day, i) => {
        const dayEvents = events.filter(ev => isSameDay(new Date(ev.startAt), day));
        const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
        const hiddenCount = dayEvents.length - visible.length;
        const key = day.toISOString();

        return (
          <div
            key={key}
            onDoubleClick={() => onCreateOnDay(day)}
            onDragOver={e => { e.preventDefault(); setDragOverDay(key); }}
            onDragLeave={() => setDragOverDay(prev => (prev === key ? null : prev))}
            onDrop={e => {
              e.preventDefault();
              setDragOverDay(null);
              const eventId = e.dataTransfer.getData('text/plain');
              const dragged = events.find(ev => ev.id === eventId);
              if (dragged) onMoveEventToDay(dragged, day);
            }}
            className={cn(
              'bg-[#141414] p-1.5 overflow-hidden flex flex-col gap-0.5',
              day.getMonth() !== referenceDate.getMonth() && 'opacity-40',
              dragOverDay === key && 'ring-1 ring-inset ring-blue-400/60 bg-blue-500/5',
            )}
          >
            <span className={cn(
              'text-[11px] w-5 h-5 flex items-center justify-center rounded-full shrink-0',
              isSameDay(day, today) ? 'bg-blue-600 text-white font-semibold' : 'text-white/50',
            )}>
              {day.getDate()}
            </span>
            <div className="flex flex-col gap-0.5 overflow-hidden">
              {visible.map(event => (
                <button
                  key={event.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', event.id)}
                  onClick={() => onClickEvent(event)}
                  className="text-left text-[10px] px-1 py-0.5 rounded bg-blue-600/60 hover:bg-blue-600/80 text-white truncate transition-colors"
                >
                  {event.allDay ? '' : `${new Date(event.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} `}
                  {event.title}
                </button>
              ))}
              {hiddenCount > 0 && (
                <span className="text-[9px] text-white/30 px-1">+{hiddenCount} mais</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Ligar o `MonthGrid` no `AgendaPage.tsx`**

Importar:

```ts
import { MonthGrid } from './components/MonthGrid';
```

Trocar o placeholder `Visão Mês — Task 11` por:

```tsx
            <MonthGrid
              referenceDate={new Date(state.currentDate)}
              events={state.events}
              onClickEvent={event => {
                // eslint-disable-next-line no-alert
                window.alert(`${event.title}\n${new Date(event.startAt).toLocaleString('pt-BR')}`);
              }}
              onCreateOnDay={day => {
                // eslint-disable-next-line no-alert
                const title = window.prompt('Título do evento:');
                if (!title || !title.trim()) return;
                const start = new Date(day); start.setHours(9, 0, 0, 0);
                const end = new Date(day); end.setHours(10, 0, 0, 0);
                createEvent({ title: title.trim(), startAt: start.toISOString(), endAt: end.toISOString(), allDay: false });
              }}
              onMoveEventToDay={(event, day) => {
                const start = new Date(event.startAt);
                const end = new Date(event.endAt);
                const durationMs = end.getTime() - start.getTime();
                const newStart = new Date(day);
                newStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
                updateEvent(event.id, {
                  startAt: newStart.toISOString(),
                  endAt: new Date(newStart.getTime() + durationMs).toISOString(),
                });
              }}
            />
```

(mesma nota da Task 10: `window.prompt`/`window.alert` aqui são substituídos pelo `EventEditorModal`/`EventPopover` reais na Task 12.)

- [ ] **Step 3: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add src/domains/agenda/components/MonthGrid.tsx src/domains/agenda/AgendaPage.tsx
git commit -m "feat: visão Mês da Agenda com mover evento entre dias por drag-and-drop"
```

---

### Task 12: `EventPopover.tsx` + `EventEditorModal.tsx`

**Files:**
- Create: `src/domains/agenda/components/EventPopover.tsx`
- Create: `src/domains/agenda/components/EventEditorModal.tsx`
- Modify: `src/domains/agenda/AgendaPage.tsx`

**Interfaces:**
- Consumes: `useAgenda()` (Task 7), `CalendarEvent`.
- Produces: componentes reais que substituem os `window.prompt`/`window.alert` das Tasks 10/11.

- [ ] **Step 1: Criar `src/domains/agenda/components/EventPopover.tsx`**

```tsx
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, X } from 'lucide-react';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  event: CalendarEvent;
  anchorRect: { top: number; left: number; bottom: number };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Mesma técnica já usada no menu de "Mover para" do EmailListItem (createPortal em
// document.body + position:fixed calculada a partir do retângulo real do elemento) —
// evita cair na armadilha de stacking context de ancestrais com transform (grade com
// scroll, blocos de evento com posicionamento absoluto).
export const EventPopover: React.FC<Props> = ({ event, anchorRect, onClose, onEdit, onDelete }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      className="fixed z-50 w-64 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl py-2"
      style={{ top: anchorRect.bottom + 4, left: anchorRect.left }}
    >
      <div className="flex items-start justify-between px-3 pb-2 border-b border-white/5">
        <div>
          <p className="text-white/85 text-sm font-medium">{event.title}</p>
          <p className="text-white/40 text-xs mt-0.5">
            {new Date(event.startAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            {' – '}
            {new Date(event.endAt).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}
          </p>
          {event.location && <p className="text-white/40 text-xs mt-0.5">{event.location}</p>}
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={onEdit}
        className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" /> Editar
      </button>
      <button
        onClick={onDelete}
        className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-red-400/80 hover:bg-white/5 hover:text-red-400 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Excluir
      </button>
    </div>,
    document.body,
  );
};
```

- [ ] **Step 2: Criar `src/domains/agenda/components/EventEditorModal.tsx`**

```tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CalendarEvent, CreateEventPayload } from '../../../services/AgendaService';

interface Props {
  initial?: CalendarEvent;
  defaultStartAt?: Date;
  defaultEndAt?: Date;
  onClose: () => void;
  onSave: (payload: Omit<CreateEventPayload, 'userId' | 'accountId'>) => void;
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const EventEditorModal: React.FC<Props> = ({ initial, defaultStartAt, defaultEndAt, onClose, onSave }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [startAt, setStartAt] = useState(toLocalInputValue(new Date(initial?.startAt ?? defaultStartAt ?? new Date())));
  const [endAt, setEndAt] = useState(toLocalInputValue(new Date(initial?.endAt ?? defaultEndAt ?? new Date(Date.now() + 60 * 60000))));

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      allDay,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-[#161616]">
          <h2 className="text-white/85 text-sm font-semibold">{initial ? 'Editar evento' : 'Novo evento'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-blue-500/50"
          />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Local"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-blue-500/50"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrição"
            rows={3}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-blue-500/50 resize-none"
          />
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="accent-blue-500" />
            Dia inteiro
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-white/40 uppercase">Início</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? startAt.slice(0, 10) : startAt}
                onChange={e => setStartAt(allDay ? `${e.target.value}T00:00` : e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/85 outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-white/40 uppercase">Fim</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? endAt.slice(0, 10) : endAt}
                onChange={e => setEndAt(allDay ? `${e.target.value}T00:00` : e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/85 outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/8 bg-[#161616]">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Substituir os `window.prompt`/`window.alert` no `AgendaPage.tsx`**

Em `src/domains/agenda/AgendaPage.tsx`:

1. Importar os dois componentes novos e `useState`:

```ts
import { useState } from 'react';
import { EventPopover } from './components/EventPopover';
import { EventEditorModal } from './components/EventEditorModal';
import type { CalendarEvent } from '../../services/AgendaService';
```

2. Trocar a linha de desestruturação do `useAgenda()` (já existente desde a Task 10) pra incluir `deleteEvent`:

```tsx
  const { state, selectAccount, setView, navigate, goToDate, createEvent, updateEvent, deleteEvent } = useAgenda();
```

E adicionar estado local novo (dentro do componente `AgendaPage`):

```tsx
  const [popover, setPopover] = useState<{ event: CalendarEvent; rect: { top: number; left: number; bottom: number } } | null>(null);
  const [editorState, setEditorState] = useState<
    | { mode: 'create'; startAt: Date; endAt: Date }
    | { mode: 'edit'; event: CalendarEvent }
    | null
  >(null);
```

3. No `TimeGrid`, trocar `onClickEvent`/`onCreateRange` (removendo os `window.*`):

```tsx
              onCreateRange={(startAt, endAt) => setEditorState({ mode: 'create', startAt, endAt })}
              ...
              onClickEvent={(event, anchorEl) => {
                const rect = anchorEl.getBoundingClientRect();
                setPopover({ event, rect: { top: rect.top, left: rect.left, bottom: rect.bottom } });
              }}
```

4. No `MonthGrid`, mesma troca:

```tsx
              onClickEvent={event => setPopover({ event, rect: { top: 200, left: 200, bottom: 220 } })}
              onCreateOnDay={day => {
                const start = new Date(day); start.setHours(9, 0, 0, 0);
                const end = new Date(day); end.setHours(10, 0, 0, 0);
                setEditorState({ mode: 'create', startAt: start, endAt: end });
              }}
```

(Nota: clique num evento do `MonthGrid` usa uma posição fixa aproximada pro popover em vez do retângulo real do botão, porque `MonthGrid` não repassa o elemento clicado — se quiser a posição exata, ajustar `onClickEvent` do `MonthGrid` pra receber `(event, e: React.MouseEvent)` e usar `e.currentTarget.getBoundingClientRect()`, igual ao `TimeGrid`. Deixado simplificado aqui pra não inflar mais o componente; funciona, só não fica pixel-perfect.)

5. Renderizar os componentes no final do JSX do `AgendaPage` (antes do fechamento da `</div>` mais externa):

```tsx
      {popover && (
        <EventPopover
          event={popover.event}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
          onEdit={() => { setEditorState({ mode: 'edit', event: popover.event }); setPopover(null); }}
          onDelete={() => { deleteEvent(popover.event.id); setPopover(null); }}
        />
      )}

      {editorState && (
        <EventEditorModal
          initial={editorState.mode === 'edit' ? editorState.event : undefined}
          defaultStartAt={editorState.mode === 'create' ? editorState.startAt : undefined}
          defaultEndAt={editorState.mode === 'create' ? editorState.endAt : undefined}
          onClose={() => setEditorState(null)}
          onSave={payload => {
            if (editorState.mode === 'edit') updateEvent(editorState.event.id, payload);
            else createEvent(payload);
            setEditorState(null);
          }}
        />
      )}
```

- [ ] **Step 4: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add src/domains/agenda/components/EventPopover.tsx src/domains/agenda/components/EventEditorModal.tsx src/domains/agenda/AgendaPage.tsx
git commit -m "feat: popover e formulário de evento reais, substituindo window.prompt/alert temporários"
```

---

### Task 13: Verificação manual + build + deploy

**Files:** nenhum arquivo novo — só verificação e publicação.

- [ ] **Step 1: Rodar a suíte completa e o typecheck uma última vez**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tudo passa

- [ ] **Step 2: Build local**

```bash
npm run build
```

Expected: build sem erros. Depois, restaurar `dist/` pro estado versionado:

```bash
git checkout -- dist/ && git clean -fd dist/
git status --porcelain
```

Expected: só os arquivos de `_api/**` e `src/**` das tasks anteriores aparecem staged — nada em `dist/`.

- [ ] **Step 3: Configurar as variáveis de ambiente de reautorização no Railway**

`GMAIL_CALENDAR_REDIRECT_URI` e `MICROSOFT_CALENDAR_REDIRECT_URI` (Task 4) precisam existir no Railway antes do deploy, apontando pra `https://michelin-crm-backend-production.up.railway.app/api/email/auth/{gmail,microsoft}/calendar-callback`. Também precisam estar cadastradas como redirect URI válida no Google Cloud Console (OAuth client) e no Azure App Registration — sem isso, o provedor recusa o callback com "redirect_uri_mismatch".

- [ ] **Step 4: Push da branch e deploy**

```bash
git push origin feat/postgres-migration
railway up --detach   # backend (schema, endpoints, OAuth) — Vercel não serve _api/**
```

Depois, deploy do frontend:

```bash
export VERCEL_TOKEN=$(grep "^VERCEL_TOKEN=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
vercel deploy --prod --token "$VERCEL_TOKEN" --yes
```

- [ ] **Step 5: Verificação manual contra a conta Microsoft real de produção**

1. Abrir `/agenda`, selecionar a conta Microsoft (`michelinseguros@hotmail.com`) — confirmar que aparece a tela "Conectar calendário desta conta" (ainda não tem `calendarScopeGranted`).
2. Clicar em "Conectar calendário" → completar o consentimento do Microsoft → confirmar que volta pra `/agenda` e a grade aparece (não a tela de conectar de novo).
3. Na visão Semana de Trabalho, clicar e arrastar num horário vazio → preencher um título → confirmar que o evento aparece na posição certa.
4. Arrastar o evento criado pra outro horário → confirmar que a mudança persiste ao recarregar a página.
5. Arrastar a borda de baixo do evento pra aumentar a duração → confirmar que persiste.
6. Trocar pra visão Mês → confirmar que o mesmo evento aparece na célula do dia certo.
7. Arrastar o evento (visão Mês) pra outro dia → confirmar que move.
8. Clicar no evento → abrir o popover → "Editar" → mudar o título → salvar → confirmar.
9. Excluir o evento pelo popover → confirmar que some da grade.
10. Selecionar "Calendário local" → criar um evento ali → confirmar que ele **não** aparece quando a conta Microsoft está selecionada (isolamento entre "contas" da agenda).

Se houver uma conta Gmail disponível, repetir pelo menos os passos 1-4 nela também.

- [ ] **Step 6: Limpeza**

Se o passo 5 criou eventos de teste reais na conta Microsoft/Google, excluí-los pelo próprio popover (passo 9) antes de encerrar — não deixar lixo de teste na agenda real do usuário.
