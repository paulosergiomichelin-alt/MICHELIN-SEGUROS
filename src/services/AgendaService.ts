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

async function toJsonOrThrow(r: Response): Promise<any> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error ?? `Agenda request failed: ${r.status}`);
  }
  return r.json();
}

export const AgendaService = {
  getEvents: (userId: string, accountId: string, from: string, to: string): Promise<GetEventsResponse> =>
    fetch(
      `/api/calendar/events?userId=${encodeURIComponent(userId)}&accountId=${encodeURIComponent(accountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ).then(toJsonOrThrow),

  createEvent: (payload: CreateEventPayload): Promise<{ id: string; success: boolean }> =>
    fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(toJsonOrThrow),

  updateEvent: (id: string, payload: UpdateEventPayload): Promise<{ success: boolean }> =>
    fetch(`/api/calendar/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(toJsonOrThrow),

  deleteEvent: (id: string): Promise<{ success: boolean }> =>
    fetch(`/api/calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(toJsonOrThrow),

  getCalendarConnectUrl: (provider: 'gmail' | 'microsoft', accountId: string, returnUrl: string): string =>
    `/api/email/auth/${provider}/calendar-init?accountId=${encodeURIComponent(accountId)}&returnUrl=${encodeURIComponent(returnUrl)}`,
};
