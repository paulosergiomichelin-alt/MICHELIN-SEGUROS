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

  it('POST num provedor usa o MESMO esquema de id que a sincronização do GET (evita duplicar a linha)', async () => {
    (fsGet as any).mockResolvedValue({ id: 'acc1', provider: 'microsoft', calendarScopeGranted: true, userId: 'u1' });
    (ms.createEvent as any).mockResolvedValue({ id: 'mscal1' });
    const req = {
      method: 'POST',
      body: { userId: 'u1', accountId: 'acc1', title: 'Reunião', startAt: '2026-01-10T10:00:00', endAt: '2026-01-10T11:00:00', allDay: false },
    };
    const res = makeRes();

    await handler(req, res);

    // loadEventsFromProvider (chamado no próximo GET) faz fsSet('calendar_events',
    // `microsoft_${providerEventId}`, ...) — o POST precisa gravar sob o MESMO id,
    // senão o GET seguinte cria uma segunda linha pro mesmo evento.
    expect(fsSet).toHaveBeenCalledWith('calendar_events', 'microsoft_mscal1', expect.objectContaining({
      provider: 'microsoft', providerEventId: 'mscal1',
    }));
    expect(res.json).toHaveBeenCalledWith({ id: 'microsoft_mscal1', success: true });
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

  it('PATCH sem allDay/timezone no body usa o valor existente como fallback pro provedor', async () => {
    (fsGet as any).mockImplementation((collection: string) => {
      if (collection === 'calendar_events') {
        return Promise.resolve({ id: 'ev1', accountId: 'acc1', providerEventId: 'gcal1', allDay: true, timezone: 'America/Sao_Paulo' });
      }
      return Promise.resolve({ id: 'acc1', provider: 'gmail', calendarScopeGranted: true });
    });
    const req = { method: 'PATCH', params: { id: 'ev1' }, body: { startAt: '2026-01-10T03:00:00.000Z' } };
    const res = makeRes();

    await handler(req, res);

    expect(google.updateEvent).toHaveBeenCalledWith(expect.anything(), 'gcal1', expect.objectContaining({
      startAt: '2026-01-10T03:00:00.000Z', allDay: true, timezone: 'America/Sao_Paulo',
    }));
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
