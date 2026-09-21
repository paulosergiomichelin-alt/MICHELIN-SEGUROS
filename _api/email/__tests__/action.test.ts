import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/pgData.js', () => ({ fsGet: vi.fn() }));
vi.mock('../../lib/emailCache.js', () => ({
  getEmail: vi.fn(),
  updateEmail: vi.fn(),
  removeEmail: vi.fn(),
  setEmail: vi.fn(),
}));
vi.mock('../../lib/socketRegistry.js', () => ({ emitGlobal: vi.fn() }));
vi.mock('../../lib/gmailClient.js', () => ({
  modifyMessage: vi.fn(),
  trashMessage: vi.fn(),
  untrashMessage: vi.fn(),
  FOLDER_LABEL_MAP: { inbox: ['INBOX'], sent: ['SENT'], drafts: ['DRAFT'], trash: ['TRASH'], spam: ['SPAM'], archive: [] },
}));
vi.mock('../../lib/microsoftClient.js', () => ({
  updateMessage: vi.fn(),
  moveMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));
vi.mock('../../lib/imapClient.js', () => ({
  modifyMessage: vi.fn(),
  moveMessage: vi.fn(),
  deleteMessage: vi.fn(),
  imapUid: (id: string) => id.includes(':') ? id.split(':')[1] : id,
  imapCacheFolder: (id: string) => id.includes(':') ? id.split(':')[0] : undefined,
}));

import { fsGet } from '../../lib/pgData.js';
import { getEmail } from '../../lib/emailCache.js';
import * as gmail from '../../lib/gmailClient.js';
import * as ms from '../../lib/microsoftClient.js';
import * as imap from '../../lib/imapClient.js';
import handler from '../action.js';

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('_api/email/action — move e notspam', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notspam no Gmail adiciona INBOX e remove SPAM', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail', userId: 'u1' });
    (getEmail as any).mockReturnValue({ folder: 'spam' });
    const req = { method: 'POST', userId: 'u1', body: { accountId: 'acc1', messageId: 'm1', action: 'notspam' } };
    const res = makeRes();

    await handler(req, res);

    expect(gmail.modifyMessage).toHaveBeenCalledWith({ provider: 'gmail', userId: 'u1' }, 'm1', ['INBOX'], ['SPAM']);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('notspam no Microsoft move pra inbox', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft', userId: 'u1' });
    (getEmail as any).mockReturnValue({ folder: 'spam' });
    const req = { method: 'POST', userId: 'u1', body: { accountId: 'acc1', messageId: 'm1', action: 'notspam' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.moveMessage).toHaveBeenCalledWith({ provider: 'microsoft', userId: 'u1' }, 'm1', 'inbox');
  });

  it('move exige targetFolderId', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail', userId: 'u1' });
    const req = { method: 'POST', userId: 'u1', body: { accountId: 'acc1', messageId: 'm1', action: 'move' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(gmail.modifyMessage).not.toHaveBeenCalled();
  });

  it('move no Gmail remove o label da pasta de origem e adiciona o de destino', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail', userId: 'u1' });
    (getEmail as any).mockReturnValue({ folder: 'inbox' });
    const req = {
      method: 'POST', userId: 'u1',
      body: { accountId: 'acc1', messageId: 'm1', action: 'move', sourceFolderId: 'inbox', targetFolderId: 'Label_9' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(gmail.modifyMessage).toHaveBeenCalledWith({ provider: 'gmail', userId: 'u1' }, 'm1', ['Label_9'], ['INBOX']);
  });

  it('move no Gmail com sourceFolderId "archived" normaliza pra "archive" (sem label pra remover)', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail', userId: 'u1' });
    (getEmail as any).mockReturnValue({ folder: 'archive' });
    const req = {
      method: 'POST', userId: 'u1',
      body: { accountId: 'acc1', messageId: 'm1', action: 'move', sourceFolderId: 'archived', targetFolderId: 'Label_9' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(gmail.modifyMessage).toHaveBeenCalledWith({ provider: 'gmail', userId: 'u1' }, 'm1', ['Label_9'], []);
  });

  it('move no Microsoft chama moveMessage direto com o destino informado', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft', userId: 'u1' });
    (getEmail as any).mockReturnValue({ folder: 'inbox' });
    const req = {
      method: 'POST', userId: 'u1',
      body: { accountId: 'acc1', messageId: 'm1', action: 'move', targetFolderId: 'AAA-BBB' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(ms.moveMessage).toHaveBeenCalledWith({ provider: 'microsoft', userId: 'u1' }, 'm1', 'AAA-BBB');
  });

  it('move no IMAP usa sourceFolderId como pasta de origem, não a do cache', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'imap', userId: 'u1' });
    (getEmail as any).mockReturnValue(undefined);
    const req = {
      method: 'POST', userId: 'u1',
      body: { accountId: 'acc1', messageId: 'inbox:42', action: 'move', sourceFolderId: 'inbox', targetFolderId: 'Projetos' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(imap.moveMessage).toHaveBeenCalledWith({ provider: 'imap', userId: 'u1' }, 'inbox', '42', 'Projetos');
  });
});
