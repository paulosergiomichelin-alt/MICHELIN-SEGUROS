# Fase 1 — Fundação Multi-Provedor (IMAP/SMTP genérico) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar suporte a qualquer conta de e-mail via IMAP/SMTP genérico (não travado em Gmail/Outlook), com paridade funcional plena com os dois provedores existentes — sem regredir nenhum comportamento atual do Gmail/Microsoft.

**Architecture:** Dois clientes novos (`_api/lib/imapClient.ts` via `imapflow`, `_api/lib/smtpClient.ts` via `nodemailer`) espelham a assinatura pública de `gmailClient.ts`/`microsoftClient.ts`. Todo o código consumidor (`emailSync.ts`, `action.ts`, `messages.ts`, `send.ts`, `draft.ts`, `search.ts`) já ramifica por `provider` — adiciona-se um 3º branch `provider === 'imap'` em cada um. `EmailAccount.provider` e a coluna `email_accounts.provider` deixam de ser união fechada de 2 valores.

**Tech Stack:** Node.js/TypeScript, `imapflow` (cliente IMAP), `nodemailer` (cliente SMTP), `mailparser` (parse de mensagens IMAP), Drizzle ORM (Postgres), Vitest (testes de lógica pura).

**Spec:** `docs/email-upgrade/SPEC.md` (seção 1 item 1, ADR-1/ADR-2/ADR-3, seção 3.1, risco 1, Fase 1 da seção 7) — este plano implementa exatamente esse recorte, nenhum outro item do spec.

## Global Constraints

- Conteúdo de e-mail (corpo, anexos) continua **em memória** (`_api/lib/emailCache.ts`) — nada deste plano grava corpo de mensagem no Postgres (ADR-7 do spec).
- `EmailAccount.provider` e `CachedEmail.provider` passam de `'gmail' | 'microsoft'` para `'gmail' | 'microsoft' | 'imap'` — widening, nunca remover os valores existentes.
- Gmail e Microsoft não podem ter nenhuma mudança de comportamento observável ao final deste plano (risco 5 do spec) — cada task que mexe num arquivo compartilhado com esses dois providers termina com verificação manual explícita de que os dois continuam funcionando.
- Sem test runner configurado no projeto hoje — este plano adiciona Vitest (Task 1) só para lógica pura (sem I/O de rede). Toda operação de rede real (conectar num IMAP/SMTP de verdade) é verificada manualmente, com passo a passo explícito no plano — não existe mock de `imapflow`/`nodemailer` neste plano.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `_api/lib/emailEncryption.ts` (modifica) | Remove fallback hardcoded da chave de criptografia. |
| `_api/lib/imapAutodetect.ts` (cria) | Heurística pura de detecção de host/porta IMAP/SMTP por domínio de e-mail. |
| `_api/lib/imapClient.ts` (cria) | Cliente IMAP: conexão, teste de conexão, listagem/leitura/flags/mover/apagar mensagens, parse de mensagem, rascunhos (via `APPEND`). |
| `_api/lib/smtpClient.ts` (cria) | Cliente SMTP: teste de conexão, envio de mensagem. |
| `_api/db/schema/campaigns-email.ts` (modifica) | `accessToken`/`refreshToken` nullable; novas colunas IMAP/SMTP em `emailAccounts`. |
| `src/types.ts` (modifica) | Widening de `EmailProvider`. |
| `src/services/EmailService.ts` (modifica) | Widening de `CachedEmail.provider`/`EmailAccount.provider`; novo método `createImapAccount`/`testImapConnection`. |
| `_api/lib/emailCache.ts` (modifica) | Widening de `CachedEmail.provider`. |
| `_api/email/accounts.ts` (modifica) | Novo handler `POST` para criar conta IMAP (autodetecção + teste de conexão + persistência). |
| `src/domains/email/EmailAccountsPage.tsx` (modifica) | Novo botão "Outro (IMAP)" + formulário modal de configuração avançada. |
| `_api/lib/emailSync.ts` (modifica) | `syncImapAccount` + branch `provider === 'imap'`. |
| `_api/email/action.ts` (modifica) | `applyImapAction` + branch `provider === 'imap'`. |
| `_api/email/messages.ts` (modifica) | Branch `provider === 'imap'` para leitura de mensagem individual. |
| `_api/email/send.ts` (modifica) | Branch `provider === 'imap'` (via `smtpClient`). |
| `_api/email/draft.ts` (modifica) | Branch `provider === 'imap'` (via `imapClient`, `APPEND`). |
| `_api/email/search.ts` (modifica) | `searchImap` + branch `provider === 'imap'`. |
| `vitest.config.ts` (cria) | Config mínima do Vitest. |

---

### Task 1: Infraestrutura de teste (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`, devDependency `vitest`)
- Test: `_api/lib/__tests__/sanity.test.ts`

