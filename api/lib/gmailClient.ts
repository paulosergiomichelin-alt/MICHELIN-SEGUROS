import { fsUpdate } from './adminFirebase.js';
import { encrypt, decrypt } from './emailEncryption.js';
import { CachedEmail } from './emailCache.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GmailAccount {
  id: string;
  userId: string;
  email: string;
  accessToken: string;   // encrypted
  refreshToken: string;  // encrypted
  tokenExpiry: number;
  provider: 'gmail';
  [key: string]: any;
}

// ── Token management ──────────────────────────────────────────────────────────

export async function refreshGmailToken(account: GmailAccount): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GMAIL_CLIENT_ID/SECRET not set');

  const refreshToken = decrypt(account.refreshToken);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${text}`);
  }

  const data = await res.json() as any;
  const newAccessToken: string = data.access_token;
  const expiresIn: number = data.expires_in ?? 3600;
  const newExpiry = Date.now() + expiresIn * 1000;

  // Persist updated token
  await fsUpdate('email_accounts', account.id, {
    accessToken: encrypt(newAccessToken),
    tokenExpiry: newExpiry,
  });

  account.accessToken = encrypt(newAccessToken);
  account.tokenExpiry = newExpiry;

  return newAccessToken;
}

export async function ensureValidToken(account: GmailAccount): Promise<string> {
  // If token expires in less than 5 minutes, refresh
  if (account.tokenExpiry && Date.now() < account.tokenExpiry - 5 * 60 * 1000) {
    return decrypt(account.accessToken);
  }
  return refreshGmailToken(account);
}

// ── Generic request helper ────────────────────────────────────────────────────

export async function gmailRequest(
  account: GmailAccount,
  path: string,
  opts: RequestInit = {},
): Promise<any> {
  const token = await ensureValidToken(account);
  const url = path.startsWith('http') ? path : `${GMAIL_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${path}: ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ── Folder → labelId mapping ──────────────────────────────────────────────────

const FOLDER_LABEL_MAP: Record<string, string[]> = {
  inbox: ['INBOX'],
  sent: ['SENT'],
  drafts: ['DRAFT'],
  trash: ['TRASH'],
  spam: ['SPAM'],
  archive: [], // no INBOX, no TRASH — just no special label
};

// ── Messages ──────────────────────────────────────────────────────────────────

export async function listMessages(
  account: GmailAccount,
  folder: string,
  maxResults = 50,
  pageToken?: string,
): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
  const labelIds = FOLDER_LABEL_MAP[folder] ?? ['INBOX'];

  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (labelIds.length > 0) {
    for (const label of labelIds) params.append('labelIds', label);
  } else {
    // archive: exclude INBOX, TRASH, SPAM, DRAFT, SENT
    params.set('q', '-in:inbox -in:trash -in:spam -in:drafts -in:sent');
  }
  if (pageToken) params.set('pageToken', pageToken);

  const data = await gmailRequest(account, `/users/me/messages?${params}`);
  return {
    messages: data?.messages ?? [],
    nextPageToken: data?.nextPageToken,
  };
}

export async function getMessage(
  account: GmailAccount,
  id: string,
  format: 'full' | 'metadata' | 'minimal' = 'full',
): Promise<any> {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}?format=${format}`);
}

export async function sendMessage(account: GmailAccount, raw: string): Promise<any> {
  return gmailRequest(account, '/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
}

export async function createDraft(account: GmailAccount, raw: string): Promise<any> {
  return gmailRequest(account, '/users/me/drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { raw } }),
  });
}

export async function updateDraft(
  account: GmailAccount,
  draftId: string,
  raw: string,
): Promise<any> {
  return gmailRequest(account, `/users/me/drafts/${encodeURIComponent(draftId)}`, {
    method: 'PUT',
    body: JSON.stringify({ message: { raw } }),
  });
}

export async function deleteDraft(account: GmailAccount, draftId: string): Promise<void> {
  await gmailRequest(account, `/users/me/drafts/${encodeURIComponent(draftId)}`, {
    method: 'DELETE',
  });
}

export async function modifyMessage(
  account: GmailAccount,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<any> {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function trashMessage(account: GmailAccount, id: string): Promise<any> {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}/trash`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function untrashMessage(account: GmailAccount, id: string): Promise<any> {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}/untrash`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getProfile(account: GmailAccount): Promise<any> {
  return gmailRequest(account, '/users/me/profile');
}

export async function getHistory(
  account: GmailAccount,
  startHistoryId: string,
  labelId?: string,
): Promise<any> {
  const params = new URLSearchParams({ startHistoryId });
  if (labelId) params.set('labelId', labelId);
  return gmailRequest(account, `/users/me/history?${params}`);
}

export async function getAttachment(
  account: GmailAccount,
  msgId: string,
  attachmentId: string,
): Promise<any> {
  return gmailRequest(
    account,
    `/users/me/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}

