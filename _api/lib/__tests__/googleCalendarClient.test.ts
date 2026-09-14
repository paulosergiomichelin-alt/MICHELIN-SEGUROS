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

  it('createEvent monta payload com date quando é dia inteiro (end.date exclusivo, um dia depois do start)', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      expect(body.start).toEqual({ date: '2026-01-10' });
      expect(body.end).toEqual({ date: '2026-01-11' });
      return { ok: true, status: 200, json: async () => ({ id: 'ev3' }) };
    }) as any;

    // EventEditorModal manda startAt === endAt (mesma data de calendário) pra um evento
    // de dia inteiro de um dia só — cabe ao client somar o dia extra que o Google exige
    // em end.date. '...T03:00:00.000Z' é meia-noite local em America/Sao_Paulo (UTC-3).
    await createEvent(makeAccount(), {
      title: 'Feriado', startAt: '2026-01-10T03:00:00.000Z', endAt: '2026-01-10T03:00:00.000Z',
      allDay: true, timezone: 'America/Sao_Paulo',
    });
  });

  it('createEvent de dia inteiro em fuso positivo usa a data LOCAL, não a data UTC', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      // '2026-01-09T15:00:00.000Z' é 00:00 do dia 10 em Asia/Tokyo (UTC+9) — a data em
      // UTC (9) e a data local (10) divergem, exatamente o caso que .slice(0, 10) errava.
      expect(body.start).toEqual({ date: '2026-01-10' });
      expect(body.end).toEqual({ date: '2026-01-11' });
      return { ok: true, status: 200, json: async () => ({ id: 'ev4' }) };
    }) as any;

    await createEvent(makeAccount(), {
      title: 'Feriado JP', startAt: '2026-01-09T15:00:00.000Z', endAt: '2026-01-09T15:00:00.000Z',
      allDay: true, timezone: 'Asia/Tokyo',
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
