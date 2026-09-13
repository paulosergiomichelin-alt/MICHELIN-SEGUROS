# Ações de Pasta e Mensagem no E-mail (Fase 2, complemento) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao módulo de e-mail: criar/renomear/excluir pasta, mover mensagem para pasta arbitrária (inclusive drag-and-drop), esvaziar pasta, marcar pasta inteira como lida, marcar mensagem individual como lida/não lida na lista, e "não é lixo eletrônico" — nos 3 provedores (Gmail, Microsoft, IMAP).

**Architecture:** Sem tabela Postgres nova — todas as operações batem direto no provedor (Gmail labels, Microsoft Graph `mailFolders`, IMAP `CREATE`/`RENAME`/`DELETE`/`STORE`/`MOVE` em lote), reaproveitando a árvore de pastas já buscada ao vivo (`GET /api/email/folders`). Operações de pasta ganham 4 novos verbos HTTP em `_api/email/folders.ts`; operações de mensagem ganham 2 novos valores de `action` em `_api/email/action.ts` (`move`, `notspam`). Backend roda em processo contínuo (Railway, `server.ts`), sem timeout de execução, então os loops de "esvaziar"/"marcar tudo como lido" em Gmail/Microsoft podem paginar a pasta inteira numa única requisição.

**Tech Stack:** TypeScript, Express (`server.ts`), Gmail REST API, Microsoft Graph API, `imapflow`, React 18, Vitest.

**Spec:** `docs/email-upgrade/SPEC.md` (seção 5.2, ADR-17). Este plano implementa exatamente o que está documentado ali.

## Global Constraints

- Pastas de sistema (`inbox`, `sent`, `drafts`, `trash`, `spam`, `archived`/`archive`) NUNCA podem ser renomeadas ou excluídas — só esvaziadas e marcadas como lidas.
- Esvaziar `trash` ou `spam` exclui as mensagens **definitivamente** (com confirmação no frontend antes de chamar a API). Esvaziar qualquer outra pasta **move** as mensagens para a Lixeira.
- O frontend usa a chave fixa `'archived'`, mas Gmail/Microsoft/IMAP usam `'archive'` internamente (`FIXED_KEY_ALIAS` já existe em `FolderNav.tsx` para a árvore) — todo código novo que recebe um `folderId` vindo do frontend deve normalizar `'archived'` → `'archive'` antes de repassar para os clients de provedor.
- Mover mensagem para uma das 6 pastas fixas (`inbox`/`sent`/`drafts`/`trash`/`spam`/`archived`) usa as ações já existentes (`restore`/`trash`/`spam`/`archive`) — a nova ação `move` (e o endpoint de criar pasta com pai fixo) só lida com pastas customizadas/descobertas de verdade (id real do provedor).
- Nenhuma tabela nova no Postgres. Nenhuma mudança em `drizzle/`.
- Todo código novo em `_api/**` usa `.js` nos imports relativos (ESM), igual ao resto do arquivo — confira o arquivo que está editando antes de escrever o import.
- Depois de cada task: `npx tsc --noEmit` e `npx vitest run` têm que passar limpos antes do commit.

---

### Task 1: Gmail — CRUD de pasta (label) + helpers de operação em massa

**Files:**
- Modify: `_api/lib/gmailClient.ts`
- Test: `_api/lib/__tests__/gmailClient.folders.test.ts`

**Interfaces:**
- Consumes: `gmailRequest(account, path, opts)` (já existe no mesmo arquivo), `listMessages(account, folder, maxResults, pageToken)` (já existe).
- Produces: `export const FOLDER_LABEL_MAP` (era `const` privado, agora exportado, mesmo shape `Record<string, string[]>`), `createLabel(account, name, parentId): Promise<{id, name}>`, `renameLabel(account, labelId, name): Promise<void>`, `deleteLabel(account, labelId): Promise<void>`, `deleteMessagePermanently(account, id): Promise<void>`, `listAllMessageIds(account, folder): Promise<string[]>`.

- [ ] **Step 1: Exportar `FOLDER_LABEL_MAP`**

Em `_api/lib/gmailClient.ts`, na linha do `const FOLDER_LABEL_MAP` (seção "Folder → labelId mapping"), trocar:

```ts
const FOLDER_LABEL_MAP: Record<string, string[]> = {
```

por:

```ts
export const FOLDER_LABEL_MAP: Record<string, string[]> = {
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `_api/lib/__tests__/gmailClient.folders.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../emailEncryption.js', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

import {
  createLabel, renameLabel, deleteLabel, deleteMessagePermanently, listAllMessageIds,
  GmailAccount,
} from '../gmailClient.js';

function makeAccount(): GmailAccount {
  return {
    id: 'acc1', userId: 'u1', email: 'a@b.com',
    accessToken: 'token', refreshToken: 'refresh',
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    provider: 'gmail',
  };
}

describe('gmailClient — pastas e operações em massa', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('createLabel cria label raiz quando parentId é null', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    global.fetch = vi.fn(async (url: any, opts: any) => {
      calls.push({ url: String(url), opts });
      return {
        ok: true, status: 200,
        json: async () => ({ id: 'Label_1', name: 'Projetos' }),
      };
    }) as any;

    const result = await createLabel(makeAccount(), 'Projetos', null);

    expect(result).toEqual({ id: 'Label_1', name: 'Projetos' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/users/me/labels');
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toMatchObject({ name: 'Projetos' });
  });

  it('createLabel prefixa o nome do pai quando parentId é informado', async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      call++;
      if (call === 1) {
        // busca o label pai pra pegar o nome completo
        expect(String(url)).toContain('/users/me/labels/Label_parent');
        return { ok: true, status: 200, json: async () => ({ id: 'Label_parent', name: 'Projetos' }) };
      }
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body).name).toBe('Projetos/ClienteX');
      return { ok: true, status: 200, json: async () => ({ id: 'Label_2', name: 'Projetos/ClienteX' }) };
    }) as any;

    const result = await createLabel(makeAccount(), 'ClienteX', 'Label_parent');
    expect(result).toEqual({ id: 'Label_2', name: 'ClienteX' });
  });

  it('renameLabel troca só o último segmento, preservando o prefixo do pai', async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      call++;
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ id: 'Label_2', name: 'Projetos/ClienteX' }) };
      }
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ name: 'Projetos/ClienteY' });
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    await renameLabel(makeAccount(), 'Label_2', 'ClienteY');
    expect(call).toBe(2);
  });

  it('deleteLabel chama DELETE no label certo', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/users/me/labels/Label_2');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteLabel(makeAccount(), 'Label_2');
  });

  it('deleteMessagePermanently chama DELETE na mensagem', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/users/me/messages/msg1');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteMessagePermanently(makeAccount(), 'msg1');
  });

  it('listAllMessageIds pagina até esgotar nextPageToken', async () => {
    let call = 0;
    global.fetch = vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' }) };
      }
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'c' }] }) };
    }) as any;

    const ids = await listAllMessageIds(makeAccount(), 'SPAM');
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(call).toBe(2);
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/lib/__tests__/gmailClient.folders.test.ts`
Expected: FAIL — `createLabel`, `renameLabel`, `deleteLabel`, `deleteMessagePermanently`, `listAllMessageIds` não existem ainda.

- [ ] **Step 4: Implementar as funções**

Em `_api/lib/gmailClient.ts`, logo depois da função `listLabels` (antes do comentário `// ── Messages ──`), adicionar:

```ts
export async function createLabel(
  account: GmailAccount,
  name: string,
  parentId: string | null,
): Promise<{ id: string; name: string }> {
  let fullName = name;
  if (parentId) {
    // Gmail aninha por "/" no NOME do label, não por um parentId nativo — precisa
    // buscar o nome completo do pai antes de montar "Pai/Filho".
    const parent = await gmailRequest(account, `/users/me/labels/${encodeURIComponent(parentId)}`);
    fullName = `${parent.name}/${name}`;
  }
  const data = await gmailRequest(account, '/users/me/labels', {
    method: 'POST',
    body: JSON.stringify({
      name: fullName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  });
  return { id: data.id, name };
}

export async function renameLabel(account: GmailAccount, labelId: string, name: string): Promise<void> {
  // Troca só o último segmento do nome, preservando o prefixo do pai (ex.:
  // "Projetos/ClienteX" -> "Projetos/ClienteY").
  const current = await gmailRequest(account, `/users/me/labels/${encodeURIComponent(labelId)}`);
  const segments = String(current.name).split('/');
  segments[segments.length - 1] = name;
  await gmailRequest(account, `/users/me/labels/${encodeURIComponent(labelId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: segments.join('/') }),
  });
}

export async function deleteLabel(account: GmailAccount, labelId: string): Promise<void> {
  await gmailRequest(account, `/users/me/labels/${encodeURIComponent(labelId)}`, { method: 'DELETE' });
}

