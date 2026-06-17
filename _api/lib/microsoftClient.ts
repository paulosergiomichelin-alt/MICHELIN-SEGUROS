import { fsUpdate } from './adminFirebase.js';
import { encrypt, decrypt } from './emailEncryption.js';
import { CachedEmail } from './emailCache.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export interface MicrosoftAccount {
  id: string;
  userId: string;
  email: string;
  accessToken: string;   // encrypted
  refreshToken: string;  // encrypted
  tokenExpiry: number;
  provider: 'microsoft';
  [key: string]: any;
}

// ── Folder mapping ────────────────────────────────────────────────────────────

const FOLDER_MAP: Record<string, string> = {
  inbox: 'inbox',
  sent: 'sentitems',
  drafts: 'drafts',
  trash: 'deleteditems',
  spam: 'junkemail',
  archive: 'archive',
};

// ── Token management ──────────────────────────────────────────────────────────

export async function refreshMicrosoftToken(account: MicrosoftAccount): Promise<string> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI not set');
  }

  const refreshToken = decrypt(account.refreshToken);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token refresh failed: ${text}`);
  }

  const data = await res.json() as any;
  const newAccessToken: string = data.access_token;
  const expiresIn: number = data.expires_in ?? 3600;
  const newExpiry = Date.now() + expiresIn * 1000;

  await fsUpdate('email_accounts', account.id, {
    accessToken: encrypt(newAccessToken),
    tokenExpiry: newExpiry,
    ...(data.refresh_token ? { refreshToken: encrypt(data.refresh_token) } : {}),
  });

  account.accessToken = encrypt(newAccessToken);
  account.tokenExpiry = newExpiry;
  if (data.refresh_token) account.refreshToken = encrypt(data.refresh_token);

  return newAccessToken;
}

export async function ensureValidToken(account: MicrosoftAccount): Promise<string> {
  if (account.tokenExpiry && Date.now() < account.tokenExpiry - 5 * 60 * 1000) {
    return decrypt(account.accessToken);
  }
  return refreshMicrosoftToken(account);
}

// ── Generic request helper ────────────────────────────────────────────────────

export async function graphRequest(
  account: MicrosoftAccount,
  path: string,
  opts: RequestInit = {},
): Promise<any> {
  const token = await ensureValidToken(account);
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}/${path}`;
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
    throw new Error(`Graph API ${path}: ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ── Messages ──────────────────────────────────────────────────────────────────

const MESSAGE_SELECT = [
  'id', 'subject', 'from', 'toRecipients', 'ccRecipients', 'receivedDateTime',
  'bodyPreview', 'isRead', 'flag', 'hasAttachments', 'conversationId',
  'internetMessageId', 'importance',
].join(',');

export async function listMessages(
  account: MicrosoftAccount,
  folder: string,
  top = 50,
  skip = 0,
): Promise<{ messages: any[]; nextLink?: string }> {
  const folderPath = FOLDER_MAP[folder] ?? 'inbox';
  const params = new URLSearchParams({
    $select: MESSAGE_SELECT,
    $top: String(top),
    $skip: String(skip),
    $orderby: 'receivedDateTime desc',
  });

  const data = await graphRequest(account, `me/mailFolders/${folderPath}/messages?${params}`);
  return {
    messages: data?.value ?? [],
    nextLink: data?.['@odata.nextLink'],
  };
}

export async function getMessage(account: MicrosoftAccount, id: string): Promise<any> {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}?$expand=attachments`);
}

export async function sendMessage(account: MicrosoftAccount, payload: any): Promise<void> {
  await graphRequest(account, 'me/sendMail', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createDraft(account: MicrosoftAccount, payload: any): Promise<any> {
  return graphRequest(account, 'me/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDraft(
  account: MicrosoftAccount,
  id: string,
  payload: any,
): Promise<any> {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteDraft(account: MicrosoftAccount, id: string): Promise<void> {
  await graphRequest(account, `me/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function moveMessage(
  account: MicrosoftAccount,
  id: string,
  destinationId: string,
): Promise<any> {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    body: JSON.stringify({ destinationId }),
  });
}

export async function updateMessage(
  account: MicrosoftAccount,
  id: string,
  patch: any,
): Promise<any> {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteMessage(account: MicrosoftAccount, id: string): Promise<void> {
  await graphRequest(account, `me/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getAttachments(account: MicrosoftAccount, id: string): Promise<any[]> {
  const data = await graphRequest(account, `me/messages/${encodeURIComponent(id)}/attachments`);
  return data?.value ?? [];
}

export async function getDeltaMessages(
  account: MicrosoftAccount,
  folder: string,
  deltaLink?: string,
): Promise<{ messages: any[]; nextDeltaLink?: string }> {
  const folderPath = FOLDER_MAP[folder] ?? 'inbox';
  const url = deltaLink ?? `me/mailFolders/${folderPath}/messages/delta?$select=${MESSAGE_SELECT}`;

  const data = await graphRequest(account, url);
  const messages: any[] = [];
  let nextDeltaLink: string | undefined;

  if (data) {
    messages.push(...(data.value ?? []));
    nextDeltaLink = data['@odata.deltaLink'];
    // Handle multiple pages
    let nextLink: string | undefined = data['@odata.nextLink'];
    while (nextLink) {
      const page = await graphRequest(account, nextLink);
      messages.push(...(page?.value ?? []));
      nextDeltaLink = page?.['@odata.deltaLink'] ?? nextDeltaLink;
      nextLink = page?.['@odata.nextLink'];
    }
  }

  return { messages, nextDeltaLink };
}

// ── Message parser ────────────────────────────────────────────────────────────

function msAddressToEmailObj(
  addr: any,
): { name?: string; email: string } {
  const em = addr?.emailAddress ?? {};
  return {
    name: em.name || undefined,
    email: (em.address ?? '').toLowerCase(),
  };
}

function msAddressListToEmailObjs(
  list: any[],
): { name?: string; email: string }[] {
  if (!Array.isArray(list)) return [];
  return list.map(msAddressToEmailObj).filter(a => a.email);
}

function msMessageToFolder(msg: any): string {
  // Microsoft does not return folder in message by default; caller injects it
  return msg._folder ?? 'inbox';
}

export function parseMicrosoftMessage(msg: any, accountId: string, folder = 'inbox'): CachedEmail {
  const attachments: CachedEmail['attachments'] = (msg.attachments ?? []).map((att: any) => ({
    id: att.id,
    filename: att.name ?? 'attachment',
    mimeType: att.contentType ?? 'application/octet-stream',
    size: att.size ?? 0,
  }));

  const email: CachedEmail = {
    id: msg.id,
    accountId,
    provider: 'microsoft',
    folder,
    threadId: msg.conversationId,
    subject: msg.subject ?? '(sem assunto)',
    from: msAddressToEmailObj(msg.from),
    to: msAddressListToEmailObjs(msg.toRecipients ?? []),
    date: msg.receivedDateTime ?? new Date().toISOString(),
    snippet: msg.bodyPreview ?? '',
    isRead: Boolean(msg.isRead),
    isStarred: msg.flag?.flagStatus === 'flagged',
    hasAttachments: Boolean(msg.hasAttachments),
    fetchedAt: Date.now(),
  };

  const cc = msAddressListToEmailObjs(msg.ccRecipients ?? []);
  if (cc.length > 0) email.cc = cc;

  const body = msg.body;
  if (body) {
    if (body.contentType === 'html') email.bodyHtml = body.content;
    else email.bodyText = body.content;
  }

  if (attachments && attachments.length > 0) email.attachments = attachments;

  return email;
}
