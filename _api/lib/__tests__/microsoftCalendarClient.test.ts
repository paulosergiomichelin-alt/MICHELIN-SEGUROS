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

  it('createEvent monta payload no formato do Graph (converte instante UTC pra hora de parede na timeZone)', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('me/events');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      // startAt/endAt reais chegam como instante UTC (ex.: new Date().toISOString() no
      // frontend) — America/Sao_Paulo é UTC-3 o ano todo (sem horário de verão desde
      // 2019), então 14:00Z/15:00Z viram 11:00/12:00 na hora de parede local.
      expect(body).toEqual({
        subject: 'Reunião',
        body: { contentType: 'text', content: '' },
        isAllDay: false,
        start: { dateTime: '2026-01-10T11:00:00.0000000', timeZone: 'America/Sao_Paulo' },
        end: { dateTime: '2026-01-10T12:00:00.0000000', timeZone: 'America/Sao_Paulo' },
      });
      return { ok: true, status: 200, json: async () => ({ id: 'ev2' }) };
    }) as any;

    await createEvent(makeAccount(), {
      title: 'Reunião', startAt: '2026-01-10T14:00:00.000Z', endAt: '2026-01-10T15:00:00.000Z',
      allDay: false, timezone: 'America/Sao_Paulo',
    });
  });

  it('createEvent de dia inteiro força a hora pra meia-noite local (exigência do Graph)', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      expect(body.isAllDay).toBe(true);
      expect(body.start).toEqual({ dateTime: '2026-01-10T00:00:00.0000000', timeZone: 'America/Sao_Paulo' });
      expect(body.end).toEqual({ dateTime: '2026-01-11T00:00:00.0000000', timeZone: 'America/Sao_Paulo' });
      return { ok: true, status: 200, json: async () => ({ id: 'ev3' }) };
    }) as any;

    // Meia-noite local em UTC-3 vira 03:00Z do mesmo dia — a data em UTC ainda bate
    // com a data local aqui porque o offset é negativo (America/Sao_Paulo).
    await createEvent(makeAccount(), {
      title: 'Feriado', startAt: '2026-01-10T03:00:00.000Z', endAt: '2026-01-11T03:00:00.000Z',
      allDay: true, timezone: 'America/Sao_Paulo',
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

  it('updateEvent com allDay=true formata start/end como meia-noite local', async () => {
    global.fetch = vi.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      expect(body.start).toEqual({ dateTime: '2026-01-10T00:00:00.0000000', timeZone: 'America/Sao_Paulo' });
      return { ok: true, status: 200, json: async () => ({ id: 'ev1' }) };
    }) as any;

    await updateEvent(makeAccount(), 'ev1', {
      startAt: '2026-01-10T03:00:00.000Z', allDay: true, timezone: 'America/Sao_Paulo',
    });
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