export async function deleteMessagePermanently(account: GmailAccount, id: string): Promise<void> {
  await gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Lista TODOS os ids de mensagem de uma pasta, paginando até esgotar — usado por
 * esvaziar pasta / marcar pasta como lida (ADR-17), que precisam da caixa inteira,
 * não só da primeira página de 50 que o sync normal usa.
 */
export async function listAllMessageIds(account: GmailAccount, folder: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const { messages, nextPageToken } = await listMessages(account, folder, 100, pageToken);
    ids.push(...messages.map(m => m.id));
    pageToken = nextPageToken;
  } while (pageToken);
  return ids;
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/lib/__tests__/gmailClient.folders.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit`
Expected: sem erros

```bash
git add _api/lib/gmailClient.ts _api/lib/__tests__/gmailClient.folders.test.ts
git commit -m "feat: CRUD de label e helpers de operação em massa no Gmail client"
```

---

### Task 2: Microsoft — CRUD de pasta + helper de listagem em massa

**Files:**
- Modify: `_api/lib/microsoftClient.ts`
- Test: `_api/lib/__tests__/microsoftClient.folders.test.ts`

**Interfaces:**
- Consumes: `graphRequest(account, path, opts)` (já existe no mesmo arquivo), `FOLDER_MAP` (já existe, privado, mesmo arquivo).
- Produces: `createFolder(account, name, parentId): Promise<{id, name}>`, `renameFolder(account, folderId, name): Promise<void>`, `deleteFolder(account, folderId): Promise<void>`, `listAllMessageIds(account, folder): Promise<string[]>`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `_api/lib/__tests__/microsoftClient.folders.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../emailEncryption.js', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

import {
  createFolder, renameFolder, deleteFolder, listAllMessageIds, MicrosoftAccount,
} from '../microsoftClient.js';

function makeAccount(): MicrosoftAccount {
  return {
    id: 'acc1', userId: 'u1', email: 'a@b.com',
    accessToken: 'token', refreshToken: 'refresh',
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    provider: 'microsoft',
  };
}

describe('microsoftClient — pastas e listagem em massa', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('createFolder cria na raiz quando parentId é null', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders');
      expect(String(url)).not.toContain('childFolders');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ displayName: 'Projetos' });
      return { ok: true, status: 200, json: async () => ({ id: 'AAA', displayName: 'Projetos' }) };
    }) as any;

    const result = await createFolder(makeAccount(), 'Projetos', null);
    expect(result).toEqual({ id: 'AAA', name: 'Projetos' });
  });

  it('createFolder cria como childFolders quando parentId é informado (aceita chave fixa "inbox")', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders/inbox/childFolders');
      expect(opts.method).toBe('POST');
      return { ok: true, status: 200, json: async () => ({ id: 'BBB', displayName: 'Recibos' }) };
    }) as any;

    const result = await createFolder(makeAccount(), 'Recibos', 'inbox');
    expect(result).toEqual({ id: 'BBB', name: 'Recibos' });
  });

  it('renameFolder faz PATCH no displayName', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders/AAA');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ displayName: 'Novo Nome' });
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    await renameFolder(makeAccount(), 'AAA', 'Novo Nome');
  });

  it('deleteFolder faz DELETE na pasta', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders/AAA');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteFolder(makeAccount(), 'AAA');
  });

  it('listAllMessageIds pagina via $skip até a página vir menor que $top', async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: any) => {
      call++;
      expect(String(url)).toContain('$select=id');
      if (call === 1) {
        expect(String(url)).toContain('$skip=0');
        return { ok: true, status: 200, json: async () => ({ value: Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` })) }) };
      }
      expect(String(url)).toContain('$skip=100');
      return { ok: true, status: 200, json: async () => ({ value: [{ id: 'last' }] }) };
    }) as any;

    const ids = await listAllMessageIds(makeAccount(), 'junkemail');
    expect(ids).toHaveLength(101);
    expect(ids[100]).toBe('last');
    expect(call).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/lib/__tests__/microsoftClient.folders.test.ts`
Expected: FAIL — funções não existem ainda.

- [ ] **Step 3: Implementar as funções**

Em `_api/lib/microsoftClient.ts`, logo depois da função `listFolders` (antes do comentário `// ── Messages ──`), adicionar:

```ts
export async function createFolder(
  account: MicrosoftAccount,
  name: string,
  parentId: string | null,
): Promise<{ id: string; name: string }> {
  // Graph aceita tanto o id real quanto o nome well-known ("inbox" etc.) no lugar do
  // id de pasta em qualquer endpoint — por isso um parentId fixo funciona direto aqui.
  const path = parentId
    ? `me/mailFolders/${encodeURIComponent(parentId)}/childFolders`
    : 'me/mailFolders';
  const data = await graphRequest(account, path, {
    method: 'POST',
    body: JSON.stringify({ displayName: name }),
  });
  return { id: data.id, name: data.displayName };
}

export async function renameFolder(account: MicrosoftAccount, folderId: string, name: string): Promise<void> {
  await graphRequest(account, `me/mailFolders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName: name }),
  });
}

