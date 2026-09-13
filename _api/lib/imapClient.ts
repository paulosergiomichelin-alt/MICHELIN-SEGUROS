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

/** Chaves de pasta que o resto do módulo de e-mail usa (vocabulário interno). */
const FOLDER_KEYS = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive'] as const;

// Fallback: só é usado quando o servidor não anuncia a special-use flag da pasta.
// Estes nomes NÃO valem para os provedores que imapAutodetect recomenda
// (Gmail usa "[Gmail]/Sent Mail", Outlook usa "Sent Items", Yahoo usa "Draft"…),
// por isso a resolução real é feita por `resolveFolderPath` via LIST + special-use.
const FOLDER_PATH_MAP: Record<string, string> = {
  inbox: 'INBOX',
  sent: 'Sent',
  drafts: 'Drafts',
  trash: 'Trash',
  spam: 'Junk',
  archive: 'Archive',
};

// RFC 6154 special-use attributes por chave de pasta interna.
const FOLDER_SPECIAL_USE: Record<string, string> = {
  sent: '\\Sent',
  drafts: '\\Drafts',
  trash: '\\Trash',
  spam: '\\Junk',
  archive: '\\Archive',
};

type MailboxList = Awaited<ReturnType<ImapFlow['list']>>;

// Uma única chamada LIST por conexão (moveMessage resolve duas pastas).
const listCache = new WeakMap<ImapFlow, Promise<MailboxList>>();

async function listMailboxes(client: ImapFlow): Promise<MailboxList> {
  let pending = listCache.get(client);
  if (!pending) {
    pending = client.list();
    listCache.set(client, pending);
  }
  return pending;
}

function fallbackFolderPath(folder: string): string {
  return FOLDER_PATH_MAP[folder] ?? 'INBOX';
}

/**
 * Traduz a chave interna de pasta ('sent', 'drafts', …) para o caminho real da
 * mailbox no servidor, usando a special-use flag (RFC 6154) exposta pelo LIST.
 * Só cai no palpite hardcoded de FOLDER_PATH_MAP se o servidor não anunciar a flag.
 */
async function resolveFolderPath(client: ImapFlow, folder: string): Promise<string> {
  if (folder === 'inbox') return 'INBOX';

  const specialUse = FOLDER_SPECIAL_USE[folder];
  if (!specialUse) return fallbackFolderPath(folder);

  try {
    const boxes = await listMailboxes(client);
    const match = boxes.find(box => box.specialUse === specialUse);
    if (match?.path) return match.path;
  } catch (err: any) {
    console.error(`[imapClient] LIST falhou ao resolver "${folder}":`, err?.message);
  }

  return fallbackFolderPath(folder);
}

// ── Cache id namespaceado ─────────────────────────────────────────────────────
// UIDs IMAP são únicos apenas DENTRO de uma mailbox, não globalmente. Usar o UID
// puro como chave do emailCache faz mensagens diferentes de pastas diferentes
// colidirem (ex.: uid 3 em inbox e uid 3 em drafts) — e como action.ts descobre
// a pasta real a partir da entrada de cache, uma colisão pode direcionar
// star/archive/trash/DELETE definitivo para a mensagem errada no servidor real.
// Por isso o id de cache é `${folder}:${uid}`; os helpers abaixo traduzem entre
// "cache id" (namespaceado) e "UID IMAP" (puro, que é o que as funções deste
// arquivo recebem, sempre junto com a pasta em parâmetro separado).

export function imapCacheId(folder: string, uid: string | number): string {
  return `${folder}:${uid}`;
}

/** Extrai o UID puro de um cache id namespaceado. Idempotente: aceita UID puro. */
export function imapUid(cacheId: string): string {
  const sep = cacheId.indexOf(':');
  if (sep > 0 && (FOLDER_KEYS as readonly string[]).includes(cacheId.slice(0, sep))) {
    return cacheId.slice(sep + 1);
  }
  return cacheId;
}

