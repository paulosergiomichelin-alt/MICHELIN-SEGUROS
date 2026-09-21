import { describe, it, expect, afterEach, vi } from 'vitest';
import { AgendaService } from '../AgendaService';

vi.mock('../../lib/dataApiClient', () => ({
  authHeader: vi.fn(async () => ({ Authorization: 'Bearer test-token', 'Content-Type': 'application/json' })),
}));

describe('AgendaService', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('getEvents monta a query string com accountId/from/to', async () => {
    let captured: string = '';
    global.fetch = vi.fn(async (url: any) => {
      captured = String(url);
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    }) as any;

    await AgendaService.getEvents('acc1', '2026-01-01', '2026-02-01');

    expect(captured).toContain('/api/calendar/events?');
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
      accountId: 'acc1', title: 'Reunião',
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