export async function deleteFolder(account: MicrosoftAccount, folderId: string): Promise<void> {
  await graphRequest(account, `me/mailFolders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
}

/**
 * Lista TODOS os ids de mensagem de uma pasta, paginando via $skip — usado por
 * esvaziar pasta / marcar pasta como lida (ADR-17). Usa $select=id (não o
 * MESSAGE_SELECT completo de listMessages) porque essas mensagens nunca são
 * exibidas, só apagadas/movidas/marcadas.
 */
export async function listAllMessageIds(account: MicrosoftAccount, folder: string): Promise<string[]> {
  const folderPath = FOLDER_MAP[folder] ?? folder;
  const ids: string[] = [];
  const top = 100;
  let skip = 0;
  for (;;) {
    const params = new URLSearchParams({ $select: 'id', $top: String(top), $skip: String(skip) });
    const data = await graphRequest(account, `me/mailFolders/${folderPath}/messages?${params}`);
    const page: any[] = data?.value ?? [];
    ids.push(...page.map(m => m.id));
    if (page.length < top) break;
    skip += top;
  }
  return ids;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/lib/__tests__/microsoftClient.folders.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/lib/microsoftClient.ts _api/lib/__tests__/microsoftClient.folders.test.ts
git commit -m "feat: CRUD de pasta e listagem em massa no Microsoft client"
```

---

### Task 3: IMAP — CRUD de pasta + operações nativas em lote

**Files:**
- Modify: `_api/lib/imapClient.ts`
- Test: `_api/lib/__tests__/imapClient.folders.test.ts`

**Interfaces:**
- Consumes: `connect(account)`, `resolveFolderPath(client, folder)`, `listMailboxes(client)`, `FOLDER_KEYS` (todos já existem no mesmo arquivo).
- Produces: `createFolder(account, name, parentId): Promise<{id, name}>`, `renameFolder(account, folderPath, newName): Promise<{id}>`, `deleteFolder(account, folderPath): Promise<void>`, `markAllRead(account, folder): Promise<void>`, `moveAllMessages(account, folder, destFolder): Promise<void>`, `deleteAllMessages(account, folder): Promise<void>`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `_api/lib/__tests__/imapClient.folders.test.ts`. Como `imapflow` fala com um servidor real, o teste mocka a classe `ImapFlow` inteira:

```ts
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
  ImapFlow: vi.fn(() => mockClient),
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

  it('moveAllMessages move tudo (1:*) para a pasta de destino', async () => {
    await moveAllMessages(makeAccount(), 'inbox', 'trash');
    expect(mockClient.messageMove).toHaveBeenCalledWith('1:*', 'INBOX');
  });

  it('deleteAllMessages marca \\Deleted em lote e expurga', async () => {
    await deleteAllMessages(makeAccount(), 'trash');
    expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith('1:*', ['\\Deleted']);
    expect(mockClient.messageDelete).toHaveBeenCalledWith('1:*');
  });
});
```

Nota: no teste `moveAllMessages`, `resolveFolderPath(client, 'trash')` sem special-use configurado no mock cai no fallback hardcoded (`FOLDER_PATH_MAP.trash = 'Trash'`) e `resolveFolderPath(client, 'inbox')` sempre resolve pra `'INBOX'` direto (case especial no topo da função, não depende do `list()`) — por isso a asserção usa `'INBOX'` como destino resolvido de `'inbox'` na chamada de `moveMessage`... na verdade a assinatura é `moveAllMessages(account, folder, destFolder)` com `folder='inbox'` (origem) e `destFolder='trash'`; a chamada de `messageMove` recebe o **destino resolvido**, que é `resolveFolderPath(client, 'trash')` = `'Trash'` (fallback). Ajustar a asserção do teste para `expect(mockClient.messageMove).toHaveBeenCalledWith('1:*', 'Trash')` antes de rodar.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/lib/__tests__/imapClient.folders.test.ts`
Expected: FAIL — funções não existem ainda.

- [ ] **Step 3: Implementar as funções**

Em `_api/lib/imapClient.ts`, logo depois da função `listFoldersTree` (antes do comentário `// ── Messages ──`), adicionar:

```ts
export async function createFolder(
  account: ImapAccount,
  name: string,
  parentId: string | null,
): Promise<{ id: string; name: string }> {
  const client = await connect(account);
  try {
    const parentPath = parentId
      ? ((FOLDER_KEYS as readonly string[]).includes(parentId) ? await resolveFolderPath(client, parentId) : parentId)
      : null;
    // Passar [pai, nome] deixa o próprio imapflow juntar com o delimitador certo do
    // servidor (ex.: "." no Dovecot, "/" no Gmail) — evita ter que descobrir isso aqui.
    const info = await client.mailboxCreate(parentPath ? [parentPath, name] : name);
    return { id: info.path, name };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function renameFolder(account: ImapAccount, folderPath: string, newName: string): Promise<{ id: string }> {
  const client = await connect(account);
  try {
    // Preserva o prefixo do pai (ex.: "Projetos/ClienteX" -> "Projetos/ClienteY") —
    // sem isso, renomear uma pasta aninhada a moveria pra raiz.
    const boxes = await listMailboxes(client);
    const box = boxes.find(b => b.path === folderPath);
    const newPath = box?.parentPath ? [box.parentPath, newName] : newName;
    const info = await client.mailboxRename(folderPath, newPath);
    return { id: info.newPath };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function deleteFolder(account: ImapAccount, folderPath: string): Promise<void> {
  const client = await connect(account);
  try {
    await client.mailboxDelete(folderPath);
  } finally {
    await client.logout().catch(() => {});
  }
}

function mailboxHasMessages(client: ImapFlow): boolean {
  return Boolean(client.mailbox && typeof client.mailbox === 'object' && ((client.mailbox as any).exists ?? 0) > 0);
}

/** Marca TODAS as mensagens da pasta como lidas — um único STORE em lote, não um loop por UID. */
export async function markAllRead(account: ImapAccount, folder: string): Promise<void> {
  const client = await connect(account);
  try {
    const path = await resolveFolderPath(client, folder);
    const lock = await client.getMailboxLock(path);
    try {
      if (!mailboxHasMessages(client)) return;
      await client.messageFlagsAdd('1:*', ['\\Seen']);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Move TODAS as mensagens de uma pasta pra outra — um único comando MOVE em lote. */
export async function moveAllMessages(account: ImapAccount, folder: string, destFolder: string): Promise<void> {
  const client = await connect(account);
  try {
    const sourcePath = await resolveFolderPath(client, folder);
    const destPath = await resolveFolderPath(client, destFolder);
    const lock = await client.getMailboxLock(sourcePath);
    try {
      if (!mailboxHasMessages(client)) return;
      await client.messageMove('1:*', destPath);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Apaga definitivamente TODAS as mensagens de uma pasta — usado só pra esvaziar Lixeira/Spam. */
export async function deleteAllMessages(account: ImapAccount, folder: string): Promise<void> {
  const client = await connect(account);
  try {
    const path = await resolveFolderPath(client, folder);
    const lock = await client.getMailboxLock(path);
    try {
      if (!mailboxHasMessages(client)) return;
      await client.messageFlagsAdd('1:*', ['\\Deleted']);
      await client.messageDelete('1:*');
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
```

`mailboxHasMessages` usa o mesmo padrão de leitura de `client.mailbox.exists` já usado em `listMessages`/`fetchRecentMessages` no mesmo arquivo.

- [ ] **Step 4: Ajustar a asserção do teste de `moveAllMessages`** (ver nota do Step 1) e rodar

Run: `npx vitest run _api/lib/__tests__/imapClient.folders.test.ts`
Expected: PASS (8 testes)

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/lib/imapClient.ts _api/lib/__tests__/imapClient.folders.test.ts
git commit -m "feat: CRUD de pasta e operações nativas em lote no IMAP client"
```

---

### Task 4: `_api/email/folders.ts` — endpoints de CRUD, esvaziar e marcar como lida

**Files:**
- Modify: `_api/email/folders.ts`
- Modify: `server.ts` (registro de rotas)
- Test: `_api/email/__tests__/folders.test.ts`

**Interfaces:**
- Consumes: as funções das Tasks 1-3 (`gmailListLabels`/`createLabel`/`renameLabel`/`deleteLabel`/`deleteMessagePermanently`/`listAllMessageIds`/`modifyMessage`/`trashMessage` do Gmail; `listFolders`/`createFolder`/`renameFolder`/`deleteFolder`/`listAllMessageIds`/`updateMessage`/`moveMessage`/`deleteMessage` do Microsoft; `listFoldersTree`/`createFolder`/`renameFolder`/`deleteFolder`/`markAllRead`/`moveAllMessages`/`deleteAllMessages` do IMAP), `fsGet('email_accounts', id)` (já existe em `_api/lib/pgData.js`).
- Produces: mesmo `export default handler` de sempre, agora tratando `GET`/`POST`/`PATCH`/`DELETE` e as sub-rotas `/:id/empty` e `/:id/read-all`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `_api/email/__tests__/folders.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/email/__tests__/folders.test.ts`
Expected: FAIL — handler ainda só trata GET.

- [ ] **Step 3: Reescrever `_api/email/folders.ts`**

Substituir o conteúdo inteiro do arquivo por:

```ts
import { fsGet } from '../lib/pgData.js';
import {
  listFolders as msListFolders, createFolder as msCreateFolder, renameFolder as msRenameFolder,
  deleteFolder as msDeleteFolder, listAllMessageIds as msListAllMessageIds,
  updateMessage as msUpdateMessage, moveMessage as msMoveMessage, deleteMessage as msDeleteMessage,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';
import {
  listLabels as gmailListLabels, createLabel as gmailCreateLabel, renameLabel as gmailRenameLabel,
  deleteLabel as gmailDeleteLabel, listAllMessageIds as gmailListAllMessageIds,
  modifyMessage as gmailModifyMessage, trashMessage as gmailTrashMessage,
  deleteMessagePermanently as gmailDeleteMessagePermanently, GmailAccount,
} from '../lib/gmailClient.js';
import {
  listFoldersTree as imapListFoldersTree, createFolder as imapCreateFolder,
  renameFolder as imapRenameFolder, deleteFolder as imapDeleteFolder,
  markAllRead as imapMarkAllRead, moveAllMessages as imapMoveAllMessages,
  deleteAllMessages as imapDeleteAllMessages, ImapAccount,
} from '../lib/imapClient.js';

// Formato comum devolvido pros 3 provedores — o frontend não precisa saber a
// particularidade de cada um (labels do Gmail, mailFolders do Graph, LIST do IMAP).
export interface EmailFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  unreadCount: number;
}

// O frontend usa a chave fixa 'archived', mas os 3 clients de provedor usam 'archive'
// internamente (FOLDER_LABEL_MAP/MS_FOLDER_IDS/FOLDER_KEYS) — sem normalizar aqui,
// "esvaziar Arquivados" seria tratado como uma pasta customizada inexistente.
const FOLDER_KEY_ALIASES: Record<string, string> = { archived: 'archive' };
function normalizeFolderId(id: string): string {
  return FOLDER_KEY_ALIASES[id] ?? id;
}

// Pastas de sistema nunca podem ser renomeadas/excluídas — só esvaziadas/marcadas como lidas.
const SYSTEM_FOLDER_KEYS = new Set(['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'archived']);

// Esvaziar Lixeira/Spam exclui definitivamente; qualquer outra pasta move tudo pra Lixeira.
const PERMANENT_EMPTY_FOLDERS = new Set(['trash', 'spam']);

async function loadAccount(accountId: string): Promise<Record<string, any>> {
  const account = await fsGet('email_accounts', accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  return account;
}

async function listFoldersForAccount(account: Record<string, any>): Promise<EmailFolderNode[]> {
  if (account.provider === 'gmail') {
    const labels = await gmailListLabels(account as GmailAccount);
    return labels.map(l => ({ id: l.id, name: l.name, parentId: l.parentId, unreadCount: l.unreadCount }));
  }
  if (account.provider === 'microsoft') {
    const folders = await msListFolders(account as MicrosoftAccount);
    return folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, unreadCount: f.unreadCount }));
  }
  if (account.provider === 'imap') {
    const folders = await imapListFoldersTree(account as ImapAccount);
    return folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, unreadCount: f.unreadCount }));
  }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function createFolderForAccount(
  account: Record<string, any>,
  name: string,
  parentId: string | null,
): Promise<{ id: string; name: string }> {
  // Gmail não tem conceito de "subpasta de Inbox/Enviados/etc" — as 6 pastas fixas não
  // são labels reais nesse provedor. Um pai fixo vira label raiz em vez de tentar
  // buscar um label inexistente com esse id.
  const normalizedParentId = account.provider === 'gmail' && parentId && SYSTEM_FOLDER_KEYS.has(parentId)
    ? null
    : parentId;

  if (account.provider === 'gmail') return gmailCreateLabel(account as GmailAccount, name, normalizedParentId);
  if (account.provider === 'microsoft') return msCreateFolder(account as MicrosoftAccount, name, normalizedParentId);
  if (account.provider === 'imap') return imapCreateFolder(account as ImapAccount, name, normalizedParentId);
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function renameFolderForAccount(account: Record<string, any>, folderId: string, name: string): Promise<void> {
  if (SYSTEM_FOLDER_KEYS.has(folderId)) throw new Error('Pastas de sistema não podem ser renomeadas');
  if (account.provider === 'gmail') { await gmailRenameLabel(account as GmailAccount, folderId, name); return; }
  if (account.provider === 'microsoft') { await msRenameFolder(account as MicrosoftAccount, folderId, name); return; }
  if (account.provider === 'imap') { await imapRenameFolder(account as ImapAccount, folderId, name); return; }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function deleteFolderForAccount(account: Record<string, any>, folderId: string): Promise<void> {
  if (SYSTEM_FOLDER_KEYS.has(folderId)) throw new Error('Pastas de sistema não podem ser excluídas');
  if (account.provider === 'gmail') { await gmailDeleteLabel(account as GmailAccount, folderId); return; }
  if (account.provider === 'microsoft') { await msDeleteFolder(account as MicrosoftAccount, folderId); return; }
  if (account.provider === 'imap') { await imapDeleteFolder(account as ImapAccount, folderId); return; }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function emptyFolderForAccount(account: Record<string, any>, folderId: string): Promise<void> {
  const permanent = PERMANENT_EMPTY_FOLDERS.has(folderId);

  if (account.provider === 'gmail') {
    const ids = await gmailListAllMessageIds(account as GmailAccount, folderId);
    for (const id of ids) {
      if (permanent) await gmailDeleteMessagePermanently(account as GmailAccount, id);
      else await gmailTrashMessage(account as GmailAccount, id);
    }
    return;
  }
  if (account.provider === 'microsoft') {
    const ids = await msListAllMessageIds(account as MicrosoftAccount, folderId);
    for (const id of ids) {
      if (permanent) await msDeleteMessage(account as MicrosoftAccount, id);
      else await msMoveMessage(account as MicrosoftAccount, id, 'deleteditems');
    }
    return;
  }
  if (account.provider === 'imap') {
    if (permanent) await imapDeleteAllMessages(account as ImapAccount, folderId);
    else await imapMoveAllMessages(account as ImapAccount, folderId, 'trash');
    return;
  }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function markFolderReadForAccount(account: Record<string, any>, folderId: string): Promise<void> {
  if (account.provider === 'gmail') {
    const ids = await gmailListAllMessageIds(account as GmailAccount, folderId);
    for (const id of ids) await gmailModifyMessage(account as GmailAccount, id, [], ['UNREAD']);
    return;
  }
  if (account.provider === 'microsoft') {
    const ids = await msListAllMessageIds(account as MicrosoftAccount, folderId);
    for (const id of ids) await msUpdateMessage(account as MicrosoftAccount, id, { isRead: true });
    return;
  }
  if (account.provider === 'imap') { await imapMarkAllRead(account as ImapAccount, folderId); return; }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

export default async function handler(req: any, res: any) {
  try {
    const url: string = req.url ?? '';
    const pathParts = url.split('?')[0].split('/').filter(Boolean);
    const idIndex = pathParts.indexOf('folders') + 1;
    const rawId = req.params?.id ?? (pathParts.length > idIndex ? pathParts[idIndex] : undefined);
    const folderId = rawId ? normalizeFolderId(decodeURIComponent(rawId)) : undefined;
    const subAction = pathParts.length > idIndex + 1 ? pathParts[idIndex + 1] : undefined;

    if (req.method === 'GET') {
      const { accountId } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      const folders = await listFoldersForAccount(account);
      return res.status(200).json({ folders });
    }

    if (req.method === 'POST' && !folderId) {
      const { accountId, name, parentId } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'name é obrigatório' });
      const account = await loadAccount(String(accountId));
      const created = await createFolderForAccount(account, String(name).trim(), parentId ? String(parentId) : null);
      return res.status(200).json({ folder: created });
    }

    if (req.method === 'POST' && folderId && subAction === 'empty') {
      const { accountId } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      await emptyFolderForAccount(account, folderId);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && folderId && subAction === 'read-all') {
      const { accountId } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      await markFolderReadForAccount(account, folderId);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PATCH' && folderId) {
      const { accountId, name } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'name é obrigatório' });
      const account = await loadAccount(String(accountId));
      await renameFolderForAccount(account, folderId, String(name).trim());
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE' && folderId) {
      const { accountId } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      await deleteFolderForAccount(account, folderId);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[email/folders] error:', err);
    return res.status(500).json({ error: 'Erro na operação de pasta', detail: err?.message });
  }
}
```

- [ ] **Step 4: Registrar as novas rotas em `server.ts`**

Encontrar a linha (busca por `emailFoldersHandler`):

```ts
  app.all('/api/email/folders',             emailFoldersHandler);
```

E adicionar logo abaixo:

```ts
  app.all('/api/email/folders',             emailFoldersHandler);
  app.all('/api/email/folders/:id',         emailFoldersHandler);
  app.all('/api/email/folders/:id/empty',   emailFoldersHandler);
  app.all('/api/email/folders/:id/read-all', emailFoldersHandler);
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/email/__tests__/folders.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/email/folders.ts server.ts _api/email/__tests__/folders.test.ts
git commit -m "feat: endpoints de CRUD, esvaziar e marcar-como-lida em _api/email/folders"
```

---

### Task 5: `_api/email/action.ts` — ações `move` e `notspam`

**Files:**
- Modify: `_api/email/action.ts`
- Test: `_api/email/__tests__/action.test.ts`

**Interfaces:**
- Consumes: `modifyMessage`/`FOLDER_LABEL_MAP` (Gmail, Task 1), `moveMessage` (Microsoft, já existe), `moveMessage` (IMAP, já existe).
- Produces: `EmailAction` união ganha `'move' | 'notspam'`; handler aceita `targetFolderId`/`sourceFolderId` no body.

- [ ] **Step 1: Escrever os testes que falham**

Criar `_api/email/__tests__/action.test.ts`:

```ts
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
    const req = { method: 'POST', body: { accountId: 'acc1', messageId: 'm1', action: 'notspam' } };
    const res = makeRes();

    await handler(req, res);

    expect(gmail.modifyMessage).toHaveBeenCalledWith({ provider: 'gmail', userId: 'u1' }, 'm1', ['INBOX'], ['SPAM']);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('notspam no Microsoft move pra inbox', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'microsoft', userId: 'u1' });
    (getEmail as any).mockReturnValue({ folder: 'spam' });
    const req = { method: 'POST', body: { accountId: 'acc1', messageId: 'm1', action: 'notspam' } };
    const res = makeRes();

    await handler(req, res);

    expect(ms.moveMessage).toHaveBeenCalledWith({ provider: 'microsoft', userId: 'u1' }, 'm1', 'inbox');
  });

  it('move exige targetFolderId', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail', userId: 'u1' });
    const req = { method: 'POST', body: { accountId: 'acc1', messageId: 'm1', action: 'move' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(gmail.modifyMessage).not.toHaveBeenCalled();
  });

  it('move no Gmail remove o label da pasta de origem e adiciona o de destino', async () => {
    (fsGet as any).mockResolvedValue({ provider: 'gmail', userId: 'u1' });
    (getEmail as any).mockReturnValue({ folder: 'inbox' });
    const req = {
      method: 'POST',
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
      method: 'POST',
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
      method: 'POST',
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
      method: 'POST',
      body: { accountId: 'acc1', messageId: 'inbox:42', action: 'move', sourceFolderId: 'inbox', targetFolderId: 'Projetos' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(imap.moveMessage).toHaveBeenCalledWith({ provider: 'imap', userId: 'u1' }, 'inbox', '42', 'Projetos');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run _api/email/__tests__/action.test.ts`
Expected: FAIL — `move`/`notspam` não existem no `EmailAction` nem nos `apply*Action`.

- [ ] **Step 3: Implementar em `_api/email/action.ts`**

No topo do arquivo, trocar o import do Gmail para trazer `FOLDER_LABEL_MAP`:

```ts
import {
  modifyMessage as gmailModify,
  trashMessage as gmailTrash,
  untrashMessage as gmailUntrash,
  FOLDER_LABEL_MAP as GMAIL_FOLDER_LABEL_MAP,
  GmailAccount,
} from '../lib/gmailClient.js';
```

Trocar a união `EmailAction`:

```ts
type EmailAction =
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'archive'
  | 'trash'
  | 'spam'
  | 'restore'
  | 'delete'
  | 'move'
  | 'notspam';
```

Logo depois de `const MS_FOLDER_IDS`, adicionar a mesma normalização de `'archived'` já usada em `folders.ts` (Task 4) — aqui é só pro `sourceFolderId` recebido do frontend:

```ts
const FOLDER_KEY_ALIASES: Record<string, string> = { archived: 'archive' };
function normalizeFolderKey(id: string): string {
  return FOLDER_KEY_ALIASES[id] ?? id;
}
```

Mudar a assinatura das três `apply*Action` pra aceitar as opções novas, e adicionar os `case`s. `applyGmailAction`:

```ts
async function applyGmailAction(
  account: GmailAccount,
  messageId: string,
  action: EmailAction,
  opts: { targetFolderId?: string; sourceFolderId?: string } = {},
): Promise<void> {
  switch (action) {
    case 'read':
      await gmailModify(account, messageId, [], ['UNREAD']);
      break;
    case 'unread':
      await gmailModify(account, messageId, ['UNREAD'], []);
      break;
    case 'star':
      await gmailModify(account, messageId, ['STARRED'], []);
      break;
    case 'unstar':
      await gmailModify(account, messageId, [], ['STARRED']);
      break;
    case 'archive':
      await gmailModify(account, messageId, [], ['INBOX']);
      break;
    case 'trash':
      await gmailTrash(account, messageId);
      break;
    case 'spam':
      await gmailModify(account, messageId, ['SPAM'], ['INBOX']);
      break;
    case 'restore':
      await gmailUntrash(account, messageId);
      break;
    case 'delete':
      await gmailTrash(account, messageId);
      break;
    case 'notspam':
      // Diferente de 'restore' (que só desfaz TRASH via untrash) — sair do Spam
      // precisa remover SPAM e adicionar INBOX explicitamente.
      await gmailModify(account, messageId, ['INBOX'], ['SPAM']);
      break;
    case 'move': {
      if (!opts.targetFolderId) throw new Error('targetFolderId é obrigatório pra action "move"');
      const source = opts.sourceFolderId ? normalizeFolderKey(opts.sourceFolderId) : undefined;
      const removeLabelIds = source ? (GMAIL_FOLDER_LABEL_MAP[source] ?? [source]) : [];
      await gmailModify(account, messageId, [opts.targetFolderId], removeLabelIds);
      break;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
```

`applyMicrosoftAction`:

```ts
async function applyMicrosoftAction(
  account: MicrosoftAccount,
  messageId: string,
  action: EmailAction,
  opts: { targetFolderId?: string } = {},
): Promise<void> {
  switch (action) {
    case 'read':
      await msUpdate(account, messageId, { isRead: true });
      break;
    case 'unread':
      await msUpdate(account, messageId, { isRead: false });
      break;
    case 'star':
      await msUpdate(account, messageId, { flag: { flagStatus: 'flagged' } });
      break;
    case 'unstar':
      await msUpdate(account, messageId, { flag: { flagStatus: 'notFlagged' } });
      break;
    case 'archive':
      await msMove(account, messageId, MS_FOLDER_IDS.archive);
      break;
    case 'trash':
      await msMove(account, messageId, MS_FOLDER_IDS.trash);
      break;
    case 'spam':
      await msMove(account, messageId, MS_FOLDER_IDS.spam);
      break;
    case 'restore':
    case 'notspam':
      await msMove(account, messageId, MS_FOLDER_IDS.inbox);
      break;
    case 'delete':
      await msDelete(account, messageId);
      break;
    case 'move':
      if (!opts.targetFolderId) throw new Error('targetFolderId é obrigatório pra action "move"');
      await msMove(account, messageId, opts.targetFolderId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
```

`IMAP_MOVE_ACTIONS` (usado pra invalidar cache — precisa incluir os 2 novos verbos que também movem a mensagem de pasta):

```ts
const IMAP_MOVE_ACTIONS: ReadonlySet<EmailAction> = new Set<EmailAction>([
  'archive', 'trash', 'spam', 'restore', 'move', 'notspam',
]);
```

`applyImapAction`:

```ts
async function applyImapAction(
  account: ImapAccount,
  messageId: string,
  action: EmailAction,
  currentFolder: string,
  opts: { targetFolderId?: string } = {},
): Promise<void> {
  const uid = imapUid(messageId);

  switch (action) {
    case 'read':
      await imapModify(account, currentFolder, uid, ['\\Seen'], []);
      break;
    case 'unread':
      await imapModify(account, currentFolder, uid, [], ['\\Seen']);
      break;
    case 'star':
      await imapModify(account, currentFolder, uid, ['\\Flagged'], []);
      break;
    case 'unstar':
      await imapModify(account, currentFolder, uid, [], ['\\Flagged']);
      break;
    case 'archive':
      await imapMove(account, currentFolder, uid, 'archive');
      break;
    case 'trash':
      await imapMove(account, currentFolder, uid, 'trash');
      break;
    case 'spam':
      await imapMove(account, currentFolder, uid, 'spam');
      break;
    case 'restore':
    case 'notspam':
      await imapMove(account, currentFolder, uid, 'inbox');
      break;
    case 'delete':
      await imapDelete(account, currentFolder, uid);
      break;
    case 'move':
      if (!opts.targetFolderId) throw new Error('targetFolderId é obrigatório pra action "move"');
      await imapMove(account, currentFolder, uid, opts.targetFolderId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
```

`applyLocalCacheUpdate` — adicionar `targetFolderId` como parâmetro e os 2 `case`s novos:

```ts
function applyLocalCacheUpdate(
  accountId: string,
  messageId: string,
  action: EmailAction,
  provider: string,
  targetFolderId?: string,
): void {
  const email = getEmail(accountId, messageId);
  if (!email) return;

  if (provider === 'imap' && IMAP_MOVE_ACTIONS.has(action)) {
    removeEmail(accountId, messageId);
    return;
  }

  switch (action) {
    case 'read':
      updateEmail(accountId, messageId, { isRead: true });
      break;
    case 'unread':
      updateEmail(accountId, messageId, { isRead: false });
      break;
    case 'star':
      updateEmail(accountId, messageId, { isStarred: true });
      break;
    case 'unstar':
      updateEmail(accountId, messageId, { isStarred: false });
      break;
    case 'archive':
      updateEmail(accountId, messageId, { folder: 'archive' });
      break;
    case 'trash':
      updateEmail(accountId, messageId, { folder: 'trash' });
      break;
    case 'spam':
      updateEmail(accountId, messageId, { folder: 'spam' });
      break;
    case 'restore':
    case 'notspam':
      updateEmail(accountId, messageId, { folder: 'inbox' });
      break;
    case 'delete':
      removeEmail(accountId, messageId);
      break;
    case 'move':
      if (targetFolderId) updateEmail(accountId, messageId, { folder: targetFolderId });
      break;
  }
}
```

E no `handler`, ler `targetFolderId`/`sourceFolderId` do body, validar, atualizar `validActions`, e repassar `opts` pras três `apply*Action` e pro `applyLocalCacheUpdate`:

```ts
    const { accountId, messageId, action, targetFolderId, sourceFolderId } = req.body ?? {};

    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
    if (!messageId) return res.status(400).json({ error: 'messageId é obrigatório' });
    if (!action) return res.status(400).json({ error: 'action é obrigatório' });

    const validActions: EmailAction[] = [
      'read', 'unread', 'star', 'unstar', 'archive', 'trash', 'spam', 'restore', 'delete', 'move', 'notspam',
    ];
    if (!validActions.includes(action as EmailAction)) {
      return res.status(400).json({ error: `action inválida: ${action}` });
    }
    if (action === 'move' && !targetFolderId) {
      return res.status(400).json({ error: 'targetFolderId é obrigatório pra action "move"' });
    }

    const account = await fsGet('email_accounts', String(accountId));
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const cachedForFolder = getEmail(String(accountId), String(messageId));
    const currentFolder =
      cachedForFolder?.folder ?? imapCacheFolder(String(messageId)) ?? 'inbox';

    if (account.provider === 'gmail') {
      await applyGmailAction(account as GmailAccount, String(messageId), action as EmailAction, {
        targetFolderId, sourceFolderId: sourceFolderId ?? currentFolder,
      });
    } else if (account.provider === 'microsoft') {
      await applyMicrosoftAction(account as MicrosoftAccount, String(messageId), action as EmailAction, { targetFolderId });
    } else if (account.provider === 'imap') {
      await applyImapAction(account as ImapAccount, String(messageId), action as EmailAction, currentFolder, { targetFolderId });
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }

    applyLocalCacheUpdate(
      String(accountId),
      String(messageId),
      action as EmailAction,
      String(account.provider),
      targetFolderId,
    );
```

(O resto do handler — emissão do evento de socket e o `return res.status(200).json({ success: true })` — continua igual.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run _api/email/__tests__/action.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Rodar a suíte inteira (garantir que Gmail/Microsoft/IMAP não regrediram nas ações já existentes)**

Run: `npx vitest run`
Expected: todos os testes passam, inclusive os pré-existentes de `action.ts` implícitos em outros arquivos (se houver).

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add _api/email/action.ts _api/email/__tests__/action.test.ts
git commit -m "feat: ações move e notspam em _api/email/action, com semântica correta por provedor"
```

---

### Task 6: Frontend — `EmailService.ts` (novos métodos)

**Files:**
- Modify: `src/services/EmailService.ts`
- Test: `src/services/__tests__/EmailService.folders.test.ts`

**Interfaces:**
- Consumes: nenhuma (só `fetch`).
- Produces: `EmailService.createFolder`, `EmailService.renameFolder`, `EmailService.deleteFolder`, `EmailService.emptyFolder`, `EmailService.markFolderRead`, `EmailService.moveMessage`. `EmailService.doAction`'s `action` union ganha `'move'` (novo) — `'notspam'` já existia no union, sem mudança de assinatura.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/__tests__/EmailService.folders.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EmailService } from '../EmailService';

describe('EmailService — pastas e mover mensagem', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('createFolder faz POST em /api/email/folders com name e parentId', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ folder: { id: 'X', name: 'Projetos' } }) };
    }) as any;

    const result = await EmailService.createFolder('acc1', 'Projetos', null);

    expect(captured.url).toBe('/api/email/folders');
    expect(captured.opts.method).toBe('POST');
    expect(JSON.parse(captured.opts.body)).toEqual({ accountId: 'acc1', name: 'Projetos', parentId: null });
    expect(result).toEqual({ folder: { id: 'X', name: 'Projetos' } });
  });

  it('renameFolder faz PATCH em /api/email/folders/:id', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.renameFolder('acc1', 'Label_9', 'Novo Nome');

    expect(captured.url).toBe('/api/email/folders/Label_9');
    expect(captured.opts.method).toBe('PATCH');
    expect(JSON.parse(captured.opts.body)).toEqual({ accountId: 'acc1', name: 'Novo Nome' });
  });

  it('deleteFolder faz DELETE com accountId na query', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.deleteFolder('acc1', 'Label_9');

    expect(captured.url).toBe('/api/email/folders/Label_9?accountId=acc1');
    expect(captured.opts.method).toBe('DELETE');
  });

  it('emptyFolder faz POST em /api/email/folders/:id/empty', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.emptyFolder('acc1', 'trash');

    expect(captured.url).toBe('/api/email/folders/trash/empty');
    expect(JSON.parse(captured.opts.body)).toEqual({ accountId: 'acc1' });
  });

  it('markFolderRead faz POST em /api/email/folders/:id/read-all', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.markFolderRead('acc1', 'inbox');

    expect(captured.url).toBe('/api/email/folders/inbox/read-all');
  });

  it('moveMessage faz POST em /api/email/action com action "move"', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.moveMessage('acc1', 'm1', 'inbox', 'Label_9');

    expect(captured.url).toBe('/api/email/action');
    expect(JSON.parse(captured.opts.body)).toEqual({
      accountId: 'acc1', messageId: 'm1', action: 'move', sourceFolderId: 'inbox', targetFolderId: 'Label_9',
    });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/services/__tests__/EmailService.folders.test.ts`
Expected: FAIL — métodos não existem.

- [ ] **Step 3: Implementar em `src/services/EmailService.ts`**

Logo depois de `getFolders` (seção "Pastas reais"), adicionar:

```ts
  createFolder: (accountId: string, name: string, parentId: string | null): Promise<{ folder: { id: string; name: string } }> =>
    fetch('/api/email/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, name, parentId }),
    }).then(r => r.json()),

  renameFolder: (accountId: string, folderId: string, name: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, name }),
    }).then(r => r.json()),

  deleteFolder: (accountId: string, folderId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}?accountId=${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  emptyFolder: (accountId: string, folderId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}/empty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    }).then(r => r.json()),

  markFolderRead: (accountId: string, folderId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}/read-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    }).then(r => r.json()),
