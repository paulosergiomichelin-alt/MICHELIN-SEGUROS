import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../emailEncryption.js', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  list: vi.fn(),
  mailboxCreate: vi.fn(),
  mailboxRename: vi.fn(),
  mailboxDelete: vi.fn(),
  getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
  messageFlagsAdd: vi.fn().mockResolvedValue(true),
  messageMove: vi.fn().mockResolvedValue({}),
  messageDelete: vi.fn().mockResolvedValue(true),
  mailbox: { exists: 5 },
};

vi.mock('imapflow', () => ({
  // Arrow functions não são "construtíveis" (new arrow() lança TypeError) — o
  // ImapFlow real é instanciado com `new`, então o mock precisa de uma function
  // expression normal.
  ImapFlow: vi.fn(function ImapFlowMock() { return mockClient; }),
}));

import {
  createFolder, renameFolder, deleteFolder, markAllRead, moveAllMessages, deleteAllMessages,
  ImapAccount,
} from '../imapClient.js';

function makeAccount(): ImapAccount {
  return {
    id: 'acc1', userId: 'u1', email: 'a@b.com', provider: 'imap',
    imapHost: 'imap.example.com', imapPort: 993, imapSecure: true,
    username: 'a@b.com', passwordEncrypted: 'pw',
  };
}

describe('imapClient — pastas e operações nativas em lote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.logout.mockResolvedValue(undefined);
    mockClient.getMailboxLock.mockResolvedValue({ release: vi.fn() });
    mockClient.messageFlagsAdd.mockResolvedValue(true);
    mockClient.messageMove.mockResolvedValue({});
    mockClient.messageDelete.mockResolvedValue(true);
    mockClient.mailbox = { exists: 5 };
  });

  it('createFolder cria na raiz (string) quando parentId é null', async () => {
    mockClient.mailboxCreate.mockResolvedValue({ path: 'Projetos', created: true });
    const result = await createFolder(makeAccount(), 'Projetos', null);
    expect(mockClient.mailboxCreate).toHaveBeenCalledWith('Projetos');
    expect(result).toEqual({ id: 'Projetos', name: 'Projetos' });
  });

  it('createFolder resolve chave fixa de pai via resolveFolderPath (especial-use) e cria com array [pai, nome]', async () => {
    mockClient.list.mockResolvedValue([
      { path: 'INBOX', specialUse: undefined, delimiter: '/' },
    ]);
    mockClient.mailboxCreate.mockResolvedValue({ path: 'INBOX/Recibos', created: true });

    const result = await createFolder(makeAccount(), 'Recibos', 'inbox');
    expect(mockClient.mailboxCreate).toHaveBeenCalledWith(['INBOX', 'Recibos']);
    expect(result).toEqual({ id: 'INBOX/Recibos', name: 'Recibos' });
  });

  it('renameFolder preserva o parentPath ao renomear pasta aninhada', async () => {
    mockClient.list.mockResolvedValue([
      { path: 'Projetos/ClienteX', parentPath: 'Projetos', delimiter: '/' },
    ]);
    mockClient.mailboxRename.mockResolvedValue({ path: 'Projetos/ClienteX', newPath: 'Projetos/ClienteY' });

    const result = await renameFolder(makeAccount(), 'Projetos/ClienteX', 'ClienteY');
    expect(mockClient.mailboxRename).toHaveBeenCalledWith('Projetos/ClienteX', ['Projetos', 'ClienteY']);
    expect(result).toEqual({ id: 'Projetos/ClienteY' });
  });

  it('renameFolder usa string simples quando a pasta é raiz', async () => {
    mockClient.list.mockResolvedValue([{ path: 'Projetos', parentPath: null, delimiter: '/' }]);
    mockClient.mailboxRename.mockResolvedValue({ path: 'Projetos', newPath: 'Trabalho' });

    await renameFolder(makeAccount(), 'Projetos', 'Trabalho');
    expect(mockClient.mailboxRename).toHaveBeenCalledWith('Projetos', 'Trabalho');
  });

  it('deleteFolder chama mailboxDelete com o path', async () => {
    mockClient.mailboxDelete.mockResolvedValue({ path: 'Projetos' });
    await deleteFolder(makeAccount(), 'Projetos');
    expect(mockClient.mailboxDelete).toHaveBeenCalledWith('Projetos');
  });

  it('markAllRead aplica STORE em lote (1:*) e não faz nada se a pasta está vazia', async () => {
    await markAllRead(makeAccount(), 'inbox');
    expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith('1:*', ['\\Seen']);

    mockClient.messageFlagsAdd.mockClear();
    mockClient.mailbox = { exists: 0 };
    await markAllRead(makeAccount(), 'inbox');
    expect(mockClient.messageFlagsAdd).not.toHaveBeenCalled();
  });

  it('moveAllMessages move tudo (1:*) para o path resolvido da pasta de destino', async () => {
    // Sem special-use configurado no mock, resolveFolderPath('trash') cai no fallback
    // hardcoded (FOLDER_PATH_MAP.trash = 'Trash') — é esse path resolvido que
    // messageMove recebe, não a chave interna 'trash'.
    mockClient.list.mockResolvedValue([]);
    await moveAllMessages(makeAccount(), 'inbox', 'trash');
    expect(mockClient.messageMove).toHaveBeenCalledWith('1:*', 'Trash');
  });

  it('deleteAllMessages marca \\Deleted em lote e expurga', async () => {
    await deleteAllMessages(makeAccount(), 'trash');
    expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith('1:*', ['\\Deleted']);
    expect(mockClient.messageDelete).toHaveBeenCalledWith('1:*');
  });
});
