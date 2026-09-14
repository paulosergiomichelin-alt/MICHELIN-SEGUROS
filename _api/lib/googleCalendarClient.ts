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

// Um evento de dia inteira usa {date: "YYYY-MM-DD"} no Google (sem hora nem timezone);
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