```

Logo depois de `doAction` (seção "Ações"), adicionar:

```ts
  moveMessage: (
    accountId: string,
    messageId: string,
    sourceFolderId: string,
    targetFolderId: string,
  ): Promise<{ success: boolean }> =>
    fetch('/api/email/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, messageId, action: 'move', sourceFolderId, targetFolderId }),
    }).then(r => r.json()),
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/services/__tests__/EmailService.folders.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit`

```bash
git add src/services/EmailService.ts src/services/__tests__/EmailService.folders.test.ts
git commit -m "feat: métodos de pasta e moveMessage em EmailService"
```

---

### Task 7: Frontend — pastas fixas compartilhadas + `useEmailFolders` hook + `EmailContext.tsx`

**Files:**
- Create: `src/domains/email/constants/folders.ts`
- Create: `src/domains/email/hooks/useEmailFolders.ts`
- Modify: `src/contexts/EmailContext.tsx`

**Interfaces:**
- Consumes: `EmailService.getFolders/createFolder/renameFolder/deleteFolder/emptyFolder/markFolderRead/moveMessage` (Task 6).
- Produces: `FIXED_FOLDERS` (reaproveitado nas Tasks 8 e 9), `FIXED_FOLDER_MOVE_ACTION` (consumido só aqui mesmo, dentro de `moveMessage`); `useEmailFolders(accountId): { folders: EmailFolderNode[]; refetch: () => void }`; `EmailContextType` ganha `createFolder`, `renameFolder`, `deleteFolder`, `emptyFolder`, `markFolderRead`, `moveMessage`.

- [ ] **Step 1: Extrair a lista fixa de pastas pra um arquivo compartilhado**

Criar `src/domains/email/constants/folders.ts`:

```ts
import { Inbox, Send, Archive, Trash2, AlertCircle, FileText, LucideIcon } from 'lucide-react';

