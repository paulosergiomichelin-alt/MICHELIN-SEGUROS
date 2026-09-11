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
    if (!info) throw new Error('Falha ao gravar rascunho via APPEND (servidor não confirmou)');
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
