import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/pgData.js', () => ({
  fsGet: vi.fn(),
}));
vi.mock('../../lib/gmailClient.js', () => ({
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  renameLabel: vi.fn(),
  deleteLabel: vi.fn(),
  listAllMessageIds: vi.fn(),
  modifyMessage: vi.fn(),
  trashMessage: vi.fn(),
  deleteMessagePermanently: vi.fn(),
}));
vi.mock('../../lib/microsoftClient.js', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  listAllMessageIds: vi.fn(),
  updateMessage: vi.fn(),
  moveMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));
vi.mock('../../lib/imapClient.js', () => ({
  listFoldersTree: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  markAllRead: vi.fn(),
  moveAllMessages: vi.fn(),
  deleteAllMessages: vi.fn(),
}));

import { fsGet } from '../../lib/pgData.js';
import * as gmail from '../../lib/gmailClient.js';
import * as ms from '../../lib/microsoftClient.js';
import * as imap from '../../lib/imapClient.js';
import handler from '../folders.js';

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('_api/email/folders handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST cria pasta customizada (Microsoft)', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft' });
    (ms.createFolder as any).mockResolvedValue({ id: 'AAA', name: 'Projetos' });
    const req = { method: 'POST', url: '/api/email/folders', body: { accountId: 'acc1', name: 'Projetos', parentId: null } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.createFolder).toHaveBeenCalledWith({ provider: 'microsoft' }, 'Projetos', null);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ folder: { id: 'AAA', name: 'Projetos' } });
  });

  it('POST criar pasta com pai fixo no Gmail normaliza pra parentId null (Gmail não aninha sob Inbox)', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail' });
    (gmail.createLabel as any).mockResolvedValue({ id: 'Label_1', name: 'Recibos' });
    const req = { method: 'POST', url: '/api/email/folders', body: { accountId: 'acc1', name: 'Recibos', parentId: 'inbox' } };
    const res = makeRes();

    await handler(req, res);

    expect(gmail.createLabel).toHaveBeenCalledWith({ provider: 'gmail' }, 'Recibos', null);
  });

  it('PATCH renomeia pasta customizada', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft' });
    const req = { method: 'PATCH', url: '/api/email/folders/AAA', params: { id: 'AAA' }, body: { accountId: 'acc1', name: 'Novo Nome' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.renameFolder).toHaveBeenCalledWith({ provider: 'microsoft' }, 'AAA', 'Novo Nome');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('PATCH recusa renomear pasta de sistema', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft' });
    const req = { method: 'PATCH', url: '/api/email/folders/inbox', params: { id: 'inbox' }, body: { accountId: 'acc1', name: 'Novo Nome' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.renameFolder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('DELETE recusa excluir pasta de sistema (inclusive alias "archived")', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft' });
    const req = { method: 'DELETE', url: '/api/email/folders/archived', params: { id: 'archived' }, query: { accountId: 'acc1' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.deleteFolder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('POST .../empty em "archived" normaliza pra "archive" antes de listar mensagens (Gmail) e move pra trash (não permanente)', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail' });
    (gmail.listAllMessageIds as any).mockResolvedValue(['m1', 'm2']);
    const req = { method: 'POST', url: '/api/email/folders/archived/empty', params: { id: 'archived' }, body: { accountId: 'acc1' } };
    const res = makeRes();

    await handler(req, res);

    expect(gmail.listAllMessageIds).toHaveBeenCalledWith({ provider: 'gmail' }, 'archive');
    expect(gmail.trashMessage).toHaveBeenCalledTimes(2);
    expect(gmail.deleteMessagePermanently).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('POST .../empty em "spam" exclui definitivamente (Microsoft)', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft' });
    (ms.listAllMessageIds as any).mockResolvedValue(['m1']);
    const req = { method: 'POST', url: '/api/email/folders/spam/empty', params: { id: 'spam' }, body: { accountId: 'acc1' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.deleteMessage).toHaveBeenCalledWith({ provider: 'microsoft' }, 'm1');
    expect(ms.moveMessage).not.toHaveBeenCalled();
  });

  it('POST .../empty numa pasta customizada IMAP chama moveAllMessages pra trash', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'imap' });
    const req = { method: 'POST', url: '/api/email/folders/Projetos/empty', params: { id: 'Projetos' }, body: { accountId: 'acc1' } };
    const res = makeRes();

    await handler(req, res);

    expect(imap.moveAllMessages).toHaveBeenCalledWith({ provider: 'imap' }, 'Projetos', 'trash');
    expect(imap.deleteAllMessages).not.toHaveBeenCalled();
  });

  it('POST .../read-all marca todas as mensagens da pasta como lidas (Gmail)', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail' });
    (gmail.listAllMessageIds as any).mockResolvedValue(['m1', 'm2']);
    const req = { method: 'POST', url: '/api/email/folders/inbox/read-all', params: { id: 'inbox' }, body: { accountId: 'acc1' } };
    const res = makeRes();

    await handler(req, res);

    expect(gmail.modifyMessage).toHaveBeenCalledWith({ provider: 'gmail' }, 'm1', [], ['UNREAD']);
    expect(gmail.modifyMessage).toHaveBeenCalledWith({ provider: 'gmail' }, 'm2', [], ['UNREAD']);
  });

  it('GET continua listando pastas (comportamento existente preservado)', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'imap' });
    (imap.listFoldersTree as any).mockResolvedValue([{ id: 'Projetos', name: 'Projetos', parentId: null, unreadCount: 0 }]);
    const req = { method: 'GET', url: '/api/email/folders', query: { accountId: 'acc1' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ folders: [{ id: 'Projetos', name: 'Projetos', parentId: null, unreadCount: 0 }] });
  });
});