export interface FixedFolder {
  id: string;
  label: string;
  icon: LucideIcon;
}

// As 6 pastas que sempre existem, independente do provedor — usado pela barra lateral
// (FolderNav, Task 8) e pelo menu "Mover para" dos itens da lista (EmailListItem, Task 9).
export const FIXED_FOLDERS: FixedFolder[] = [
  { id: 'inbox', label: 'Caixa de Entrada', icon: Inbox },
  { id: 'sent', label: 'Enviados', icon: Send },
  { id: 'drafts', label: 'Rascunhos', icon: FileText },
  { id: 'archived', label: 'Arquivados', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertCircle },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
];

// Mover mensagem PRA uma das 6 pastas fixas usa as ações já existentes (cada uma tem
// semântica própria e correta por provedor — ver action.ts) em vez do endpoint genérico
// de mover, que só faz sentido pra pastas customizadas/descobertas de verdade.
// EmailContext.moveMessage consulta este mapa pra decidir qual caminho tomar — é o
// ÚNICO lugar que faz essa checagem, tanto o drop numa pasta fixa da sidebar (Task 8)
// quanto o menu "Mover para" no item da lista (Task 9) passam por ele.
export const FIXED_FOLDER_MOVE_ACTION: Record<string, string> = {
  archived: 'archive',
  trash: 'trash',
  spam: 'spam',
  inbox: 'restore',
};
```

- [ ] **Step 2: Criar o hook `useEmailFolders`**

Criar `src/domains/email/hooks/useEmailFolders.ts`:

```ts
import { useState, useEffect, useCallback } from 'react';
import { EmailService, EmailFolderNode } from '../../../services/EmailService';

