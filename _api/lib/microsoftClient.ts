import { fsUpdate } from './pgData.js';
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

// ── Pastas reais (árvore aninhada) ────────────────────────────────────────────

export interface MsFolderNode {
  id: string;
  name: string;
  // null = raiz da caixa; uma das 6 chaves fixas de FOLDER_MAP ('inbox'/'sent'/'drafts'/
  // 'trash'/'spam'/'archive') = dentro de uma pasta padrão (ex.: subpasta dentro de
  // Inbox); qualquer outro valor = id real de outra pasta customizada (subpasta de
  // subpasta).
  parentId: string | null;
  unreadCount: number;
  totalCount: number;
}

// Nomes estáveis (well-known folder names) que o Graph aceita em /me/mailFolders/{nome}
// independente do idioma da caixa — NUNCA comparar por displayName: numa conta em
// PT-BR, displayName vem "Caixa de Entrada"/"Itens Enviados"/"Itens Excluídos"/"Lixo
// Eletrônico", não "Inbox"/"Sent Items"/etc. (confirmado em produção, 2026-09-13 —
// era exatamente por isso que a pasta padrão vinha duplicada como "customizada" e a
// subpasta real não aninhava sob a linha fixa certa).
const WELL_KNOWN_GRAPH_NAMES: Record<string, string> = {
  inbox: 'inbox', sent: 'sentitems', drafts: 'drafts',
  trash: 'deleteditems', spam: 'junkemail', archive: 'archive',
};

// Busca o id REAL de cada well-known folder (uma vez por chamada) via o nome estável,
// pra poder reconhecer essas pastas na árvore de /me/mailFolders sem depender de
// displayName. Falhas individuais (ex.: conta sem pasta "archive") são ignoradas.
async function resolveWellKnownIds(account: MicrosoftAccount): Promise<Map<string, string>> {
  const idToKey = new Map<string, string>();
  await Promise.all(Object.entries(WELL_KNOWN_GRAPH_NAMES).map(async ([key, graphName]) => {
    try {
      const folder = await graphRequest(account, `me/mailFolders/${graphName}`);
      if (folder?.id) idToKey.set(folder.id, key);
    } catch {
      // Pasta well-known ausente nesta conta — segue sem ela.
    }
  }));
  return idToKey;
}

// Well-known folders (Inbox, Sent Items, Drafts, Deleted Items, Junk Email, Archive) já
// aparecem fixos no FolderNav (com tradução PT-BR e ícone específico) e não são
// duplicados aqui — mas suas SUBPASTAS reais (ex.: uma pasta criada dentro de Inbox) são
// descobertas e devolvidas com parentId apontando pra chave fixa correspondente, pra que
// o frontend consiga aninhá-las sob a linha certa mesmo sem re-listar o pai.
async function fetchChildFolders(
  account: MicrosoftAccount,
  realParentId: string,
  mappedParentId: MsFolderNode['parentId'],
): Promise<MsFolderNode[]> {
  const data = await graphRequest(
    account,
    `me/mailFolders/${encodeURIComponent(realParentId)}/childFolders?$top=100`,
  );
  const children: any[] = data?.value ?? [];
  const out: MsFolderNode[] = [];
  for (const f of children) {
    out.push({
      id: f.id,
      name: f.displayName,
      parentId: mappedParentId,
      unreadCount: f.unreadItemCount ?? 0,
      totalCount: f.totalItemCount ?? 0,
    });
    if (f.childFolderCount > 0) {
      // A partir daqui o pai já é uma pasta customizada de verdade — usa o id real dela,
      // não mais uma chave fixa (só o primeiro nível abaixo de um well-known usa a chave).
      out.push(...(await fetchChildFolders(account, f.id, f.id)));
    }
  }
  return out;
}

export async function listFolders(account: MicrosoftAccount): Promise<MsFolderNode[]> {
  const [data, wellKnownIds] = await Promise.all([
    graphRequest(account, 'me/mailFolders?$top=100'),
    resolveWellKnownIds(account),
  ]);
  const topLevel: any[] = data?.value ?? [];
  const out: MsFolderNode[] = [];
  for (const f of topLevel) {
    const wellKnownKey = wellKnownIds.get(f.id);
    if (!wellKnownKey) {
      // Pasta customizada de nível raiz (fora de Inbox) — também é uma pasta real que
      // hoje não aparece em lugar nenhum da árvore fixa.
      out.push({
        id: f.id, name: f.displayName, parentId: null,
        unreadCount: f.unreadItemCount ?? 0, totalCount: f.totalItemCount ?? 0,
      });
    }
    if (f.childFolderCount > 0) {
      // Se for um well-known (ex.: Inbox, id resolvido via nome estável), os filhos
      // entram com parentId = chave fixa ('inbox'); senão, com o id real da pasta
      // customizada de nível raiz.
      out.push(...(await fetchChildFolders(account, f.id, wellKnownKey ?? f.id)));
    }
  }
  return out;
}

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
  // Se `folder` não é uma das 6 chaves fixas, é o id real de uma pasta descoberta via
  // listFolders (Graph aceita o id real diretamente no mesmo lugar do nome well-known).
  const folderPath = FOLDER_MAP[folder] ?? folder;
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

// Graph já entrega contentId/contentBytes direto no attachment expandido (sem precisar
// remontar árvore MIME como o Gmail) — sem isso, toda imagem embutida (assinatura, e-mail
// de marketing) virava um gif transparente em branco no sanitizador do front.
function resolveInlineImages(html: string, rawAttachments: any[]): string {
  if (!html) return html;
  const inline = rawAttachments.filter((att) => att.contentId && att.contentBytes);
  if (inline.length === 0) return html;
  return html.replace(/src\s*=\s*["']cid:([^"']+)["']/gi, (match, cid) => {
    const att = inline.find((a) => a.contentId === cid || a.contentId === `<${cid}>`);
    return att ? `src="data:${att.contentType ?? 'application/octet-stream'};base64,${att.contentBytes}"` : match;
  });
}

export function parseMicrosoftMessage(msg: any, accountId: string, folder = 'inbox'): CachedEmail {
  const rawAttachments: any[] = msg.attachments ?? [];
  const attachments: CachedEmail['attachments'] = rawAttachments.map((att: any) => ({
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
    if (body.contentType === 'html') email.bodyHtml = resolveInlineImages(body.content, rawAttachments);
    else email.bodyText = body.content;
  }

  if (attachments && attachments.length > 0) email.attachments = attachments;

  return email;
}