**Interfaces:**
- Produces: comando `npm test` rodando Vitest em modo `run` (não watch, para uso em CI/agente).

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Criar a config mínima**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['_api/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Adicionar o script `test` no `package.json`**

No bloco `"scripts"` de `package.json`, adicionar:

```json
"test": "vitest run"
```

- [ ] **Step 4: Escrever um teste de sanidade e rodar**

```ts
// _api/lib/__tests__/sanity.test.ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: PASS (1 teste passando).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json _api/lib/__tests__/sanity.test.ts
git commit -m "test: adiciona Vitest para lógica pura do módulo de e-mail"
```

---

### Task 2: Corrigir fallback hardcoded de `EMAIL_ENCRYPTION_KEY` (risco 1)

**Files:**
- Modify: `_api/lib/emailEncryption.ts`
- Test: `_api/lib/__tests__/emailEncryption.test.ts`

**Interfaces:**
- Consumes: nenhuma (arquivo folha).
- Produces: `encrypt(text: string): string`, `decrypt(encryptedText: string): string` — assinaturas inalteradas; `getKey()` deixa de ter fallback.

- [ ] **Step 1: Escrever o teste que falha (comportamento atual é o bug)**

```ts
// _api/lib/__tests__/emailEncryption.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('emailEncryption', () => {
  const ORIGINAL_KEY = process.env.EMAIL_ENCRYPTION_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.EMAIL_ENCRYPTION_KEY;
    else process.env.EMAIL_ENCRYPTION_KEY = ORIGINAL_KEY;
    vi.resetModules();
  });

  it('faz round-trip de encrypt/decrypt quando a chave está definida', async () => {
    process.env.EMAIL_ENCRYPTION_KEY = 'uma-chave-de-teste-com-32-bytes!';
    vi.resetModules();
    const { encrypt, decrypt } = await import('../emailEncryption.js');
    const encrypted = encrypt('segredo-do-usuario');
    expect(encrypted).not.toBe('segredo-do-usuario');
    expect(decrypt(encrypted)).toBe('segredo-do-usuario');
  });

  it('lança erro explícito quando EMAIL_ENCRYPTION_KEY não está definida', async () => {
    delete process.env.EMAIL_ENCRYPTION_KEY;
    vi.resetModules();
    const { encrypt } = await import('../emailEncryption.js');
    expect(() => encrypt('qualquer coisa')).toThrow(/EMAIL_ENCRYPTION_KEY/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que a 2ª asserção falha**

Run: `npm test -- emailEncryption`
Expected: FAIL no segundo `it` — hoje `encrypt` nunca lança, usa o fallback `FALLBACK_KEY` silenciosamente.

- [ ] **Step 3: Remover o fallback hardcoded**

```ts
// _api/lib/emailEncryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const raw = process.env.EMAIL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'EMAIL_ENCRYPTION_KEY não definida. Defina no .env (nunca commitado) — sem ela, ' +
      'tokens/senhas de contas de e-mail não podem ser criptografados nem descriptografados.',
    );
  }
  const buf = Buffer.from(raw, 'utf8');
  const key = Buffer.alloc(32);
  buf.copy(key, 0, 0, Math.min(buf.length, 32));
  return key;
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encryptedText: string): string {
  const key = getKey();
  const [ivHex, cipherHex] = encryptedText.split(':');
  if (!ivHex || !cipherHex) throw new Error('Invalid encrypted text format');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(cipherHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test -- emailEncryption`
Expected: PASS (2 testes).

- [ ] **Step 5: Verificação manual — Gmail/Microsoft não regrediram**

Confirme que `EMAIL_ENCRYPTION_KEY` está definida no `.env` local e no ambiente da VPS (`scripts/deploy-vps.mjs` já assume variáveis obrigatórias — mesmo padrão). Rode o servidor local (`npm run dev:server`), conecte ou sincronize uma conta Gmail ou Microsoft já existente e confirme que a lista de mensagens carrega normalmente (accessToken/refreshToken continuam decriptando).

- [ ] **Step 6: Commit**

```bash
git add _api/lib/emailEncryption.ts _api/lib/__tests__/emailEncryption.test.ts
git commit -m "fix: remove fallback hardcoded de EMAIL_ENCRYPTION_KEY, falha explícita se ausente"
```

---

### Task 3: Widening do tipo `provider` + migração de schema

**Files:**
- Modify: `src/types.ts:975`
- Modify: `src/services/EmailService.ts:19,41`
- Modify: `_api/lib/emailCache.ts:6`
- Modify: `_api/db/schema/campaigns-email.ts` (tabela `emailAccounts`)
- Create: (gerado) `drizzle/NNNN_*.sql` via `db:generate`

**Interfaces:**
- Produces: tipo `'gmail' | 'microsoft' | 'imap'` em todos os pontos onde hoje é `'gmail' | 'microsoft'`; colunas novas em `email_accounts` usadas pelas Tasks 4-7.

- [ ] **Step 1: Widening nos tipos TypeScript**

```ts
// src/types.ts:975
export type EmailProvider = 'gmail' | 'microsoft' | 'imap';
```

```ts
// src/services/EmailService.ts — CachedEmail e EmailAccount
export interface CachedEmail {
  // ...
  provider: 'gmail' | 'microsoft' | 'imap';
  // ...
}

export interface EmailAccount {
  // ...
  provider: 'gmail' | 'microsoft' | 'imap';
  // ...
}
```

```ts
// _api/lib/emailCache.ts
export interface CachedEmail {
  // ...
  provider: 'gmail' | 'microsoft' | 'imap';
  // ...
}
```

- [ ] **Step 2: Rodar o type-check e confirmar os erros esperados**

Run: `npx tsc --noEmit`
Expected: erros de tipo em `_api/email/send.ts` e `_api/email/draft.ts`, nos dois pontos `provider: account.provider as 'gmail' | 'microsoft'` (esses dois casts serão corrigidos nas Tasks 9 e 10, quando o branch IMAP for de fato ligado nesses arquivos — por ora, ajuste só o cast para não quebrar o build):

Em `_api/email/send.ts` linha ~189 e `_api/email/draft.ts` linha ~120, trocar:

```ts
provider: account.provider as 'gmail' | 'microsoft',
```

por:

```ts
provider: account.provider as 'gmail' | 'microsoft' | 'imap',
```

Run: `npx tsc --noEmit` de novo.
Expected: PASS (0 erros).

- [ ] **Step 3: Alterar o schema Drizzle**

```ts
// _api/db/schema/campaigns-email.ts — dentro de emailAccounts
export const emailAccounts = pgTable('email_accounts', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  isDefault: boolean('is_default').notNull().default(false),
  status: text('status').notNull(),
  lastSync: timestamp('last_sync', { withTimezone: true, mode: 'string' }),
  syncError: text('sync_error'),
  accessToken: text('access_token'),        // era .notNull() — agora nullable (IMAP não usa OAuth)
  refreshToken: text('refresh_token'),      // era .notNull() — agora nullable
  tokenExpiry: bigint('token_expiry', { mode: 'number' }),
  picture: text('picture'),
  // Novas colunas — só preenchidas quando provider === 'imap':
  imapHost: text('imap_host'),
  imapPort: integer('imap_port'),
  imapSecure: boolean('imap_secure').notNull().default(true),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpSecure: boolean('smtp_secure').notNull().default(true),
  username: text('username'),
  passwordEncrypted: text('password_encrypted'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Gerar e aplicar a migração**

Run: `npm run db:generate`
Expected: novo arquivo `drizzle/NNNN_<nome_gerado>.sql` contendo `ALTER TABLE email_accounts ALTER COLUMN access_token DROP NOT NULL`, idem `refresh_token`, e `ADD COLUMN imap_host text`, etc. Leia o SQL gerado antes do próximo passo — confirme que não há nenhum `DROP` de coluna existente.

Run: `npm run db:push`
Expected: schema aplicado no Postgres sem erro.

- [ ] **Step 5: Verificação manual — Gmail/Microsoft não regrediram**

Rode `npm run dev:server`, abra a página de contas de e-mail, confirme que as contas Gmail/Microsoft já conectadas continuam listadas com status `connected` e que `GET /api/email/accounts?userId=...` retorna os mesmos campos de antes (o `stripTokens` em `_api/email/accounts.ts` já remove `accessToken`/`refreshToken` da resposta, então nada muda na API pública).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/services/EmailService.ts _api/lib/emailCache.ts _api/db/schema/campaigns-email.ts _api/email/send.ts _api/email/draft.ts drizzle/
git commit -m "feat: amplia provider para 'gmail'|'microsoft'|'imap' e adiciona colunas IMAP/SMTP em email_accounts"
```

---

### Task 4: Heurística de autodetecção de host/porta (`imapAutodetect.ts`)

**Files:**
- Create: `_api/lib/imapAutodetect.ts`
- Test: `_api/lib/__tests__/imapAutodetect.test.ts`

**Interfaces:**
- Produces: `detectImapSmtpConfig(email: string): { imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean }` — consumida pela Task 7 (endpoint de criação de conta) e pelo formulário do front (Task 7).

- [ ] **Step 1: Escrever os testes que falham**

```ts
// _api/lib/__tests__/imapAutodetect.test.ts
import { describe, it, expect } from 'vitest';
import { detectImapSmtpConfig } from '../imapAutodetect.js';

describe('detectImapSmtpConfig', () => {
  it('reconhece gmail.com com host/porta reais do Google', () => {
    expect(detectImapSmtpConfig('fulano@gmail.com')).toEqual({
      imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
      smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false,
    });
  });

  it('reconhece outlook.com/hotmail.com com host do Microsoft 365', () => {
    expect(detectImapSmtpConfig('fulano@outlook.com').imapHost).toBe('outlook.office365.com');
    expect(detectImapSmtpConfig('fulano@hotmail.com').imapHost).toBe('outlook.office365.com');
  });

  it('cai no padrão imap.<dominio>/smtp.<dominio> para domínio desconhecido', () => {
    expect(detectImapSmtpConfig('fulano@empresa-generica.com.br')).toEqual({
      imapHost: 'imap.empresa-generica.com.br', imapPort: 993, imapSecure: true,
      smtpHost: 'smtp.empresa-generica.com.br', smtpPort: 587, smtpSecure: false,
    });
  });

  it('lida com e-mail sem @ sem lançar exceção', () => {
    expect(() => detectImapSmtpConfig('invalido')).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- imapAutodetect`
Expected: FAIL com "Cannot find module '../imapAutodetect.js'".

- [ ] **Step 3: Implementar**

```ts
// _api/lib/imapAutodetect.ts

export interface ImapSmtpConfig {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

// Provedores conhecidos cujo host real diverge do padrão imap.<domínio>/smtp.<domínio>.
// Best-effort (igual Thunderbird) — sempre editável manualmente pelo usuário no formulário.
const KNOWN_PROVIDERS: Record<string, Pick<ImapSmtpConfig, 'imapHost' | 'smtpHost'>> = {
  'gmail.com': { imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' },
  'outlook.com': { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com' },
  'hotmail.com': { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com' },
  'live.com': { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com' },
  'yahoo.com': { imapHost: 'imap.mail.yahoo.com', smtpHost: 'smtp.mail.yahoo.com' },
};

export function detectImapSmtpConfig(email: string): ImapSmtpConfig {
  const domain = (email.split('@')[1] ?? '').toLowerCase().trim();
  const known = KNOWN_PROVIDERS[domain];

  return {
    imapHost: known?.imapHost ?? `imap.${domain}`,
    imapPort: 993,
    imapSecure: true,
    smtpHost: known?.smtpHost ?? `smtp.${domain}`,
    smtpPort: 587,
    smtpSecure: false,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- imapAutodetect`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add _api/lib/imapAutodetect.ts _api/lib/__tests__/imapAutodetect.test.ts
git commit -m "feat: heurística de autodetecção de host/porta IMAP/SMTP por domínio"
```

---

### Task 5: Cliente IMAP (`imapClient.ts`)

**Files:**
- Modify: `package.json` (dependencies `imapflow`, `mailparser`, `@types/mailparser`)
- Create: `_api/lib/imapClient.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` de `_api/lib/emailEncryption.ts`; `CachedEmail` de `_api/lib/emailCache.ts`.
- Produces (usado pelas Tasks 8-11):
  - `interface ImapAccount { id: string; userId: string; email: string; provider: 'imap'; imapHost: string; imapPort: number; imapSecure: boolean; username: string; passwordEncrypted: string; [key: string]: any }`
  - `testImapConnection(account: ImapAccount): Promise<{ ok: boolean; error?: string }>`
  - `listMessages(account: ImapAccount, folder: string, maxResults?: number, pageToken?: string): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }>`
  - `getMessage(account: ImapAccount, folder: string, uid: string): Promise<any>` (retorna o resultado do `mailparser`, com `uid` e `flags` anexados)
  - `parseImapMessage(parsed: any, accountId: string, folder: string): CachedEmail`
  - `modifyMessage(account: ImapAccount, folder: string, uid: string, addFlags: string[], removeFlags: string[]): Promise<void>`
  - `moveMessage(account: ImapAccount, folder: string, uid: string, destFolder: string): Promise<void>`
  - `deleteMessage(account: ImapAccount, folder: string, uid: string): Promise<void>`
  - `createDraft(account: ImapAccount, raw: string): Promise<{ id: string }>`
  - `updateDraft(account: ImapAccount, draftUid: string, raw: string): Promise<{ id: string }>`
  - `deleteDraft(account: ImapAccount, draftUid: string): Promise<void>`

- [ ] **Step 1: Instalar as dependências**

```bash
npm install imapflow mailparser
npm install --save-dev @types/mailparser
```

- [ ] **Step 2: Implementar `imapClient.ts`**

```ts
// _api/lib/imapClient.ts
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decrypt } from './emailEncryption.js';
import { CachedEmail } from './emailCache.js';

export interface ImapAccount {
  id: string;
  userId: string;
  email: string;
  provider: 'imap';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  passwordEncrypted: string;
  [key: string]: any;
}

// Paridade com o modelo hardcoded de 6 pastas que Gmail/Microsoft usam hoje.
// Fase 2 do spec (pastas reais) substitui isso por descoberta via LIST.
const FOLDER_PATH_MAP: Record<string, string> = {
  inbox: 'INBOX',
  sent: 'Sent',
  drafts: 'Drafts',
  trash: 'Trash',
  spam: 'Junk',
  archive: 'Archive',
};

function folderPath(folder: string): string {
  return FOLDER_PATH_MAP[folder] ?? 'INBOX';
}

async function connect(account: ImapAccount): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: { user: account.username, pass: decrypt(account.passwordEncrypted) },
    logger: false,
  });
  await client.connect();
  return client;
}

export async function testImapConnection(account: ImapAccount): Promise<{ ok: boolean; error?: string }> {
  let client: ImapFlow | undefined;
  try {
    client = await connect(account);
    await client.list();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  } finally {
    await client?.logout().catch(() => {});
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function listMessages(
  account: ImapAccount,
  folder: string,
  maxResults = 50,
  pageToken?: string,
): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(folderPath(folder));
    try {
      const totalMessages = client.mailbox && typeof client.mailbox === 'object' ? (client.mailbox as any).exists ?? 0 : 0;
      if (totalMessages === 0) return { messages: [] };

      const beforeSeq = pageToken ? Number(pageToken) : totalMessages + 1;
      const fromSeq = Math.max(1, beforeSeq - maxResults);
      if (fromSeq >= beforeSeq) return { messages: [] };

      const messages: Array<{ id: string; threadId: string }> = [];
      for await (const msg of client.fetch(`${fromSeq}:${beforeSeq - 1}`, { uid: true })) {
        messages.push({ id: String(msg.uid), threadId: String(msg.uid) });
      }
      messages.reverse(); // mais recente primeiro, igual Gmail/Microsoft

      return { messages, nextPageToken: fromSeq > 1 ? String(fromSeq) : undefined };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getMessage(account: ImapAccount, folder: string, uid: string): Promise<any> {
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(folderPath(folder));
    try {
      const msg = await client.fetchOne(uid, { source: true, flags: true }, { uid: true });
      if (!msg || !msg.source) throw new Error(`Mensagem ${uid} não encontrada em ${folder}`);
      const parsed = await simpleParser(msg.source);
      return { ...parsed, uid: String(msg.uid), flags: Array.from(msg.flags ?? []) };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function addressListToEmailObjs(value: any): { name?: string; email: string }[] {
  const list = value?.value ?? [];
  return list
    .map((a: any) => ({ name: a.name || undefined, email: (a.address ?? '').toLowerCase() }))
    .filter((a: any) => a.email);
}

export function parseImapMessage(parsed: any, accountId: string, folder: string): CachedEmail {
  const from = addressListToEmailObjs(parsed.from)[0] ?? { email: '' };
  const to = addressListToEmailObjs(parsed.to);
  const cc = addressListToEmailObjs(parsed.cc);
  const flags: string[] = parsed.flags ?? [];
  const attachments = (parsed.attachments ?? []).map((att: any) => ({
    filename: att.filename ?? 'anexo',
    mimeType: att.contentType ?? 'application/octet-stream',
    size: att.size ?? att.content?.length ?? 0,
  }));

  return {
    id: parsed.uid,
    accountId,
    provider: 'imap',
    folder,
    threadId: parsed.uid, // sem equivalente nativo — Fase 5 (ADR-10) faz o agrupamento real por References/In-Reply-To
    subject: parsed.subject ?? '(sem assunto)',
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    date: (parsed.date ?? new Date()).toISOString(),
    snippet: (parsed.text ?? '').slice(0, 200),
    isRead: flags.includes('\\Seen'),
    isStarred: flags.includes('\\Flagged'),
    hasAttachments: attachments.length > 0,
    bodyHtml: parsed.html || undefined,
    bodyText: parsed.text || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    fetchedAt: Date.now(),
  };
}

// ── Flags / mover / apagar ────────────────────────────────────────────────────

export async function modifyMessage(
  account: ImapAccount,
  folder: string,
  uid: string,
  addFlags: string[],
  removeFlags: string[],
): Promise<void> {
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(folderPath(folder));
    try {
      if (addFlags.length > 0) await client.messageFlagsAdd(uid, addFlags, { uid: true });
      if (removeFlags.length > 0) await client.messageFlagsRemove(uid, removeFlags, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function moveMessage(
  account: ImapAccount,
  folder: string,
  uid: string,
  destFolder: string,
): Promise<void> {
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(folderPath(folder));
    try {
      await client.messageMove(uid, folderPath(destFolder), { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function deleteMessage(account: ImapAccount, folder: string, uid: string): Promise<void> {
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(folderPath(folder));
    try {
      await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true });
      await client.messageDelete(uid, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

// ── Rascunhos (via APPEND na pasta Drafts) ────────────────────────────────────

export async function createDraft(account: ImapAccount, raw: string): Promise<{ id: string }> {
  const client = await connect(account);
  try {
    const info = await client.append(folderPath('drafts'), Buffer.from(raw, 'utf8'), ['\\Draft']);
    return { id: String(info.uid) };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function updateDraft(account: ImapAccount, draftUid: string, raw: string): Promise<{ id: string }> {
  // IMAP não edita mensagem em lugar — apaga o rascunho antigo e cria um novo.
  await deleteDraft(account, draftUid);
  return createDraft(account, raw);
}

export async function deleteDraft(account: ImapAccount, draftUid: string): Promise<void> {
  await deleteMessage(account, 'drafts', draftUid);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (0 erros — `imapClient.ts` ainda não é importado por ninguém, então não pode quebrar nada existente).

- [ ] **Step 4: Verificação manual — conexão real**

Usando uma conta de e-mail real com IMAP habilitado e senha de app (ex: Gmail com "senha de app" gerada em myaccount.google.com/apppasswords), escreva um script ad-hoc temporário:

```ts
// scratch.ts (não commitar)
import { testImapConnection, listMessages } from './_api/lib/imapClient.js';

const account = {
  id: 'test', userId: 'test', email: 'voce@gmail.com', provider: 'imap' as const,
  imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
  username: 'voce@gmail.com', passwordEncrypted: 'PLACEHOLDER', // ver nota abaixo
};
```

Nota: `passwordEncrypted` precisa estar de fato criptografado com `encrypt()` (Task 2) — gere com um script curto chamando `encrypt('sua-senha-de-app')` primeiro. Rode `npx tsx scratch.ts`, confirme que `testImapConnection` retorna `{ ok: true }` e `listMessages(account, 'inbox')` retorna mensagens reais da caixa de entrada. Apague `scratch.ts` ao terminar.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json _api/lib/imapClient.ts
git commit -m "feat: cliente IMAP (imapClient.ts) com paridade de listagem/leitura/flags/rascunhos"
```

---

### Task 6: Cliente SMTP (`smtpClient.ts`)

**Files:**
- Modify: `package.json` (dependency `nodemailer`, `@types/nodemailer`)
- Create: `_api/lib/smtpClient.ts`

**Interfaces:**
- Consumes: `ImapAccount` de `_api/lib/imapClient.ts` (mesmo shape de conta serve para SMTP — reexportado como `SmtpAccount` com os campos `smtpHost`/`smtpPort`/`smtpSecure` em vez de `imap*`); `decrypt` de `_api/lib/emailEncryption.ts`.
- Produces (usado pelas Tasks 7 e 10):
  - `interface SmtpAccount { id: string; userId: string; email: string; provider: 'imap'; smtpHost: string; smtpPort: number; smtpSecure: boolean; username: string; passwordEncrypted: string; [key: string]: any }`
  - `testSmtpConnection(account: SmtpAccount): Promise<{ ok: boolean; error?: string }>`
  - `sendMessage(account: SmtpAccount, raw: string): Promise<{ id: string }>`

- [ ] **Step 1: Instalar as dependências**

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Implementar `smtpClient.ts`**

```ts
// _api/lib/smtpClient.ts
import nodemailer from 'nodemailer';
import { decrypt } from './emailEncryption.js';

export interface SmtpAccount {
  id: string;
  userId: string;
  email: string;
  provider: 'imap';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  passwordEncrypted: string;
  [key: string]: any;
}

function buildTransport(account: SmtpAccount) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: { user: account.username, pass: decrypt(account.passwordEncrypted) },
  });
}

export async function testSmtpConnection(account: SmtpAccount): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = buildTransport(account);
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function sendMessage(account: SmtpAccount, raw: string): Promise<{ id: string }> {
  const transporter = buildTransport(account);
  const info = await transporter.sendMail({ raw: Buffer.from(raw, 'utf8') });
  return { id: info.messageId };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (0 erros).

- [ ] **Step 4: Verificação manual — envio real**

Com a mesma conta de teste da Task 5 (senha de app já criptografada), envie um e-mail de teste pra você mesmo via um script ad-hoc chamando `sendMessage` com um MIME simples (`From/To/Subject/Content-Type: text/plain` + corpo), e confirme que ele chega na caixa de entrada real.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json _api/lib/smtpClient.ts
git commit -m "feat: cliente SMTP (smtpClient.ts) para envio de e-mail em contas IMAP genéricas"
```

---

### Task 7: Criação de conta IMAP (endpoint + UI)

**Files:**
- Modify: `_api/email/accounts.ts` (novo handler `POST`)
- Modify: `src/services/EmailService.ts` (novo método `createImapAccount`)
- Modify: `src/domains/email/EmailAccountsPage.tsx` (botão "Outro (IMAP)" + modal)

**Interfaces:**
- Consumes: `detectImapSmtpConfig` (Task 4), `testImapConnection` (Task 5), `testSmtpConnection` (Task 6), `encrypt` (Task 2).
- Produces: `POST /api/email/accounts` aceitando `{ userId, email, username, password, imapHost?, imapPort?, imapSecure?, smtpHost?, smtpPort?, smtpSecure?, displayName? }`, retornando `{ success: true, accountId: string }` ou `400` com `{ error }` se a conexão falhar.

- [ ] **Step 1: Adicionar o handler `POST` em `accounts.ts`**

`generateId` não é exportado de `pgData.ts` — cada arquivo que precisa de um id novo declara sua própria função local (mesmo padrão de `_api/email/auth/gmail.ts:14-16`, que usa `` `gmail_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` ``). Siga o mesmo padrão aqui, com prefixo `imap_`.

```ts
// _api/email/accounts.ts — trocar o import existente (linha 1) por:
import { fsQueryFull, fsDelete, fsUpdate, fsSet } from '../lib/pgData.js';
import { clearAccount } from '../lib/emailCache.js';
import { encrypt } from '../lib/emailEncryption.js';
import { detectImapSmtpConfig } from '../lib/imapAutodetect.js';
import { testImapConnection, ImapAccount } from '../lib/imapClient.js';
import { testSmtpConnection, SmtpAccount } from '../lib/smtpClient.js';

function generateId(): string {
  return `imap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
```

Dentro de `handler`, antes do `return res.status(405)...` final:

```ts
    if (req.method === 'POST') {
      const { userId, email, username, password, displayName } = req.body ?? {};
      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
      if (!email) return res.status(400).json({ error: 'email é obrigatório' });
      if (!password) return res.status(400).json({ error: 'password é obrigatório' });

      const detected = detectImapSmtpConfig(String(email));
      const imapHost = req.body.imapHost || detected.imapHost;
      const imapPort = Number(req.body.imapPort || detected.imapPort);
      const imapSecure = req.body.imapSecure ?? detected.imapSecure;
      const smtpHost = req.body.smtpHost || detected.smtpHost;
      const smtpPort = Number(req.body.smtpPort || detected.smtpPort);
      const smtpSecure = req.body.smtpSecure ?? detected.smtpSecure;
      const finalUsername = username || email;

      const passwordEncrypted = encrypt(String(password));

      const testAccount = {
        id: 'pending', userId: String(userId), email: String(email), provider: 'imap' as const,
        imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure,
        username: finalUsername, passwordEncrypted,
      };

      const imapResult = await testImapConnection(testAccount as ImapAccount);
      if (!imapResult.ok) {
        return res.status(400).json({ error: `Falha ao conectar via IMAP: ${imapResult.error}` });
      }
      const smtpResult = await testSmtpConnection(testAccount as SmtpAccount);
      if (!smtpResult.ok) {
        return res.status(400).json({ error: `Falha ao conectar via SMTP: ${smtpResult.error}` });
      }

      const accountId = generateId();
      await fsSet('email_accounts', accountId, {
        userId: String(userId),
        email: String(email),
        displayName: displayName || email,
        provider: 'imap',
        imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure,
        username: finalUsername,
        passwordEncrypted,
        status: 'active',
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      import('../lib/emailSync.js').then(({ syncAccount }) => syncAccount(accountId)).catch(() => {});

      return res.status(200).json({ success: true, accountId });
    }
```

- [ ] **Step 2: Adicionar o método no `EmailService.ts`**

```ts
// src/services/EmailService.ts — dentro do objeto EmailService, seção "Contas"
createImapAccount: (data: {
  userId: string;
  email: string;
  username?: string;
  password: string;
  displayName?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}): Promise<{ success: boolean; accountId?: string; error?: string }> =>
  fetch('/api/email/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const json = await r.json();
    if (!r.ok) return { success: false, error: json.error ?? 'Falha ao conectar' };
    return { success: true, accountId: json.accountId };
  }),
```

- [ ] **Step 3: Adicionar o botão e o modal em `EmailAccountsPage.tsx`**

Adicionar um terceiro item no `<div className="flex flex-col sm:flex-row gap-3">` (depois do botão Microsoft, linha ~309 do arquivo atual):

```tsx
{/* Outro (IMAP) */}
<button
  onClick={() => setShowImapModal(true)}
  className="flex items-center gap-3 px-5 py-3 rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/5 transition-all text-white/60 hover:text-white/90 group"
>
  <Mail className="w-5 h-5 shrink-0 text-white/40" />
  <div className="text-left">
    <p className="font-medium text-sm">Outro (IMAP)</p>
    <p className="text-xs text-white/30 group-hover:text-white/40">Qualquer provedor com IMAP/SMTP</p>
  </div>
</button>
```

Adicionar o estado e o modal dentro do componente `EmailAccountsPage`:

```tsx
const [showImapModal, setShowImapModal] = useState(false);
const [imapForm, setImapForm] = useState({ email: '', password: '', displayName: '' });
const [imapError, setImapError] = useState<string | null>(null);
const [imapSubmitting, setImapSubmitting] = useState(false);

const handleCreateImapAccount = async () => {
  if (!userProfile?.uid) return;
  setImapSubmitting(true);
  setImapError(null);
  const result = await EmailService.createImapAccount({
    userId: userProfile.uid,
    email: imapForm.email,
    password: imapForm.password,
    displayName: imapForm.displayName || undefined,
  });
  setImapSubmitting(false);
  if (!result.success) {
    setImapError(result.error ?? 'Falha ao conectar a conta.');
    return;
  }
  setShowImapModal(false);
  setImapForm({ email: '', password: '', displayName: '' });
  loadAccounts();
};
```

E o JSX do modal, renderizado logo antes do `</div>` de fechamento do componente `EmailAccountsPage` (dentro do `return (...)`, como irmão do `<div className="max-w-3xl mx-auto">` existente):

```tsx
{showImapModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md">
      <h3 className="text-white/90 font-semibold text-base mb-1">Conectar conta IMAP</h3>
      <p className="text-white/40 text-xs mb-5">
        Funciona com qualquer provedor de e-mail que ofereça IMAP/SMTP.
      </p>

      <label className="block text-white/50 text-xs mb-1.5">E-mail</label>
      <input
        type="email"
        value={imapForm.email}
        onChange={e => setImapForm(f => ({ ...f, email: e.target.value }))}
        className="w-full mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/85 text-sm outline-none focus:border-white/25"
        placeholder="voce@provedor.com"
      />

      <label className="block text-white/50 text-xs mb-1.5">Senha</label>
      <input
        type="password"
        value={imapForm.password}
        onChange={e => setImapForm(f => ({ ...f, password: e.target.value }))}
        className="w-full mb-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/85 text-sm outline-none focus:border-white/25"
        placeholder="Senha ou senha de app"
      />
      <p className="text-white/25 text-[11px] mb-3">
        Provedores como Gmail e Yahoo exigem uma "senha de app" quando a verificação em duas etapas está ativa.
      </p>

      <label className="block text-white/50 text-xs mb-1.5">Nome de exibição (opcional)</label>
      <input
        type="text"
        value={imapForm.displayName}
        onChange={e => setImapForm(f => ({ ...f, displayName: e.target.value }))}
        className="w-full mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/85 text-sm outline-none focus:border-white/25"
        placeholder={imapForm.email || 'Como aparece pros destinatários'}
      />

      {imapError && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {imapError}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setShowImapModal(false); setImapError(null); }}
          className="px-4 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 border border-white/8 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleCreateImapAccount}
          disabled={imapSubmitting || !imapForm.email || !imapForm.password}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-gold-deep/15 text-gold-deep border border-gold-deep/25 hover:bg-gold-deep/25 transition-colors disabled:opacity-50"
        >
          {imapSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {imapSubmitting ? 'Testando conexão...' : 'Testar e conectar'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificação manual — fluxo completo pela UI**

Rode `npm run dev:only`, abra a página de contas, clique em "Outro (IMAP)", preencha com a conta de teste real (mesma senha de app da Task 5), confirme que:
1. Com senha errada, o formulário mostra o erro retornado pelo backend (não trava, não fecha o modal).
2. Com senha correta, a conta aparece na lista com status "Conectado" e o sync inicial dispara (você verá mensagens reais assim que a Task 8 estiver pronta — antes disso, apenas confirme que a conta foi salva sem erro).

- [ ] **Step 6: Commit**

```bash
git add _api/email/accounts.ts src/services/EmailService.ts src/domains/email/EmailAccountsPage.tsx
git commit -m "feat: fluxo de criação de conta IMAP (autodetecção + teste de conexão + UI)"
```

---

### Task 8: Ligar IMAP no pipeline de sync (`emailSync.ts`)

**Files:**
- Modify: `_api/lib/emailSync.ts`

**Interfaces:**
- Consumes: `listMessages`, `getMessage`, `parseImapMessage` de `_api/lib/imapClient.ts` (Task 5).

- [ ] **Step 1: Adicionar o import e a função `syncImapAccount`**

```ts
// _api/lib/emailSync.ts — adicionar ao lado dos imports de gmailClient/microsoftClient
import {
  listMessages as imapListMessages,
  getMessage as imapGetMessage,
  parseImapMessage,
  ImapAccount,
} from './imapClient.js';
```

```ts
// _api/lib/emailSync.ts — ao lado de syncMicrosoftAccount
async function syncImapAccount(
  account: ImapAccount,
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];

  for (const folder of SYNC_FOLDERS) {
    try {
      const { messages } = await imapListMessages(account, folder, MESSAGES_PER_FOLDER);
      for (const msgRef of messages) {
        try {
          const full = await imapGetMessage(account, folder, msgRef.id);
          const cached = parseImapMessage(full, account.id, folder);
          setEmail(cached);
          imported++;
        } catch (err: any) {
          errors.push(`imap msg ${msgRef.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`imap folder ${folder}: ${err.message}`);
    }
  }

  return { imported, errors };
}
```

- [ ] **Step 2: Ligar o branch em `syncAccount`**

```ts
// _api/lib/emailSync.ts — dentro de syncAccount, no bloco if/else if
    if (rawAccount.provider === 'gmail') {
      result = await syncGmailAccount(account as GmailAccount);
    } else if (rawAccount.provider === 'microsoft') {
      result = await syncMicrosoftAccount(account as MicrosoftAccount);
    } else if (rawAccount.provider === 'imap') {
      result = await syncImapAccount(account as ImapAccount);
    } else {
      result.errors.push(`Unknown provider: ${rawAccount.provider}`);
    }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verificação manual — sync real de ponta a ponta**

Com a conta IMAP de teste já criada (Task 7), chame `POST /api/email/sync` (ou clique em "Sincronizar" na UI) e confirme que mensagens reais da caixa de entrada, enviados e rascunhos da conta de teste aparecem na lista do CRM.

- [ ] **Step 5: Verificação manual — Gmail/Microsoft não regrediram**

Sincronize uma conta Gmail e uma Microsoft já existentes, confirme que ambas continuam importando mensagens normalmente (o branch novo não deve interferir nos branches existentes).

- [ ] **Step 6: Commit**

```bash
git add _api/lib/emailSync.ts
git commit -m "feat: liga contas IMAP no pipeline de sincronização"
```

---

### Task 9: Ligar IMAP em ações de mensagem (`action.ts`, `messages.ts`)

**Files:**
- Modify: `_api/email/action.ts`
- Modify: `_api/email/messages.ts`

**Interfaces:**
- Consumes: `modifyMessage`, `moveMessage`, `deleteMessage`, `getMessage`, `parseImapMessage` de `_api/lib/imapClient.ts`.

- [ ] **Step 1: Adicionar `applyImapAction` em `action.ts`**

```ts
// _api/email/action.ts — adicionar import
import {
  modifyMessage as imapModify,
  moveMessage as imapMove,
  deleteMessage as imapDelete,
  ImapAccount,
} from '../lib/imapClient.js';
```

```ts
// _api/email/action.ts — ao lado de applyMicrosoftAction
async function applyImapAction(
  account: ImapAccount,
  messageId: string,
  action: EmailAction,
  currentFolder: string,
): Promise<void> {
  switch (action) {
    case 'read':
      await imapModify(account, currentFolder, messageId, ['\\Seen'], []);
      break;
    case 'unread':
      await imapModify(account, currentFolder, messageId, [], ['\\Seen']);
      break;
    case 'star':
      await imapModify(account, currentFolder, messageId, ['\\Flagged'], []);
      break;
    case 'unstar':
      await imapModify(account, currentFolder, messageId, [], ['\\Flagged']);
      break;
    case 'archive':
      await imapMove(account, currentFolder, messageId, 'archive');
      break;
    case 'trash':
      await imapMove(account, currentFolder, messageId, 'trash');
      break;
    case 'spam':
      await imapMove(account, currentFolder, messageId, 'spam');
      break;
    case 'restore':
      await imapMove(account, currentFolder, messageId, 'inbox');
      break;
    case 'delete':
      await imapDelete(account, currentFolder, messageId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
```

- [ ] **Step 2: Ligar o branch no handler de `action.ts`**

`applyImapAction` precisa da pasta atual da mensagem — busque no cache antes do branch:

```ts
// _api/email/action.ts — dentro do handler, substituir o bloco if/else if existente
    const cachedForFolder = getEmail(String(accountId), String(messageId));
    const currentFolder = cachedForFolder?.folder ?? 'inbox';

    if (account.provider === 'gmail') {
      await applyGmailAction(account as GmailAccount, String(messageId), action as EmailAction);
    } else if (account.provider === 'microsoft') {
      await applyMicrosoftAction(account as MicrosoftAccount, String(messageId), action as EmailAction);
    } else if (account.provider === 'imap') {
      await applyImapAction(account as ImapAccount, String(messageId), action as EmailAction, currentFolder);
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }
```

- [ ] **Step 3: Ligar o branch em `messages.ts` (leitura de mensagem individual)**

```ts
// _api/email/messages.ts — adicionar import
import {
  getMessage as imapGetMessage,
  parseImapMessage,
  modifyMessage as imapModifyMessage,
  ImapAccount,
} from '../lib/imapClient.js';
```

```ts
// _api/email/messages.ts — no bloco "Mark as read if not already" (linha ~52-59)
        if (!cached.isRead) {
          if (account.provider === 'gmail') {
            await gmailModifyMessage(account as GmailAccount, String(messageId), [], ['UNREAD'])
              .catch(() => {});
          } else if (account.provider === 'imap') {
            await imapModifyMessage(account as ImapAccount, cached.folder, String(messageId), ['\\Seen'], [])
              .catch(() => {});
          } else {
            await msUpdateMessage(account as MicrosoftAccount, String(messageId), { isRead: true })
              .catch(() => {});
          }
          updateEmail(String(accountId), String(messageId), { isRead: true });
        }
```

```ts
// _api/email/messages.ts — no bloco "Fetch full message" (linha ~66-83)
      let fullEmail;
      if (account.provider === 'gmail') {
        const full = await gmailGetMessage(account as GmailAccount, String(messageId), 'full');
        fullEmail = parseGmailMessage(full, String(accountId));
        await gmailModifyMessage(account as GmailAccount, String(messageId), [], ['UNREAD']).catch(() => {});
        fullEmail.isRead = true;
      } else if (account.provider === 'imap') {
        const folder = cached?.folder ?? 'inbox';
        const full = await imapGetMessage(account as ImapAccount, folder, String(messageId));
        fullEmail = parseImapMessage(full, String(accountId), folder);
        await imapModifyMessage(account as ImapAccount, folder, String(messageId), ['\\Seen'], []).catch(() => {});
        fullEmail.isRead = true;
      } else {
        const full = await msGetMessage(account as MicrosoftAccount, String(messageId));
        const folder = cached?.folder ?? 'inbox';
        fullEmail = parseMicrosoftMessage(full, String(accountId), folder);
        await msUpdateMessage(account as MicrosoftAccount, String(messageId), { isRead: true }).catch(() => {});
        fullEmail.isRead = true;
      }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificação manual — ações reais numa conta IMAP**

Na conta de teste, marque uma mensagem como lida/não lida, favorite, arquive e apague pela UI do CRM; confirme cada ação refletida tanto no CRM quanto abrindo a caixa de e-mail real do provedor (ex: Gmail web) — a mensagem deve de fato ter mudado de flag/pasta no servidor IMAP, não só no cache local.

- [ ] **Step 6: Verificação manual — Gmail/Microsoft não regrediram**

Repita as mesmas ações (ler, favoritar, arquivar, apagar) numa conta Gmail e numa Microsoft já existentes — nenhum comportamento deve ter mudado.

- [ ] **Step 7: Commit**

```bash
git add _api/email/action.ts _api/email/messages.ts
git commit -m "feat: liga contas IMAP em ações de mensagem (ler/favoritar/mover/apagar)"
```

---

### Task 10: Ligar IMAP em envio e rascunhos (`send.ts`, `draft.ts`)

**Files:**
- Modify: `_api/email/send.ts`
- Modify: `_api/email/draft.ts`

**Interfaces:**
- Consumes: `sendMessage` de `_api/lib/smtpClient.ts`; `createDraft`/`updateDraft`/`deleteDraft` de `_api/lib/imapClient.ts`; `buildMimeMessage`/`buildGmailDraftRaw` já existentes (o MIME builder do Gmail é RFC 2822 puro — reaproveitável tal como está para IMAP/SMTP, sem depender de nada específico do Gmail).

- [ ] **Step 1: Ligar o branch em `send.ts`**

```ts
// _api/email/send.ts — adicionar import
import { sendMessage as smtpSend, SmtpAccount } from '../lib/smtpClient.js';
```

```ts
// _api/email/send.ts — dentro do handler, no bloco if/else if (linha ~171-180)
    if (account.provider === 'gmail') {
      const rawMessage = buildMimeMessage(body, account.email);
      const result = await gmailSend(account as GmailAccount, rawMessage);
      sentMessageId = result?.id;
    } else if (account.provider === 'microsoft') {
      const payload = buildMicrosoftPayload(body);
      await msSend(account as MicrosoftAccount, payload);
    } else if (account.provider === 'imap') {
      const rawBuffer = Buffer.from(buildMimeMessage(body, account.email), 'base64url').toString('utf8');
      const result = await smtpSend(account as SmtpAccount, rawBuffer);
      sentMessageId = result?.id;
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }
```

Nota: `buildMimeMessage` retorna base64url (formato que o Gmail exige na API), então para SMTP puro é preciso decodificar de volta pra texto MIME puro antes de passar pro `nodemailer` — daí o `Buffer.from(..., 'base64url').toString('utf8')` acima.

- [ ] **Step 2: Ligar o branch em `draft.ts` (criação/atualização)**

```ts
// _api/email/draft.ts — adicionar import
import {
  createDraft as imapCreateDraft,
  updateDraft as imapUpdateDraft,
  deleteDraft as imapDeleteDraft,
  ImapAccount,
} from '../lib/imapClient.js';
```

```ts
// _api/email/draft.ts — dentro do POST handler, no bloco if/else if (linha ~91-113)
      if (account.provider === 'gmail') {
        const raw = buildGmailDraftRaw(body, account.email);
        if (draftId) {
          const result = await gmailUpdateDraft(account as GmailAccount, draftId, raw);
          resultId = result?.id ?? draftId;
        } else {
          const result = await gmailCreateDraft(account as GmailAccount, raw);
          resultId = result?.id ?? `draft_${Date.now()}`;
        }
      } else if (account.provider === 'microsoft') {
        const payload = buildMsDraftPayload(body);
        if (draftId) {
          const result = await msUpdateDraft(account as MicrosoftAccount, draftId, payload);
          resultId = result?.id ?? draftId;
        } else {
          const result = await msCreateDraft(account as MicrosoftAccount, payload);
          resultId = result?.id ?? `draft_${Date.now()}`;
        }
      } else if (account.provider === 'imap') {
        const rawB64 = buildGmailDraftRaw(body, account.email);
        const rawMime = Buffer.from(rawB64, 'base64url').toString('utf8');
        if (draftId) {
          const result = await imapUpdateDraft(account as ImapAccount, draftId, rawMime);
          resultId = result.id;
        } else {
          const result = await imapCreateDraft(account as ImapAccount, rawMime);
          resultId = result.id;
        }
      } else {
        return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
      }
```

- [ ] **Step 3: Ligar o branch em `draft.ts` (exclusão)**

```ts
// _api/email/draft.ts — dentro do DELETE handler (linha ~155-161)
      if (account.provider === 'gmail') {
        await gmailDeleteDraft(account as GmailAccount, draftId);
      } else if (account.provider === 'microsoft') {
        await msDeleteDraft(account as MicrosoftAccount, draftId);
      } else if (account.provider === 'imap') {
        await imapDeleteDraft(account as ImapAccount, draftId);
      } else {
        return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
      }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificação manual — envio e rascunho reais**

Na conta de teste: envie um e-mail de verdade pra você mesmo pela UI do composer do CRM (com e sem anexo), confirme que chega. Crie um rascunho, edite-o, confirme que aparece atualizado na pasta Drafts real do provedor. Apague o rascunho, confirme que sumiu.

- [ ] **Step 6: Verificação manual — Gmail/Microsoft não regrediram**

Envie um e-mail e crie/edite/apague um rascunho numa conta Gmail e numa Microsoft já existentes — comportamento idêntico ao de antes deste plano.

- [ ] **Step 7: Commit**

```bash
git add _api/email/send.ts _api/email/draft.ts
git commit -m "feat: liga contas IMAP em envio (SMTP) e rascunhos"
```

---

### Task 11: Ligar IMAP em busca (`search.ts`)

**Files:**
- Modify: `_api/email/search.ts`

**Interfaces:**
- Consumes: `listMessages`, `getMessage`, `parseImapMessage` de `_api/lib/imapClient.ts`.

- [ ] **Step 1: Adicionar `searchImap`**

```ts
// _api/email/search.ts — adicionar import
import {
  listMessages as imapListMessages,
  getMessage as imapGetMessage,
  parseImapMessage,
  ImapAccount,
} from '../lib/imapClient.js';
```

```ts
// _api/email/search.ts — ao lado de searchMicrosoft
async function searchImap(
  account: ImapAccount,
  q: string,
  folder?: string,
): Promise<CachedEmail[]> {
  const folders = folder && folder !== 'all' ? [folder] : ['inbox'];
  const lowerQ = q.toLowerCase();
  const results: CachedEmail[] = [];

  for (const f of folders) {
    const { messages } = await imapListMessages(account, f, MAX_RESULTS);
    for (const ref of messages) {
      if (results.length >= MAX_RESULTS) break;
      try {
        const full = await imapGetMessage(account, f, ref.id);
        const parsed = parseImapMessage(full, account.id, f);
        if (
          parsed.subject.toLowerCase().includes(lowerQ) ||
          parsed.from.email.toLowerCase().includes(lowerQ) ||
          parsed.snippet.toLowerCase().includes(lowerQ)
        ) {
          results.push(parsed);
        }
      } catch {
        // skip individual failures, igual searchGmail/searchMicrosoft
      }
    }
  }

  return results;
}
```

Nota: IMAP não tem um endpoint de busca server-side tão direto quanto Gmail `q=` ou Graph `$search` sem configuração adicional (`SEARCH` do protocolo IMAP existe, mas exige parsing de critérios complexos) — para paridade funcional na Fase 1, a busca IMAP varre as mensagens da pasta (limitadas a `MAX_RESULTS`) e filtra em memória, igual ao `searchCache` que já roda antes disso. Buscar via `SEARCH` nativo do protocolo fica como melhoria futura se o volume de mensagens tornar isso lento — não é regressão, é paridade com o que já existe pra Gmail/Microsoft via `searchCache` como primeira tentativa.

- [ ] **Step 2: Ligar o branch no handler**

```ts
// _api/email/search.ts — dentro do handler (linha ~159-171)
      if (account.provider === 'gmail') {
        apiResults = await searchGmail(
          account as GmailAccount,
          String(q),
          folder ? String(folder) : undefined,
        );
      } else if (account.provider === 'microsoft') {
        apiResults = await searchMicrosoft(
          account as MicrosoftAccount,
          String(q),
          folder ? String(folder) : undefined,
        );
      } else if (account.provider === 'imap') {
        apiResults = await searchImap(
          account as ImapAccount,
          String(q),
          folder ? String(folder) : undefined,
        );
      }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verificação manual**

Na conta de teste, busque por um termo que você sabe que existe no assunto de uma mensagem real da inbox, confirme que aparece nos resultados.

- [ ] **Step 5: Verificação manual — Gmail/Microsoft não regrediram**

Repita a mesma busca numa conta Gmail e numa Microsoft já existentes.

- [ ] **Step 6: Commit**

```bash
git add _api/email/search.ts
git commit -m "feat: liga contas IMAP em busca de mensagens"
```

---

### Task 12: Verificação final de ponta a ponta e regressão

**Files:** nenhum (só verificação manual).

- [ ] **Step 1: Rodar a suíte completa de testes automatizados**

Run: `npm test`
Expected: todos os testes das Tasks 1, 2 e 4 passando (nenhuma rede envolvida, deve ser rápido e determinístico).

- [ ] **Step 2: Type-check completo**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Checklist manual de paridade das 3 contas**

Com uma conta Gmail, uma Microsoft e a conta IMAP de teste, todas conectadas ao mesmo tempo no CRM, para cada uma confirme:
- [ ] Sincroniza mensagens de inbox/sent/drafts.
- [ ] Marcar como lida/não lida funciona e reflete no provedor real.
- [ ] Favoritar/desfavoritar funciona.
- [ ] Arquivar/mover pra spam/lixeira/restaurar funciona.
- [ ] Apagar permanentemente funciona.
- [ ] Enviar e-mail (com e sem anexo) funciona e chega no destinatário.
- [ ] Criar, editar e apagar rascunho funciona.
- [ ] Busca por assunto/remetente retorna resultados.

- [ ] **Step 4: Registrar o resultado**

Se todas as caixas do checklist acima passarem para as 3 contas, a Fase 1 está funcionalmente completa. Se algum item falhar só pra IMAP (não pra Gmail/Microsoft), volte pra task correspondente antes de considerar a fase concluída — não é permitido fechar a Fase 1 com paridade parcial entre os 3 provedores (ADR-2 do spec).

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "fix: ajustes finais de paridade IMAP encontrados na verificação de ponta a ponta"
```

(Pular este commit se nenhum ajuste foi necessário.)

---

## Self-Review

**Cobertura do spec:** Task 1-2 cobrem o risco 1. Task 3 cobre ADR-3 e a seção 3.1. Tasks 4-6 cobrem ADR-1. Tasks 7-11 cobrem ADR-2 (assinatura pública espelhada + branch cirúrgico em cada consumidor). Task 12 cobre o risco 5 (verificação explícita de não-regressão). Nenhum item da Fase 1 (seção 7 do spec) ficou sem task correspondente.

**Placeholders:** nenhum `TBD`/`TODO` — todo código é implementação real. As únicas simplificações deliberadas (mapeamento fixo de 6 pastas, busca IMAP em memória em vez de `SEARCH` nativo, `threadId = uid`) estão documentadas inline como decisões da Fase 1, com a fase futura que as revisita (Fase 2 e Fase 5 do spec) citada explicitamente.

**Consistência de tipos:** `ImapAccount`/`SmtpAccount` usam os mesmos nomes de campo (`imapHost`, `smtpHost`, `passwordEncrypted`, etc.) em `imapClient.ts`, `smtpClient.ts`, `accounts.ts` e no schema Drizzle — checado a cada task que os consome. `CachedEmail.provider` e `EmailAccount.provider` widened de forma idêntica nos 3 arquivos que os declaram (`src/types.ts`, `src/services/EmailService.ts`, `_api/lib/emailCache.ts`).