/**
 * Busca a árvore de pastas reais de uma conta (Gmail labels / Microsoft mailFolders /
 * IMAP LIST) — extraído de FolderNav.tsx pra ser reaproveitado também pelo menu
 * "Mover para" nos itens da lista de mensagens (EmailListItem).
 */
export function useEmailFolders(accountId: string | null): { folders: EmailFolderNode[]; refetch: () => void } {
  const [folders, setFolders] = useState<EmailFolderNode[]>([]);

  const fetchFolders = useCallback(() => {
    if (!accountId) { setFolders([]); return; }
    EmailService.getFolders(accountId).then(setFolders).catch(() => setFolders([]));
  }, [accountId]);

  useEffect(() => {
    if (!accountId) { setFolders([]); return; }
    let cancelled = false;
    EmailService.getFolders(accountId)
      .then(f => { if (!cancelled) setFolders(f); })
      .catch(() => { if (!cancelled) setFolders([]); });
    return () => { cancelled = true; };
  }, [accountId]);

  return { folders, refetch: fetchFolders };
}
```

- [ ] **Step 3: Adicionar os novos métodos em `EmailContext.tsx`**

No topo do arquivo, junto dos outros imports, adicionar:

```ts
import { FIXED_FOLDER_MOVE_ACTION } from '../domains/email/constants/folders';
```

Na interface `EmailContextType` (depois de `setDefaultAccount`), adicionar:

```ts
  createFolder: (name: string, parentId: string | null) => Promise<boolean>;
  renameFolder: (folderId: string, name: string) => Promise<boolean>;
  deleteFolder: (folderId: string) => Promise<boolean>;
  emptyFolder: (folderId: string) => Promise<boolean>;
  markFolderRead: (folderId: string) => Promise<boolean>;
  moveMessage: (messageId: string, targetFolderId: string) => Promise<void>;
```

Em `DEFAULT_EMAIL_CTX` (depois de `setDefaultAccount: noop,`), adicionar:

```ts
  createFolder: async () => false,
  renameFolder: async () => false,
  deleteFolder: async () => false,
  emptyFolder: async () => false,
  markFolderRead: async () => false,
  moveMessage: noop,
```

Dentro do `EmailProvider`, logo depois da função `doAction` (antes de `openComposer`), adicionar:

```ts
  const createFolder = useCallback(async (name: string, parentId: string | null): Promise<boolean> => {
    const { selectedAccountId } = stateRef.current;
    if (!selectedAccountId) return false;
    try {
      await EmailService.createFolder(selectedAccountId, name, parentId);
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao criar pasta.' });
      return false;
    }
  }, []);

  const renameFolder = useCallback(async (folderId: string, name: string): Promise<boolean> => {
    const { selectedAccountId } = stateRef.current;
    if (!selectedAccountId) return false;
    try {
      await EmailService.renameFolder(selectedAccountId, folderId, name);
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao renomear pasta.' });
      return false;
    }
  }, []);

  const deleteFolder = useCallback(async (folderId: string): Promise<boolean> => {
    const { selectedAccountId } = stateRef.current;
    if (!selectedAccountId) return false;
    try {
      await EmailService.deleteFolder(selectedAccountId, folderId);
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao excluir pasta.' });
      return false;
    }
  }, []);

  const emptyFolder = useCallback(async (folderId: string): Promise<boolean> => {
    const { selectedAccountId, currentFolder } = stateRef.current;
    if (!selectedAccountId) return false;
    try {
      await EmailService.emptyFolder(selectedAccountId, folderId);
      if (currentFolder === folderId) dispatch({ type: 'SET_NEEDS_REFRESH', payload: true });
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao esvaziar pasta.' });
      return false;
    }
  }, []);

  const markFolderRead = useCallback(async (folderId: string): Promise<boolean> => {
    const { selectedAccountId, currentFolder } = stateRef.current;
    if (!selectedAccountId) return false;
    try {
      await EmailService.markFolderRead(selectedAccountId, folderId);
      if (currentFolder === folderId) dispatch({ type: 'SET_NEEDS_REFRESH', payload: true });
      return true;
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao marcar pasta como lida.' });
      return false;
    }
  }, []);

  const moveMessage = useCallback(async (messageId: string, targetFolderId: string): Promise<void> => {
    // Único ponto de decisão "pasta fixa vs pasta customizada" pro app inteiro — tanto
    // o drop na sidebar (FolderNav, Task 8) quanto o menu "Mover para" do item da lista
    // (EmailListItem, Task 9) chamam moveMessage direto e caem aqui.
    const fixedAction = FIXED_FOLDER_MOVE_ACTION[targetFolderId];
    if (fixedAction) {
      await doAction(messageId, fixedAction);
      return;
    }

    const { selectedAccountId, currentFolder } = stateRef.current;
    if (!selectedAccountId) return;
    // Otimista: a mensagem sai da pasta atual imediatamente, igual archive/trash/spam em doAction.
    dispatch({ type: 'REMOVE_MESSAGE', payload: messageId });
    try {
      await EmailService.moveMessage(selectedAccountId, messageId, currentFolder, targetFolderId);
    } catch {
      dispatch({ type: 'SET_NEEDS_REFRESH', payload: true });
    }
  }, [doAction]);
```

E no `doAction` existente, incluir `'notspam'` no branch que remove a mensagem otimisticamente da view atual:

```ts
    else if (action === 'archive' || action === 'trash' || action === 'spam' || action === 'notspam') {
      dispatch({ type: 'REMOVE_MESSAGE', payload: messageId });
    }
```

No `<EmailContext.Provider value={{ ... }}>`, adicionar as 6 novas funções na lista (depois de `setDefaultAccount,`):

```ts
        createFolder,
        renameFolder,
        deleteFolder,
        emptyFolder,
        markFolderRead,
        moveMessage,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (não há teste dedicado pro Context — a cobertura é via `EmailService` já testado na Task 6; o comportamento do Context, inclusive o roteamento de `moveMessage` pra pasta fixa vs customizada, é verificado manualmente na Task 10).

- [ ] **Step 5: Commit**

```bash
git add src/domains/email/constants/folders.ts src/domains/email/hooks/useEmailFolders.ts src/contexts/EmailContext.tsx
git commit -m "feat: pastas fixas compartilhadas, hook useEmailFolders e ações de pasta/mover mensagem em EmailContext"
```

---

### Task 8: Frontend — `FolderNav.tsx` (menu de contexto + drop target)

**Files:**
- Modify: `src/domains/email/components/sidebar/FolderNav.tsx`
- Modify: `src/domains/email/components/layout/EmailSidebar.tsx`

**Interfaces:**
- Consumes: `useEmailFolders`, `FIXED_FOLDERS` (Task 7), `createFolder/renameFolder/deleteFolder/emptyFolder/markFolderRead/moveMessage` do `EmailContext` (Task 7). `moveMessage` já decide sozinho (Task 7) se o alvo é uma pasta fixa ou customizada — `FolderNav` só chama `onMoveMessage(messageId, folderId)` sempre, sem se preocupar com essa distinção.

- [ ] **Step 1: Reescrever `FolderNav.tsx`**

Substituir o conteúdo inteiro do arquivo por:

