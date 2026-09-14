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

// O Graph exige que `dateTime` seja a hora de parede NA timeZone informada, sem
// sufixo UTC ("Z") — nossos startAt/endAt internos são instantes UTC. Mandar o "Z"
// junto com timeZone faz o Graph interpretar os dígitos literalmente como hora local,
// ignorando o "Z" (ex.: meia-noite de São Paulo em UTC vira "03:00:00Z", que o Graph lê
// como 03:00 local — não meia-noite). Pra evento de dia inteiro isso é rejeitado
// explicitamente ("Event.Start property for an all-day event needs to be set to
// midnight"); pra evento com hora, silenciosamente desloca o horário.
function toGraphDateTime(iso: string, timezone: string, allDay: boolean): string {
  const date = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  if (allDay) return `${get('year')}-${get('month')}-${get('day')}T00:00:00.0000000`;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.0000000`;
}

export async function createEvent(account: MicrosoftAccount, input: CalendarEventInput): Promise<MsCalendarEvent> {
  const payload: any = {
    subject: input.title,
    body: { contentType: 'text', content: input.description ?? '' },
    isAllDay: input.allDay,
    start: { dateTime: toGraphDateTime(input.startAt, input.timezone, input.allDay), timeZone: input.timezone },
    end: { dateTime: toGraphDateTime(input.endAt, input.timezone, input.allDay), timeZone: input.timezone },
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
    payload.start = { dateTime: toGraphDateTime(input.startAt, input.timezone, Boolean(input.allDay)), timeZone: input.timezone };
  }
  if (input.endAt !== undefined && input.timezone !== undefined) {
    payload.end = { dateTime: toGraphDateTime(input.endAt, input.timezone, Boolean(input.allDay)), timeZone: input.timezone };
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