/** Extrai a pasta de um cache id namespaceado, ou undefined se não houver prefixo. */
export function imapCacheFolder(cacheId: string): string | undefined {
  const sep = cacheId.indexOf(':');
  if (sep > 0) {
    const folder = cacheId.slice(0, sep);
    if ((FOLDER_KEYS as readonly string[]).includes(folder)) return folder;
  }
  return undefined;
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
  // ImapFlow emite 'error' em falhas internas DEPOIS do connect (socket caindo,
  // idle timeout, servidor desconectando). Sem listener, o EventEmitter do Node
  // transforma isso em uncaughtException — e server.ts faz process.exit(1) nela,
  // derrubando o CRM inteiro por um hiccup transiente de IMAP.
  client.on('error', (err: any) => {
    console.error('[imapClient] socket error:', err?.message);
  });
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
    const lock = await client.getMailboxLock(await resolveFolderPath(client, folder));
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
    const lock = await client.getMailboxLock(await resolveFolderPath(client, folder));
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

/**
 * Busca as N mensagens mais recentes de uma pasta usando UMA conexão e UM
 * `fetch()` em lote, em vez de uma conexão IMAP por mensagem (o padrão
 * connect-per-call de `getMessage` fazia ~150 conexões por ciclo de sync por
 * conta — risco real de throttling/ban em provedores reais).
 * Retorna objetos no mesmo formato de `getMessage`, prontos para `parseImapMessage`.
 */
export async function fetchRecentMessages(
  account: ImapAccount,
  folder: string,
  maxResults = 50,
): Promise<Array<{ uid: string; parsed: any; error?: string }>> {
  const client = await connect(account);
  try {
    const lock = await client.getMailboxLock(await resolveFolderPath(client, folder));
    try {
      const totalMessages = client.mailbox && typeof client.mailbox === 'object'
        ? (client.mailbox as any).exists ?? 0
        : 0;
      if (totalMessages === 0) return [];

      const fromSeq = Math.max(1, totalMessages - maxResults + 1);
      const out: Array<{ uid: string; parsed: any; error?: string }> = [];

      for await (const msg of client.fetch(
        `${fromSeq}:${totalMessages}`,
        { uid: true, source: true, flags: true },
      )) {
        const uid = String(msg.uid);
        if (!msg.source) {
          out.push({ uid, parsed: undefined, error: 'servidor não retornou o source da mensagem' });
          continue;
        }
        try {
          const parsed = await simpleParser(msg.source);
          out.push({ uid, parsed: { ...parsed, uid, flags: Array.from(msg.flags ?? []) } });
        } catch (err: any) {
          out.push({ uid, parsed: undefined, error: err?.message });
        }
      }

      out.reverse(); // mais recente primeiro
      return out;
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
    id: imapCacheId(folder, parsed.uid),
    accountId,
    provider: 'imap',
    folder,
    threadId: String(parsed.uid), // sem equivalente nativo — Fase 5 (ADR-10) faz o agrupamento real por References/In-Reply-To
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
    const lock = await client.getMailboxLock(await resolveFolderPath(client, folder));
    try {
      // messageFlagsAdd/Remove retornam false quando o servidor não casou nada
      // (ex.: UID obsoleto). Ignorar isso fazia o endpoint responder "success"
      // para uma operação que não aconteceu.
      if (addFlags.length > 0) {
        const ok = await client.messageFlagsAdd(uid, addFlags, { uid: true });
        if (!ok) {
          throw new Error(
            `Falha ao adicionar flags [${addFlags.join(', ')}] ao UID ${uid} em ${folder}: servidor não casou nenhuma mensagem`,
          );
        }
      }
      if (removeFlags.length > 0) {
        const ok = await client.messageFlagsRemove(uid, removeFlags, { uid: true });
        if (!ok) {
          throw new Error(
            `Falha ao remover flags [${removeFlags.join(', ')}] do UID ${uid} em ${folder}: servidor não casou nenhuma mensagem`,
          );
        }
      }
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
    const sourcePath = await resolveFolderPath(client, folder);
    const destPath = await resolveFolderPath(client, destFolder);
    const lock = await client.getMailboxLock(sourcePath);
    try {
      const result = await client.messageMove(uid, destPath, { uid: true });
      if (!result) {
        throw new Error(
          `Falha ao mover UID ${uid} de ${folder} para ${destFolder}: servidor não casou nenhuma mensagem`,
        );
      }
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
    const lock = await client.getMailboxLock(await resolveFolderPath(client, folder));
    try {
      const flagged = await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true });
      if (!flagged) {
        throw new Error(
          `Falha ao marcar UID ${uid} como \\Deleted em ${folder}: servidor não casou nenhuma mensagem`,
        );
      }
      const deleted = await client.messageDelete(uid, { uid: true });
      if (!deleted) {
        throw new Error(
          `Falha ao expurgar UID ${uid} em ${folder}: servidor não casou nenhuma mensagem`,
        );
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

// ── APPEND ────────────────────────────────────────────────────────────────────

async function appendRaw(
  account: ImapAccount,
  folder: string,
  raw: string | Buffer,
  flags: string[],
): Promise<{ uid?: string; path: string }> {
  const client = await connect(account);
  try {
    const path = await resolveFolderPath(client, folder);
    const content = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw;
    const info = await client.append(path, content, flags);
    if (!info) throw new Error(`Falha no APPEND em ${folder} (servidor não confirmou)`);
    return { uid: info.uid !== undefined && info.uid !== null ? String(info.uid) : undefined, path };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * SMTP puro, ao contrário das APIs Gmail/Graph, NÃO grava cópia em "Enviados".
 * Esta função faz o APPEND da mensagem já enviada na pasta Sent real, com \Seen.
 */
export async function appendToSent(account: ImapAccount, raw: string | Buffer): Promise<{ id?: string }> {
  const { uid } = await appendRaw(account, 'sent', raw, ['\\Seen']);
  return { id: uid !== undefined ? imapCacheId('sent', uid) : undefined };
}

// ── Rascunhos (via APPEND na pasta Drafts) ────────────────────────────────────

export async function createDraft(account: ImapAccount, raw: string): Promise<{ id: string }> {
  const { uid } = await appendRaw(account, 'drafts', raw, ['\\Draft']);
  if (uid === undefined) {
    throw new Error('Falha ao gravar rascunho via APPEND (servidor não retornou UID)');
  }
  // Namespaceado igual parseImapMessage: rascunhos passam pelo mesmo emailCache.
  return { id: imapCacheId('drafts', uid) };
}

export async function updateDraft(account: ImapAccount, draftId: string, raw: string): Promise<{ id: string }> {
  // IMAP não edita mensagem em lugar — apaga o rascunho antigo e cria um novo.
  await deleteDraft(account, draftId);
  return createDraft(account, raw);
}

export async function deleteDraft(account: ImapAccount, draftId: string): Promise<void> {
  // Aceita tanto cache id namespaceado ("drafts:12") quanto UID puro.
  await deleteMessage(account, 'drafts', imapUid(draftId));
}