```tsx
import React, { useState, useMemo } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { UnreadBadge } from '../shared/UnreadBadge';
import { useEmailFolders } from '../../hooks/useEmailFolders';
import { FIXED_FOLDERS } from '../../constants/folders';
import type { EmailFolderNode } from '../../types/email.types';

const FIXED_KEY_ALIAS: Record<string, string> = { archive: 'archived' };

interface TreeNode extends EmailFolderNode {
  children: TreeNode[];
}

function buildTree(folders: EmailFolderNode[], parentId: string | null): TreeNode[] {
  return folders
    .filter(f => f.parentId === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.id) }));
}

interface ContextMenuState {
  folderId: string;
  folderLabel: string;
  isSystem: boolean;
  x: number;
  y: number;
}

interface Props {
  currentFolder: string;
  unreadByFolder: Record<string, number>;
  onChangeFolder: (f: string, label?: string) => void;
  accountId: string | null;
  onCreateFolder: (name: string, parentId: string | null) => Promise<boolean>;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>;
  onDeleteFolder: (folderId: string) => Promise<boolean>;
  onEmptyFolder: (folderId: string) => Promise<boolean>;
  onMarkFolderRead: (folderId: string) => Promise<boolean>;
  onMoveMessage: (messageId: string, targetFolderId: string) => void;
}

export const FolderNav: React.FC<Props> = ({
  currentFolder, unreadByFolder, onChangeFolder, accountId,
  onCreateFolder, onRenameFolder, onDeleteFolder, onEmptyFolder, onMarkFolderRead, onMoveMessage,
}) => {
  const { folders: realFolders, refetch } = useEmailFolders(accountId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const rootCustomFolders = useMemo(() => buildTree(realFolders, null), [realFolders]);
  const childrenByFixedKey = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const folder of FIXED_FOLDERS) {
      const providerKey = Object.entries(FIXED_KEY_ALIAS).find(([, alias]) => alias === folder.id)?.[0] ?? folder.id;
      map.set(folder.id, buildTree(realFolders, providerKey));
    }
    return map;
  }, [realFolders]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openContextMenu = (e: React.MouseEvent, folderId: string, folderLabel: string, isSystem: boolean) => {
    e.preventDefault();
    setContextMenu({ folderId, folderLabel, isSystem, x: e.clientX, y: e.clientY });
  };

  const handleDrop = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const messageId = e.dataTransfer.getData('text/plain');
    if (messageId) onMoveMessage(messageId, folderId);
  };

  const handleContextAction = async (kind: 'new' | 'rename' | 'delete' | 'empty' | 'readall') => {
    if (!contextMenu) return;
    const { folderId, folderLabel } = contextMenu;
    setContextMenu(null);

    if (kind === 'new') {
      const name = window.prompt('Nome da nova subpasta:');
      if (!name || !name.trim()) return;
      const ok = await onCreateFolder(name.trim(), folderId);
      if (ok) refetch(); else window.alert('Não foi possível criar a pasta.');
    } else if (kind === 'rename') {
      const name = window.prompt('Novo nome da pasta:', folderLabel);
      if (!name || !name.trim() || name.trim() === folderLabel) return;
      const ok = await onRenameFolder(folderId, name.trim());
      if (ok) refetch(); else window.alert('Não foi possível renomear a pasta.');
    } else if (kind === 'delete') {
      if (!window.confirm(`Excluir a pasta "${folderLabel}"? As mensagens dela também são excluídas no provedor.`)) return;
      const ok = await onDeleteFolder(folderId);
      if (ok) refetch(); else window.alert('Não foi possível excluir a pasta.');
    } else if (kind === 'empty') {
      const permanent = folderId === 'trash' || folderId === 'spam';
      const msg = permanent
        ? `Esvaziar "${folderLabel}"? As mensagens serão excluídas definitivamente.`
        : `Esvaziar "${folderLabel}"? As mensagens serão movidas para a Lixeira.`;
      if (!window.confirm(msg)) return;
      const ok = await onEmptyFolder(folderId);
      if (!ok) window.alert('Não foi possível esvaziar a pasta.');
    } else if (kind === 'readall') {
      await onMarkFolderRead(folderId);
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number) => {
    const isActive = currentFolder === node.id;
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <button
          onClick={() => onChangeFolder(node.id, node.name)}
          onContextMenu={e => openContextMenu(e, node.id, node.name, false)}
          onDragOver={e => { e.preventDefault(); setDragOverId(node.id); }}
          onDragLeave={() => setDragOverId(prev => (prev === node.id ? null : prev))}
          onDrop={e => handleDrop(e, node.id)}
          className={cn(
            'w-full flex items-center gap-1.5 py-1.5 rounded-lg text-sm transition-all group',
            isActive ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-white/45 hover:bg-white/5 hover:text-white/75',
            dragOverId === node.id && 'ring-1 ring-blue-400/60 bg-blue-500/10',
          )}
          style={{ paddingLeft: 10 + depth * 16, paddingRight: 10 }}
        >
          {hasChildren ? (
            <span role="button" onClick={e => { e.stopPropagation(); toggleExpanded(node.id); }} className="shrink-0 -ml-1">
              <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90')} />
            </span>
          ) : (
            <span className="w-3.5 h-3.5 shrink-0" />
          )}
          <Folder className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-400' : 'text-white/30 group-hover:text-white/60')} />
          <span className="flex-1 text-left truncate">{node.name}</span>
          <UnreadBadge count={node.unreadCount} active={isActive} />
        </button>
        {hasChildren && isExpanded && node.children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
      {FIXED_FOLDERS.map(folder => {
        const Icon = folder.icon;
        const unread = unreadByFolder[folder.id] ?? 0;
        const isActive = currentFolder === folder.id;
        const children = childrenByFixedKey.get(folder.id) ?? [];
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(folder.id);
        return (
          <div key={folder.id}>
            <button
              onClick={() => onChangeFolder(folder.id, folder.label)}
              onContextMenu={e => openContextMenu(e, folder.id, folder.label, true)}
              onDragOver={e => { e.preventDefault(); setDragOverId(folder.id); }}
              onDragLeave={() => setDragOverId(prev => (prev === folder.id ? null : prev))}
              onDrop={e => handleDrop(e, folder.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all group',
                isActive
                  ? 'bg-blue-600/20 text-blue-300 font-medium'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80',
                dragOverId === folder.id && 'ring-1 ring-blue-400/60 bg-blue-500/10',
              )}
            >
              {hasChildren ? (
                <span role="button" onClick={e => { e.stopPropagation(); toggleExpanded(folder.id); }} className="shrink-0 -ml-1">
                  <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90')} />
                </span>
              ) : (
                <span className="w-3.5 h-3.5 shrink-0" />
              )}
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-400' : 'group-hover:text-white/70')} />
              <span className="flex-1 text-left truncate">{folder.label}</span>
              <UnreadBadge count={unread} active={isActive} />
            </button>
            {hasChildren && isExpanded && children.map(child => renderTreeNode(child, 1))}
          </div>
        );
      })}

      {rootCustomFolders.length > 0 && (
        <div className="pt-2 mt-2 border-t border-white/5">
          {rootCustomFolders.map(node => renderTreeNode(node, 0))}
        </div>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 w-52 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleContextAction('new')}
              className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
            >
              Nova subpasta
            </button>
            {!contextMenu.isSystem && (
              <>
                <button
                  onClick={() => handleContextAction('rename')}
                  className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
                >
                  Renomear
                </button>
                <button
                  onClick={() => handleContextAction('delete')}
                  className="w-full text-left px-3 py-2 text-xs text-red-400/80 hover:bg-white/5 hover:text-red-400 transition-colors"
                >
                  Excluir
                </button>
              </>
            )}
            <div className="border-t border-white/5 my-1" />
            <button
              onClick={() => handleContextAction('empty')}
              className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
            >
              Esvaziar pasta
            </button>
            <button
              onClick={() => handleContextAction('readall')}
              className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
            >
              Marcar tudo como lido
            </button>
          </div>
        </>
      )}
    </nav>
  );
};
```

- [ ] **Step 2: Atualizar `EmailSidebar.tsx` pra passar as novas props**

Em `src/domains/email/components/layout/EmailSidebar.tsx`, trocar:

```tsx
  const { state, changeFolder, selectAccount } = useEmail();
```

por:

```tsx
  const {
    state, changeFolder, selectAccount,
    createFolder, renameFolder, deleteFolder, emptyFolder, markFolderRead, moveMessage,
  } = useEmail();
```

E o `<FolderNav .../>` por:

```tsx
      <FolderNav
        currentFolder={currentFolder}
        unreadByFolder={unreadByFolder}
        onChangeFolder={changeFolder}
        accountId={selectedAccountId}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onEmptyFolder={emptyFolder}
        onMarkFolderRead={markFolderRead}
        onMoveMessage={moveMessage}
      />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add src/domains/email/components/sidebar/FolderNav.tsx src/domains/email/components/layout/EmailSidebar.tsx
git commit -m "feat: menu de contexto (criar/renomear/excluir/esvaziar/marcar lida) e drop target em FolderNav"
```

---

### Task 9: Frontend — `EmailListItem.tsx` / `EmailList.tsx` (drag, toggle lido/não lido, mover, não é spam)

**Files:**
- Modify: `src/domains/email/components/list/EmailListItem.tsx`
- Modify: `src/domains/email/components/list/EmailList.tsx`

**Interfaces:**
- Consumes: `FIXED_FOLDERS` (Task 7), `useEmailFolders` (Task 7), `doAction`/`moveMessage` do `EmailContext`. `moveMessage` já decide sozinho (Task 7) se o alvo é fixo ou customizado — este componente chama `moveMessage(messageId, targetFolderId)` pra qualquer alvo, sem replicar essa lógica.

- [ ] **Step 1: Reescrever `EmailListItem.tsx`**