// ── MIME parsing helpers ──────────────────────────────────────────────────────

function b64UrlDecode(str: string): string {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function b64UrlDecodeBuffer(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

interface ParsedMime {
  bodyHtml?: string;
  bodyText?: string;
  attachments: { id?: string; filename: string; mimeType: string; size: number }[];
}

function parsePart(part: any, result: ParsedMime): void {
  const mimeType: string = part.mimeType ?? '';
  const body = part.body ?? {};
  const data: string | undefined = body.data;
  const attachmentId: string | undefined = body.attachmentId;
  const filename: string = part.filename ?? '';

  if (mimeType === 'text/html' && data && !result.bodyHtml) {
    result.bodyHtml = b64UrlDecode(data);
    return;
  }

  if (mimeType === 'text/plain' && data && !result.bodyText) {
    result.bodyText = b64UrlDecode(data);
    return;
  }

  // Inline image or attachment
  if (filename && (attachmentId || data)) {
    const size: number = body.size ?? (data ? b64UrlDecodeBuffer(data).length : 0);
    result.attachments.push({
      id: attachmentId,
      filename,
      mimeType,
      size,
    });
    return;
  }

  // Recurse into multipart
  if (mimeType.startsWith('multipart/') && Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      parsePart(subPart, result);
    }
  }
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseAddress(raw: string): { name?: string; email: string } {
  // Matches: "Name <email@example.com>" or "email@example.com"
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim() || undefined, email: match[2].trim().toLowerCase() };
  }
  return { email: raw.trim().toLowerCase() };
}

function parseAddressList(raw: string): { name?: string; email: string }[] {
  if (!raw) return [];
  // Split by comma but not within quotes or angle brackets
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of raw) {
    if (ch === '<') { depth++; current += ch; }
    else if (ch === '>') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map(parseAddress).filter(a => a.email);
}

function labelIdsToFolder(labelIds: string[]): string {
  if (labelIds.includes('TRASH')) return 'trash';
  if (labelIds.includes('SPAM')) return 'spam';
  if (labelIds.includes('DRAFT')) return 'drafts';
  if (labelIds.includes('SENT')) return 'sent';
  if (labelIds.includes('INBOX')) return 'inbox';
  return 'archive';
}

export function parseGmailMessage(msg: any, accountId: string): CachedEmail {
  const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
  const labelIds: string[] = msg.labelIds ?? [];

  const subject = getHeader(headers, 'subject') || '(sem assunto)';
  const fromRaw = getHeader(headers, 'from');
  const toRaw = getHeader(headers, 'to');
  const ccRaw = getHeader(headers, 'cc');
  const dateRaw = getHeader(headers, 'date');

  const from = parseAddress(fromRaw);
  const to = parseAddressList(toRaw);
  const cc = ccRaw ? parseAddressList(ccRaw) : undefined;
  const date = dateRaw ? new Date(dateRaw).toISOString() : new Date(Number(msg.internalDate)).toISOString();

  const parsed: ParsedMime = { attachments: [] };
  if (msg.payload) {
    parsePart(msg.payload, parsed);
  }

  const folder = labelIdsToFolder(labelIds);
  const isRead = !labelIds.includes('UNREAD');
  const isStarred = labelIds.includes('STARRED');
  const hasAttachments = parsed.attachments.length > 0;

  const email: CachedEmail = {
    id: msg.id,
    accountId,
    provider: 'gmail',
    folder,
    threadId: msg.threadId,
    subject,
    from,
    to,
    date,
    snippet: msg.snippet ?? '',
    isRead,
    isStarred,
    hasAttachments,
    fetchedAt: Date.now(),
  };

  if (cc && cc.length > 0) email.cc = cc;
  if (parsed.bodyHtml) email.bodyHtml = parsed.bodyHtml;
  if (parsed.bodyText) email.bodyText = parsed.bodyText;
  if (parsed.attachments.length > 0) email.attachments = parsed.attachments;

  return email;
}