Substituir o conteúdo inteiro do arquivo por:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Star, Paperclip, MoreVertical, Mail, MailOpen, FolderInput, ShieldOff } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../../lib/utils';
import type { CachedEmail, EmailFolderNode } from '../../types/email.types';
import { SenderAvatar } from '../shared/SenderAvatar';
import { addrDisplay } from '../../utils/addressFormat';
import { fmtDate } from '../../utils/dateFormat';
import { FIXED_FOLDERS } from '../../constants/folders';

interface Props {
  message: CachedEmail;
  isSelected: boolean;
  isChecked?: boolean;
  folders: EmailFolderNode[];
  onClick: () => void;
  onCheck?: (checked: boolean) => void;
  onToggleRead: () => void;
  onMoveTo: (targetFolderId: string) => void;
  onNotSpam: () => void;
}

export const EmailListItem: React.FC<Props> = ({
  message, isSelected, isChecked, folders, onClick, onCheck, onToggleRead, onMoveTo, onNotSpam,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // O backend/provedores usam 'archive' internamente, mas a pasta fixa aqui é 'archived'
  // (FIXED_FOLDERS) — sem essa normalização, uma mensagem arquivada mostraria
  // "Arquivados" na própria lista de destinos de "Mover para".
  const normalizedCurrentFolder = message.folder === 'archive' ? 'archived' : message.folder;
  const moveTargets = [
    ...FIXED_FOLDERS.filter(f => f.id !== normalizedCurrentFolder).map(f => ({ id: f.id, name: f.label })),
    ...folders.filter(f => f.id !== message.folder),
  ];

  return (
    <motion.div
      layout="position"
      role="button"
      tabIndex={0}
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', message.id)}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-white/5 transition-colors group cursor-pointer relative',
        isSelected
          ? 'bg-[#2d2d2d] border-l-2 border-l-blue-500'
          : 'hover:bg-[#252525]',
        !message.isRead && 'bg-[#1e1e2a]',
      )}
    >
      {/* Checkbox / unread dot */}
      <div className="mt-1.5 shrink-0 w-5 h-5 flex items-center justify-center">
        {onCheck ? (
          <input
            type="checkbox"
            checked={isChecked ?? false}
            onChange={e => { e.stopPropagation(); onCheck(e.target.checked); }}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded accent-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
            style={isChecked ? { opacity: 1 } : undefined}
          />
        ) : (
          !message.isRead && <div className="w-2 h-2 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Avatar */}
      <SenderAvatar from={message.from} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1 mb-0.5">
          <span className={cn(
            'text-sm truncate',
            message.isRead ? 'text-white/60 font-normal' : 'text-white/90 font-semibold',
          )}>
            {addrDisplay(message.from)}
          </span>
          <span className="text-[11px] text-white/30 shrink-0">{fmtDate(message.date)}</span>
        </div>
        <div className={cn(
          'text-xs truncate mb-0.5',
          message.isRead ? 'text-white/50' : 'text-white/80 font-medium',
        )}>
          {message.subject || '(sem assunto)'}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/30 truncate flex-1">{message.snippet}</span>
          <div className="flex items-center gap-1 shrink-0">
            {message.isStarred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
            {message.hasAttachments && <Paperclip className="w-3 h-3 text-white/30" />}
          </div>
        </div>
      </div>

      {/* Ações rápidas (aparecem no hover) */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title={message.isRead ? 'Marcar como não lida' : 'Marcar como lida'}
          onClick={e => { e.stopPropagation(); onToggleRead(); }}
          className="p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
        >
          {message.isRead ? <Mail className="w-3.5 h-3.5" /> : <MailOpen className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          title="Mais ações"
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
          className="p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          className="absolute right-2 top-10 z-30 w-52 max-h-72 overflow-y-auto bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl py-1"
        >
          {message.folder === 'spam' && (
            <button
              onClick={() => { setMenuOpen(false); onNotSpam(); }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Não é lixo eletrônico
            </button>
          )}
          <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-white/30 flex items-center gap-1.5">
            <FolderInput className="w-3 h-3" /> Mover para
          </div>
          {moveTargets.map(target => (
            <button
              key={target.id}
              onClick={() => { setMenuOpen(false); onMoveTo(target.id); }}
              className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors truncate"
            >
              {target.name}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};
```

- [ ] **Step 2: Atualizar `EmailList.tsx` pra passar as novas props**

Em `src/domains/email/components/list/EmailList.tsx`, trocar o import do context e adicionar o hook de pastas:

```tsx
import { useEmail } from '../../../../contexts/EmailContext';
import { useEmailFolders } from '../../hooks/useEmailFolders';
```

Trocar a linha de desestruturação do contexto:

```tsx
  const { state, openMessage, loadMoreMessages, search, clearSearch, doAction, moveMessage } = useEmail();
```

Logo depois de `const folderLabel = currentFolderLabel;`, adicionar:

```tsx
  const { folders: realFolders } = useEmailFolders(state.selectedAccountId);
```

(`moveMessage` já decide sozinho, dentro do `EmailContext` — Task 7 — se o alvo é uma das 6 pastas fixas (chamando `doAction` com a ação certa) ou uma pasta customizada de verdade; `EmailList` não precisa repetir essa checagem.)

E no `<EmailListItem .../>` renderizado dentro do virtualizer, trocar:

```tsx
                    <EmailListItem
                      message={row.message}
                      isSelected={selectedMessage?.id === row.message.id}
                      onClick={() => openMessage(row.message)}
                    />
```

por:

```tsx
                    <EmailListItem
                      message={row.message}
                      isSelected={selectedMessage?.id === row.message.id}
                      folders={realFolders}
                      onClick={() => openMessage(row.message)}
                      onToggleRead={() => doAction(row.message.id, row.message.isRead ? 'unread' : 'read')}
                      onMoveTo={targetFolderId => moveMessage(row.message.id, targetFolderId)}
                      onNotSpam={() => doAction(row.message.id, 'notspam')}
                    />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos os testes passam

- [ ] **Step 5: Commit**

```bash
git add src/domains/email/components/list/EmailListItem.tsx src/domains/email/components/list/EmailList.tsx
git commit -m "feat: drag-and-drop, toggle lido/não-lido e menu mover/não-é-spam por mensagem"
```

---

### Task 10: Verificação manual + build + deploy

**Files:** nenhum arquivo novo — só verificação e publicação.

- [ ] **Step 1: Rodar a suíte completa e o typecheck uma última vez**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tudo passa

- [ ] **Step 2: Build local**

```bash
npm run build
```

Expected: build sem erros. Depois, restaurar `dist/` pro estado versionado (o build local gera nomes de arquivo com hash diferente do CI):

```bash
git checkout -- dist/ && git clean -fd dist/
git status --porcelain
```

Expected: só os arquivos de `_api/**` e `src/**` das tasks anteriores aparecem staged — nada em `dist/`.

- [ ] **Step 3: Verificação manual contra a conta Microsoft real de produção**

Repetir a técnica já usada nesta sessão pra testar como usuário real (token customizado do Firebase → ID token → chamadas autenticadas na API do Railway), OU simplesmente abrir `https://michelin-seguros.vercel.app/email` depois do deploy (Step 5) e testar manualmente:

1. Criar uma subpasta dentro de "Caixa de Entrada" → confirmar que aparece na árvore.
2. Renomear essa subpasta → confirmar novo nome.
3. Arrastar um e-mail da Inbox pra essa subpasta (drag-and-drop) → confirmar que some da Inbox e aparece na subpasta.
3b. Arrastar outro e-mail da Inbox direto pra cima da linha fixa "Lixeira" na sidebar (drag-and-drop numa pasta FIXA, não customizada) → confirmar que vai pra Lixeira de verdade (valida que `EmailContext.moveMessage` está roteando pra ação `trash` em vez de mandar um `targetFolderId='trash'` cru pro endpoint genérico de mover).
4. Marcar o e-mail movido pra subpasta como não lido pelo ícone de hover → confirmar o ponto azul de não-lido.
5. Botão direito na subpasta → "Marcar tudo como lido" → confirmar que o badge de não lidos zera.
6. Botão direito na subpasta → "Esvaziar pasta" → confirmar o texto do `confirm()` ("movidas para a Lixeira") e que some da subpasta.
7. Conferir na Lixeira que a mensagem esvaziada chegou lá.
8. Botão direito na Lixeira → "Esvaziar pasta" → confirmar o texto de exclusão definitiva e que a mensagem some de vez.
9. Botão direito na subpasta (agora vazia) → "Excluir" → confirmar que a pasta some da árvore.
10. Se houver algum e-mail em Spam (ou mover um pra lá manualmente pelo próprio Outlook/Gmail antes do teste): abrir o menu "⋮" do item na lista → "Não é lixo eletrônico" → confirmar que vai pra Inbox.

Se alguma conta Gmail/IMAP estiver disponível, repetir pelo menos os passos 1-4 nela também — são os que mais dependem de mecânica específica do provedor (label do Gmail, `mailboxCreate` do IMAP).

- [ ] **Step 4: Push da branch**

```bash
git push origin feat/postgres-migration
```

- [ ] **Step 5: Deploy do frontend na Vercel**

```bash
export VERCEL_TOKEN=$(grep "^VERCEL_TOKEN=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
vercel deploy --prod --token "$VERCEL_TOKEN" --yes
```

Nota: as mudanças em `_api/**` (folders.ts, action.ts, gmailClient.ts, microsoftClient.ts, imapClient.ts) rodam no **Railway**, não na Vercel — a Vercel só serve o frontend estático e faz rewrite de `/api/*` pro Railway (`vercel.json`). Railway faz deploy automático a partir do push da Task 10 Step 4 (git-based deploy, já configurado); confirmar no painel do Railway que o deploy novo ficou "Success" antes do Step 3 de verificação manual.
