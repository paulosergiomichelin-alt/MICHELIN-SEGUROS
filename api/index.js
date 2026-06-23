var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// _api/lib/adminFirebase.ts
import { createSign } from "node:crypto";
async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var n\xE3o definida");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1e3);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform"
  })).toString("base64url");
  const sigInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(sigInput);
  const sig = signer.sign(sa.private_key, "base64url");
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 8e3);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${sigInput}.${sig}`
    }),
    signal: ctrl.signal
  }).finally(() => clearTimeout(timeoutId));
  if (!res.ok) throw new Error(`OAuth2 falhou: ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  _token = access_token;
  _tokenExpiry = Date.now() + (expires_in - 120) * 1e3;
  return _token;
}
function toValue(v) {
  if (v === null || v === void 0) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toValue(v);
  return out;
}
async function fsGet(collection, id) {
  const token2 = await getToken();
  const res = await fetch(`${FS_BASE}/documents/${collection}/${id}`, {
    headers: { Authorization: `Bearer ${token2}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fsGet ${collection}/${id}: ${await res.text()}`);
  const doc = await res.json();
  if (!doc.fields) return null;
  return fromFirestoreFields(doc.fields);
}
async function fsSet(collection, id, data) {
  const token2 = await getToken();
  const res = await fetch(`${FS_BASE}/documents/${collection}/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(data) })
  });
  if (!res.ok) throw new Error(`fsSet ${collection}/${id}: ${await res.text()}`);
}
async function fsUpdate(collection, id, data) {
  const token2 = await getToken();
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const res = await fetch(`${FS_BASE}/documents/${collection}/${id}?${mask}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(data) })
  });
  if (!res.ok) throw new Error(`fsUpdate ${collection}/${id}: ${await res.text()}`);
}
async function fsDelete(collection, id) {
  const token2 = await getToken();
  const res = await fetch(`${FS_BASE}/documents/${collection}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token2}` }
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`fsDelete ${collection}/${id}: ${await res.text()}`);
  }
}
function fromFirestoreValue(v) {
  if (v.nullValue !== void 0) return null;
  if (v.booleanValue !== void 0) return v.booleanValue;
  if (v.integerValue !== void 0) return Number(v.integerValue);
  if (v.doubleValue !== void 0) return v.doubleValue;
  if (v.stringValue !== void 0) return v.stringValue;
  if (v.mapValue) return fromFirestoreFields(v.mapValue.fields ?? {});
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(fromFirestoreValue);
  return null;
}
function fromFirestoreFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
  return out;
}
function buildStructuredQuery(collection, filters, limitN) {
  const mkFilter = (f) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: "EQUAL",
      value: { stringValue: f.value }
    }
  });
  const where = filters.length === 1 ? mkFilter(filters[0]) : { compositeFilter: { op: "AND", filters: filters.map(mkFilter) } };
  return { structuredQuery: { from: [{ collectionId: collection }], where, limit: limitN } };
}
async function fsQuery(collection, filters) {
  const token2 = await getToken();
  const res = await fetch(`${FS_BASE}/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildStructuredQuery(collection, filters, 1))
  });
  if (!res.ok) throw new Error(`fsQuery ${collection}: ${await res.text()}`);
  const rows = await res.json();
  return rows.filter((r) => r.document?.name).map((r) => ({ id: r.document.name.split("/").pop() }));
}
async function fsQueryFull(collection, filters, limitN = 500) {
  const token2 = await getToken();
  const res = await fetch(`${FS_BASE}/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildStructuredQuery(collection, filters, limitN))
  });
  if (!res.ok) throw new Error(`fsQueryFull ${collection}: ${await res.text()}`);
  const rows = await res.json();
  return rows.filter((r) => r.document?.name).map((r) => ({
    id: r.document.name.split("/").pop(),
    ...fromFirestoreFields(r.document.fields ?? {})
  }));
}
var PROJECT_ID, DATABASE_ID, FS_BASE, TOKEN_URL, _token, _tokenExpiry;
var init_adminFirebase = __esm({
  "_api/lib/adminFirebase.ts"() {
    "use strict";
    PROJECT_ID = "gen-lang-client-0929974546";
    DATABASE_ID = "ai-studio-e7cf89ac-d4c5-4bef-9fa5-57e4ac67170c";
    FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}`;
    TOKEN_URL = "https://oauth2.googleapis.com/token";
    _token = "";
    _tokenExpiry = 0;
  }
});

// _api/lib/socketRegistry.ts
function emitToSession(sessionId, event, data) {
  _io?.to(`session:${sessionId}`).emit(event, data);
}
function emitGlobal(event, data) {
  _io?.emit(event, data);
}
var _io;
var init_socketRegistry = __esm({
  "_api/lib/socketRegistry.ts"() {
    "use strict";
    _io = null;
  }
});

// _api/lib/emailCache.ts
function getOrCreateStore(accountId) {
  if (!accountStores.has(accountId)) {
    accountStores.set(accountId, {
      messages: /* @__PURE__ */ new Map(),
      folderIndex: /* @__PURE__ */ new Map(),
      syncState: { lastSync: 0, syncing: false }
    });
  }
  return accountStores.get(accountId);
}
function setEmail(email) {
  const store = getOrCreateStore(email.accountId);
  const existing = store.messages.get(email.id);
  if (existing && existing.folder !== email.folder) {
    const oldIndex = store.folderIndex.get(existing.folder) ?? [];
    store.folderIndex.set(
      existing.folder,
      oldIndex.filter((id) => id !== email.id)
    );
  }
  store.messages.set(email.id, email);
  const folderIds = store.folderIndex.get(email.folder) ?? [];
  if (!folderIds.includes(email.id)) {
    folderIds.push(email.id);
    store.folderIndex.set(email.folder, folderIds);
  }
}
function getEmail(accountId, id) {
  return accountStores.get(accountId)?.messages.get(id);
}
function updateEmail(accountId, id, patch) {
  const store = accountStores.get(accountId);
  if (!store) return;
  const existing = store.messages.get(id);
  if (!existing) return;
  const updated = { ...existing, ...patch };
  if (patch.folder && patch.folder !== existing.folder) {
    const oldIds = store.folderIndex.get(existing.folder) ?? [];
    store.folderIndex.set(existing.folder, oldIds.filter((i) => i !== id));
    const newIds = store.folderIndex.get(updated.folder) ?? [];
    if (!newIds.includes(id)) {
      newIds.push(id);
      store.folderIndex.set(updated.folder, newIds);
    }
  }
  store.messages.set(id, updated);
}
function getEmailsByFolder(accountId, folder, page = 1, limit = 50) {
  const store = accountStores.get(accountId);
  if (!store) return { emails: [], total: 0 };
  const ids = store.folderIndex.get(folder) ?? [];
  const all = ids.map((id) => store.messages.get(id)).filter(Boolean).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const offset = (page - 1) * limit;
  return {
    emails: all.slice(offset, offset + limit),
    total: all.length
  };
}
function getAllEmailsByFolder(accountId, folder) {
  const store = accountStores.get(accountId);
  if (!store) return [];
  const ids = store.folderIndex.get(folder) ?? [];
  return ids.map((id) => store.messages.get(id)).filter(Boolean).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
function removeEmail(accountId, id) {
  const store = accountStores.get(accountId);
  if (!store) return;
  const existing = store.messages.get(id);
  if (!existing) return;
  store.messages.delete(id);
  const folderIds = store.folderIndex.get(existing.folder) ?? [];
  store.folderIndex.set(existing.folder, folderIds.filter((i) => i !== id));
}
function setSyncState(accountId, state) {
  const store = getOrCreateStore(accountId);
  store.syncState = { ...store.syncState, ...state };
}
function getSyncState(accountId) {
  return getOrCreateStore(accountId).syncState;
}
function clearAccount(accountId) {
  accountStores.delete(accountId);
}
function cacheStats2() {
  const stats = {};
  for (const [accountId, store] of accountStores.entries()) {
    stats[accountId] = {
      messages: store.messages.size,
      folders: Array.from(store.folderIndex.keys())
    };
  }
  return stats;
}
function getAccountFolderCounts(accountId) {
  const store = accountStores.get(accountId);
  if (!store) return {};
  const counts = {};
  for (const [folder, ids] of store.folderIndex.entries()) {
    counts[folder] = ids.length;
  }
  return counts;
}
function getUnreadCount(accountId, folder) {
  const store = accountStores.get(accountId);
  if (!store) return 0;
  const ids = store.folderIndex.get(folder) ?? [];
  return ids.filter((id) => {
    const email = store.messages.get(id);
    return email && !email.isRead;
  }).length;
}
var accountStores;
var init_emailCache = __esm({
  "_api/lib/emailCache.ts"() {
    "use strict";
    accountStores = /* @__PURE__ */ new Map();
  }
});

// _api/lib/emailEncryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
function getKey() {
  const raw = process.env.EMAIL_ENCRYPTION_KEY ?? FALLBACK_KEY;
  const buf = Buffer.from(raw, "utf8");
  const key = Buffer.alloc(32);
  buf.copy(key, 0, 0, Math.min(buf.length, 32));
  return key;
}
function encrypt(text) {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}
function decrypt(encryptedText) {
  const key = getKey();
  const [ivHex, cipherHex] = encryptedText.split(":");
  if (!ivHex || !cipherHex) throw new Error("Invalid encrypted text format");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(cipherHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
var ALGORITHM, FALLBACK_KEY;
var init_emailEncryption = __esm({
  "_api/lib/emailEncryption.ts"() {
    "use strict";
    ALGORITHM = "aes-256-cbc";
    FALLBACK_KEY = "michelin-seguros-email-key-32chr";
  }
});

// _api/lib/gmailClient.ts
async function refreshGmailToken(account) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GMAIL_CLIENT_ID/SECRET not set");
  const refreshToken = decrypt(account.refreshToken);
  const res = await fetch(TOKEN_URL2, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${text}`);
  }
  const data = await res.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in ?? 3600;
  const newExpiry = Date.now() + expiresIn * 1e3;
  await fsUpdate("email_accounts", account.id, {
    accessToken: encrypt(newAccessToken),
    tokenExpiry: newExpiry
  });
  account.accessToken = encrypt(newAccessToken);
  account.tokenExpiry = newExpiry;
  return newAccessToken;
}
async function ensureValidToken(account) {
  if (account.tokenExpiry && Date.now() < account.tokenExpiry - 5 * 60 * 1e3) {
    return decrypt(account.accessToken);
  }
  return refreshGmailToken(account);
}
async function gmailRequest(account, path, opts = {}) {
  const token2 = await ensureValidToken(account);
  const url = path.startsWith("http") ? path : `${GMAIL_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token2}`,
      "Content-Type": "application/json",
      ...opts.headers ?? {}
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
async function listMessages(account, folder, maxResults = 50, pageToken) {
  const labelIds = FOLDER_LABEL_MAP[folder] ?? ["INBOX"];
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (labelIds.length > 0) {
    for (const label of labelIds) params.append("labelIds", label);
  } else {
    params.set("q", "-in:inbox -in:trash -in:spam -in:drafts -in:sent");
  }
  if (pageToken) params.set("pageToken", pageToken);
  const data = await gmailRequest(account, `/users/me/messages?${params}`);
  return {
    messages: data?.messages ?? [],
    nextPageToken: data?.nextPageToken
  };
}
async function getMessage(account, id, format = "full") {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}?format=${format}`);
}
async function sendMessage(account, raw) {
  return gmailRequest(account, "/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw })
  });
}
async function createDraft(account, raw) {
  return gmailRequest(account, "/users/me/drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw } })
  });
}
async function updateDraft(account, draftId, raw) {
  return gmailRequest(account, `/users/me/drafts/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    body: JSON.stringify({ message: { raw } })
  });
}
async function deleteDraft(account, draftId) {
  await gmailRequest(account, `/users/me/drafts/${encodeURIComponent(draftId)}`, {
    method: "DELETE"
  });
}
async function modifyMessage(account, id, addLabelIds, removeLabelIds) {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds, removeLabelIds })
  });
}
async function trashMessage(account, id) {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}/trash`, {
    method: "POST",
    body: JSON.stringify({})
  });
}
async function untrashMessage(account, id) {
  return gmailRequest(account, `/users/me/messages/${encodeURIComponent(id)}/untrash`, {
    method: "POST",
    body: JSON.stringify({})
  });
}
function b64UrlDecode(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function b64UrlDecodeBuffer(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function parsePart(part, result) {
  const mimeType = part.mimeType ?? "";
  const body = part.body ?? {};
  const data = body.data;
  const attachmentId = body.attachmentId;
  const filename = part.filename ?? "";
  if (mimeType === "text/html" && data && !result.bodyHtml) {
    result.bodyHtml = b64UrlDecode(data);
    return;
  }
  if (mimeType === "text/plain" && data && !result.bodyText) {
    result.bodyText = b64UrlDecode(data);
    return;
  }
  if (filename && (attachmentId || data)) {
    const size = body.size ?? (data ? b64UrlDecodeBuffer(data).length : 0);
    result.attachments.push({
      id: attachmentId,
      filename,
      mimeType,
      size
    });
    return;
  }
  if (mimeType.startsWith("multipart/") && Array.isArray(part.parts)) {
    for (const subPart of part.parts) {
      parsePart(subPart, result);
    }
  }
}
function getHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function parseAddress(raw) {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim() || void 0, email: match[2].trim().toLowerCase() };
  }
  return { email: raw.trim().toLowerCase() };
}
function parseAddressList(raw) {
  if (!raw) return [];
  const parts = [];
  let current = "";
  let depth = 0;
  for (const ch of raw) {
    if (ch === "<") {
      depth++;
      current += ch;
    } else if (ch === ">") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map(parseAddress).filter((a) => a.email);
}
function labelIdsToFolder(labelIds) {
  if (labelIds.includes("TRASH")) return "trash";
  if (labelIds.includes("SPAM")) return "spam";
  if (labelIds.includes("DRAFT")) return "drafts";
  if (labelIds.includes("SENT")) return "sent";
  if (labelIds.includes("INBOX")) return "inbox";
  return "archive";
}
function parseGmailMessage(msg, accountId) {
  const headers = msg.payload?.headers ?? [];
  const labelIds = msg.labelIds ?? [];
  const subject = getHeader(headers, "subject") || "(sem assunto)";
  const fromRaw = getHeader(headers, "from");
  const toRaw = getHeader(headers, "to");
  const ccRaw = getHeader(headers, "cc");
  const dateRaw = getHeader(headers, "date");
  const from = parseAddress(fromRaw);
  const to = parseAddressList(toRaw);
  const cc = ccRaw ? parseAddressList(ccRaw) : void 0;
  const date = dateRaw ? new Date(dateRaw).toISOString() : new Date(Number(msg.internalDate)).toISOString();
  const parsed = { attachments: [] };
  if (msg.payload) {
    parsePart(msg.payload, parsed);
  }
  const folder = labelIdsToFolder(labelIds);
  const isRead = !labelIds.includes("UNREAD");
  const isStarred = labelIds.includes("STARRED");
  const hasAttachments = parsed.attachments.length > 0;
  const email = {
    id: msg.id,
    accountId,
    provider: "gmail",
    folder,
    threadId: msg.threadId,
    subject,
    from,
    to,
    date,
    snippet: msg.snippet ?? "",
    isRead,
    isStarred,
    hasAttachments,
    fetchedAt: Date.now()
  };
  if (cc && cc.length > 0) email.cc = cc;
  if (parsed.bodyHtml) email.bodyHtml = parsed.bodyHtml;
  if (parsed.bodyText) email.bodyText = parsed.bodyText;
  if (parsed.attachments.length > 0) email.attachments = parsed.attachments;
  return email;
}
var GMAIL_BASE, TOKEN_URL2, FOLDER_LABEL_MAP;
var init_gmailClient = __esm({
  "_api/lib/gmailClient.ts"() {
    "use strict";
    init_adminFirebase();
    init_emailEncryption();
    GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";
    TOKEN_URL2 = "https://oauth2.googleapis.com/token";
    FOLDER_LABEL_MAP = {
      inbox: ["INBOX"],
      sent: ["SENT"],
      drafts: ["DRAFT"],
      trash: ["TRASH"],
      spam: ["SPAM"],
      archive: []
      // no INBOX, no TRASH — just no special label
    };
  }
});

// _api/lib/microsoftClient.ts
async function refreshMicrosoftToken(account) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI not set");
  }
  const refreshToken = decrypt(account.refreshToken);
  const res = await fetch(TOKEN_URL3, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token refresh failed: ${text}`);
  }
  const data = await res.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in ?? 3600;
  const newExpiry = Date.now() + expiresIn * 1e3;
  await fsUpdate("email_accounts", account.id, {
    accessToken: encrypt(newAccessToken),
    tokenExpiry: newExpiry,
    ...data.refresh_token ? { refreshToken: encrypt(data.refresh_token) } : {}
  });
  account.accessToken = encrypt(newAccessToken);
  account.tokenExpiry = newExpiry;
  if (data.refresh_token) account.refreshToken = encrypt(data.refresh_token);
  return newAccessToken;
}
async function ensureValidToken2(account) {
  if (account.tokenExpiry && Date.now() < account.tokenExpiry - 5 * 60 * 1e3) {
    return decrypt(account.accessToken);
  }
  return refreshMicrosoftToken(account);
}
async function graphRequest(account, path, opts = {}) {
  const token2 = await ensureValidToken2(account);
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token2}`,
      "Content-Type": "application/json",
      ...opts.headers ?? {}
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
async function listMessages2(account, folder, top = 50, skip = 0) {
  const folderPath = FOLDER_MAP[folder] ?? "inbox";
  const params = new URLSearchParams({
    $select: MESSAGE_SELECT,
    $top: String(top),
    $skip: String(skip),
    $orderby: "receivedDateTime desc"
  });
  const data = await graphRequest(account, `me/mailFolders/${folderPath}/messages?${params}`);
  return {
    messages: data?.value ?? [],
    nextLink: data?.["@odata.nextLink"]
  };
}
async function getMessage2(account, id) {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}?$expand=attachments`);
}
async function sendMessage2(account, payload) {
  await graphRequest(account, "me/sendMail", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
async function createDraft2(account, payload) {
  return graphRequest(account, "me/messages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
async function updateDraft2(account, id, payload) {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}
async function deleteDraft2(account, id) {
  await graphRequest(account, `me/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
}
async function moveMessage(account, id, destinationId) {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId })
  });
}
async function updateMessage2(account, id, patch) {
  return graphRequest(account, `me/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}
async function deleteMessage2(account, id) {
  await graphRequest(account, `me/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
}
function msAddressToEmailObj(addr) {
  const em = addr?.emailAddress ?? {};
  return {
    name: em.name || void 0,
    email: (em.address ?? "").toLowerCase()
  };
}
function msAddressListToEmailObjs(list) {
  if (!Array.isArray(list)) return [];
  return list.map(msAddressToEmailObj).filter((a) => a.email);
}
function parseMicrosoftMessage(msg, accountId, folder = "inbox") {
  const attachments = (msg.attachments ?? []).map((att) => ({
    id: att.id,
    filename: att.name ?? "attachment",
    mimeType: att.contentType ?? "application/octet-stream",
    size: att.size ?? 0
  }));
  const email = {
    id: msg.id,
    accountId,
    provider: "microsoft",
    folder,
    threadId: msg.conversationId,
    subject: msg.subject ?? "(sem assunto)",
    from: msAddressToEmailObj(msg.from),
    to: msAddressListToEmailObjs(msg.toRecipients ?? []),
    date: msg.receivedDateTime ?? (/* @__PURE__ */ new Date()).toISOString(),
    snippet: msg.bodyPreview ?? "",
    isRead: Boolean(msg.isRead),
    isStarred: msg.flag?.flagStatus === "flagged",
    hasAttachments: Boolean(msg.hasAttachments),
    fetchedAt: Date.now()
  };
  const cc = msAddressListToEmailObjs(msg.ccRecipients ?? []);
  if (cc.length > 0) email.cc = cc;
  const body = msg.body;
  if (body) {
    if (body.contentType === "html") email.bodyHtml = body.content;
    else email.bodyText = body.content;
  }
  if (attachments && attachments.length > 0) email.attachments = attachments;
  return email;
}
var GRAPH_BASE, TOKEN_URL3, FOLDER_MAP, MESSAGE_SELECT;
var init_microsoftClient = __esm({
  "_api/lib/microsoftClient.ts"() {
    "use strict";
    init_adminFirebase();
    init_emailEncryption();
    GRAPH_BASE = "https://graph.microsoft.com/v1.0";
    TOKEN_URL3 = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    FOLDER_MAP = {
      inbox: "inbox",
      sent: "sentitems",
      drafts: "drafts",
      trash: "deleteditems",
      spam: "junkemail",
      archive: "archive"
    };
    MESSAGE_SELECT = [
      "id",
      "subject",
      "from",
      "toRecipients",
      "ccRecipients",
      "receivedDateTime",
      "bodyPreview",
      "isRead",
      "flag",
      "hasAttachments",
      "conversationId",
      "internetMessageId",
      "importance"
    ].join(",");
  }
});

// _api/lib/emailSync.ts
var emailSync_exports = {};
__export(emailSync_exports, {
  scheduleEmailSync: () => scheduleEmailSync,
  stopEmailSync: () => stopEmailSync,
  syncAccount: () => syncAccount,
  syncAllAccounts: () => syncAllAccounts
});
function decryptAccount(account) {
  return {
    ...account,
    accessToken: account.accessToken,
    // keep encrypted — clients decrypt on demand
    refreshToken: account.refreshToken
  };
}
async function syncGmailAccount(account) {
  let imported = 0;
  const errors = [];
  for (const folder of SYNC_FOLDERS) {
    try {
      const { messages } = await listMessages(account, folder, MESSAGES_PER_FOLDER);
      for (const msgRef of messages) {
        try {
          const full = await getMessage(account, msgRef.id, "full");
          const cached = parseGmailMessage(full, account.id);
          setEmail(cached);
          imported++;
        } catch (err) {
          errors.push(`gmail msg ${msgRef.id}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(`gmail folder ${folder}: ${err.message}`);
    }
  }
  return { imported, errors };
}
async function syncMicrosoftAccount(account) {
  let imported = 0;
  const errors = [];
  for (const folder of SYNC_FOLDERS) {
    try {
      const { messages } = await listMessages2(account, folder, MESSAGES_PER_FOLDER);
      for (const msg of messages) {
        try {
          const cached = parseMicrosoftMessage(msg, account.id, folder);
          setEmail(cached);
          imported++;
        } catch (err) {
          errors.push(`ms msg ${msg.id}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(`ms folder ${folder}: ${err.message}`);
    }
  }
  return { imported, errors };
}
async function syncAccount(accountId) {
  const rawAccount = await fsGet("email_accounts", accountId);
  if (!rawAccount) throw new Error(`Account ${accountId} not found`);
  rawAccount.id = accountId;
  if (rawAccount.status === "error" || rawAccount.status === "disconnected") {
    return { imported: 0, errors: [`Account ${accountId} has status ${rawAccount.status}, skipping`] };
  }
  const syncState = getSyncState(accountId);
  if (syncState.syncing) {
    return { imported: 0, errors: [`Account ${accountId} already syncing`] };
  }
  setSyncState(accountId, { syncing: true });
  let result = { imported: 0, errors: [] };
  try {
    const account = decryptAccount(rawAccount);
    if (rawAccount.provider === "gmail") {
      result = await syncGmailAccount(account);
    } else if (rawAccount.provider === "microsoft") {
      result = await syncMicrosoftAccount(account);
    } else {
      result.errors.push(`Unknown provider: ${rawAccount.provider}`);
    }
    const lastSync = Date.now();
    setSyncState(accountId, { lastSync, syncing: false });
    await fsUpdate("email_accounts", accountId, { lastSync }).catch(() => {
    });
    emitGlobal("email:update", {
      type: "sync_complete",
      userId: rawAccount.userId,
      accountId,
      imported: result.imported,
      errors: result.errors,
      lastSync
    });
  } catch (err) {
    setSyncState(accountId, { syncing: false });
    result.errors.push(`syncAccount failed: ${err.message}`);
    await fsUpdate("email_accounts", accountId, { status: "error", lastError: err.message }).catch(() => {
    });
  }
  return result;
}
async function syncAllAccounts() {
  let totalImported2 = 0;
  const allErrors = [];
  let accounts = [];
  try {
    accounts = await fsQueryFull("email_accounts", [{ field: "status", value: "active" }]);
  } catch (err) {
    allErrors.push(`Failed to load accounts: ${err.message}`);
    return { accounts: 0, imported: 0, errors: allErrors };
  }
  for (const account of accounts) {
    if (!account.id) continue;
    if (account.status === "error" || account.status === "disconnected") continue;
    try {
      const result = await syncAccount(account.id);
      totalImported2 += result.imported;
      allErrors.push(...result.errors);
    } catch (err) {
      allErrors.push(`Account ${account.id}: ${err.message}`);
    }
  }
  return { accounts: accounts.length, imported: totalImported2, errors: allErrors };
}
function scheduleEmailSync(intervalMs = 5 * 60 * 1e3) {
  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(async () => {
    process.stdout.write("[EmailSync] Running scheduled sync...\n");
    try {
      const result = await syncAllAccounts();
      process.stdout.write(
        `[EmailSync] Synced ${result.accounts} accounts, ${result.imported} messages. Errors: ${result.errors.length}
`
      );
    } catch (err) {
      process.stdout.write(`[EmailSync] Scheduler error: ${err.message}
`);
    }
  }, intervalMs);
  process.stdout.write(`[EmailSync] Scheduler started (every ${intervalMs / 1e3}s)
`);
}
function stopEmailSync() {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}
var SYNC_FOLDERS, MESSAGES_PER_FOLDER, _syncTimer;
var init_emailSync = __esm({
  "_api/lib/emailSync.ts"() {
    "use strict";
    init_adminFirebase();
    init_emailCache();
    init_socketRegistry();
    init_gmailClient();
    init_microsoftClient();
    SYNC_FOLDERS = ["inbox", "sent", "drafts"];
    MESSAGES_PER_FOLDER = 50;
    _syncTimer = null;
  }
});

// _api/server.ts
import express from "express";
import axios2 from "axios";

// _api/lib/logger.ts
var LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
var IS_PROD = process.env.NODE_ENV === "production";
function minLevel() {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase();
  return LEVEL_RANK[env] !== void 0 ? env : IS_PROD ? "info" : "debug";
}
var CLR = {
  debug: "\x1B[37m",
  // white
  info: "\x1B[36m",
  // cyan
  warn: "\x1B[33m",
  // yellow
  error: "\x1B[31m"
  // red
};
var RST = "\x1B[0m";
var DIM = "\x1B[90m";
function devLine(level, ns, msg, ctx) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const ctxStr = Object.keys(ctx).length ? " " + Object.entries(ctx).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ") : "";
  return `${CLR[level]}[${level.toUpperCase().padEnd(5)}]${RST} ${DIM}${ts}${RST} [${ns}] ${msg}${ctxStr}`;
}
function prodLine(level, ns, msg, ctx) {
  return JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, ns, msg, ...ctx });
}
function writeLine(level, ns, msg, ctx) {
  const line = IS_PROD ? prodLine(level, ns, msg, ctx) : devLine(level, ns, msg, ctx);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}
function ddForward(level, ns, msg, ctx) {
  const apiKey = process.env.DD_API_KEY;
  const site = process.env.DD_SITE ?? "us5.datadoghq.com";
  if (!apiKey) return;
  const payload = [{
    ddsource: "nodejs",
    ddtags: `env:${process.env.NODE_ENV ?? "development"},service:michelin-crm-api,ns:${ns}`,
    service: "michelin-crm-api",
    level,
    message: msg,
    ...ctx,
    ts: (/* @__PURE__ */ new Date()).toISOString()
  }];
  fetch(`https://http-intake.logs.${site}/api/v2/logs`, {
    method: "POST",
    headers: { "DD-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {
  });
}
function createLogger(namespace) {
  const ns = namespace;
  function log7(level, msg, ctx = {}) {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;
    writeLine(level, ns, msg, ctx);
    if (level === "error") ddForward(level, ns, msg, ctx);
  }
  return {
    debug: (msg, ctx) => log7("debug", msg, ctx),
    info: (msg, ctx) => log7("info", msg, ctx),
    warn: (msg, ctx) => log7("warn", msg, ctx),
    error: (msg, ctx) => log7("error", msg, ctx)
  };
}
function errCtx(err, extra) {
  const base = extra ?? {};
  if (err instanceof Error) {
    return {
      ...base,
      err_type: err.constructor.name,
      err_msg: err.message,
      stack: err.stack?.split("\n").slice(1, 7).map((s) => s.trim()).join(" | ")
    };
  }
  return { ...base, err_msg: String(err) };
}
var log = createLogger("server");

// _api/lib/evolutionApi.ts
var log2 = createLogger("evolution/api");
var EVOLUTION_API_URL = () => {
  const url = process.env.EVOLUTION_API_URL;
  if (!url) throw new Error("[EvolutionAPI] EVOLUTION_API_URL env var n\xE3o definida");
  return url.replace(/\/$/, "");
};
var EVOLUTION_API_KEY = () => {
  const key = process.env.EVOLUTION_API_KEY;
  if (!key) throw new Error("[EvolutionAPI] EVOLUTION_API_KEY env var n\xE3o definida");
  return key;
};
function authHeaders() {
  return {
    apikey: EVOLUTION_API_KEY(),
    "Content-Type": "application/json"
  };
}
function fetchWithTimeout(url, opts = {}, ms = 1e4) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}
var EvolutionAPI = {
  async createInstance(instanceName, webhookUrl) {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/create`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          ...webhookUrl ? {
            webhook: {
              url: webhookUrl,
              byEvents: true,
              base64: false,
              events: [
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "MESSAGES_DELETE",
                "CONNECTION_UPDATE",
                "QRCODE_UPDATED",
                "CONTACTS_UPDATE",
                "CHATS_UPDATE",
                "CHATS_UPSERT",
                "PRESENCE_UPDATE"
              ]
            }
          } : {}
        })
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 403 && text.includes("already in use")) {
          log2.warn("createInstance: inst\xE2ncia j\xE1 existe, reutilizando", { instance: instanceName });
          return await EvolutionAPI.getInstanceInfo(instanceName) ?? { instanceName };
        }
        log2.error("createInstance falhou", { instance: instanceName, status: res.status, body: text.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log2.error("createInstance erro inesperado", { instance: instanceName, ...errCtx(err) });
      return null;
    }
  },
  async setWebhook(instanceName, webhookUrl) {
    const events = [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "CONTACTS_UPDATE",
      "CHATS_UPDATE",
      "CHATS_UPSERT",
      "PRESENCE_UPDATE"
    ];
    const payloads = [
      { webhook: { url: webhookUrl, byEvents: true, base64: false, events } },
      { url: webhookUrl, byEvents: true, base64: false, events }
    ];
    for (const body of payloads) {
      try {
        const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/webhook/set/${instanceName}`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body)
        }, 8e3);
        if (res.ok) {
          log2.info("setWebhook OK", { instance: instanceName, url: webhookUrl });
          return true;
        }
        const text = await res.text();
        log2.warn("setWebhook falhou (tentando pr\xF3ximo payload)", { instance: instanceName, status: res.status, body: text.slice(0, 200) });
      } catch (err) {
        log2.error("setWebhook erro inesperado", { instance: instanceName, ...errCtx(err) });
      }
    }
    return false;
  },
  async getQRCode(instanceName) {
    const connectAndRead = async () => {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/connect/${instanceName}`, {
        headers: authHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        log2.warn("getQRCode falhou", { instance: instanceName, status: res.status, body: text.slice(0, 200) });
        return null;
      }
      const data = await res.json();
      if (data?.base64 || data?.code) return { base64: data.base64, code: data.code };
      if (data?.qrcode?.base64) return { base64: data.qrcode.base64, code: data.qrcode.code };
      return null;
    };
    for (let i = 0; i < 3; i++) {
      try {
        const qr = await connectAndRead();
        if (qr) return qr;
        log2.debug("getQRCode: tentativa sem QR", { instance: instanceName, attempt: i + 1 });
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        log2.error("getQRCode erro inesperado", { instance: instanceName, ...errCtx(err) });
        return null;
      }
    }
    const stateRes = await EvolutionAPI.getConnectionState(instanceName);
    const currentState = (stateRes?.instance?.state ?? stateRes?.state ?? "").toLowerCase();
    log2.warn("getQRCode: sem QR ap\xF3s 3 tentativas, for\xE7ando logout", { instance: instanceName, state: currentState });
    if (currentState === "open") return null;
    try {
      await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      await new Promise((r) => setTimeout(r, 2e3));
      return await connectAndRead();
    } catch (err) {
      log2.error("getQRCode post-logout erro inesperado", { instance: instanceName, ...errCtx(err) });
      return null;
    }
  },
  async getConnectionState(instanceName) {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/connectionState/${instanceName}`, {
        headers: authHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        log2.warn("getConnectionState falhou", { instance: instanceName, status: res.status, body: text.slice(0, 200) });
        return null;
      }
      const data = await res.json();
      return data ?? null;
    } catch (err) {
      log2.error("getConnectionState erro inesperado", { instance: instanceName, ...errCtx(err) });
      return null;
    }
  },
  async logoutInstance(instanceName) {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        log2.warn("logoutInstance falhou", { instance: instanceName, status: res.status, body: text.slice(0, 200) });
      }
    } catch (err) {
      log2.error("logoutInstance erro inesperado", { instance: instanceName, ...errCtx(err) });
    }
  },
  async deleteInstance(instanceName) {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/delete/${instanceName}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        log2.warn("deleteInstance falhou", { instance: instanceName, status: res.status, body: text.slice(0, 200) });
      }
    } catch (err) {
      log2.error("deleteInstance erro inesperado", { instance: instanceName, ...errCtx(err) });
    }
  },
  async sendText(instanceName, phone, text) {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          number: phone,
          text,
          options: { delay: 1200, presence: "composing" }
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        log2.error("sendText falhou", { instance: instanceName, phone, status: res.status, body: errText.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log2.error("sendText erro inesperado", { instance: instanceName, phone, ...errCtx(err) });
      return null;
    }
  },
  async sendImage(instanceName, phone, mediaUrl, caption) {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/message/sendMedia/${instanceName}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          number: phone,
          mediatype: "image",
          media: mediaUrl,
          caption: caption ?? "",
          options: { delay: 1200, presence: "composing" }
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        log2.error("sendImage falhou", { instance: instanceName, phone, status: res.status, body: errText.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log2.error("sendImage erro inesperado", { instance: instanceName, phone, ...errCtx(err) });
      return null;
    }
  },
  async sendMediaBase64(instanceName, phone, mediatype, mimetype, base64, fileName, caption) {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/message/sendMedia/${instanceName}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          number: phone,
          mediatype,
          mimetype,
          media: base64,
          fileName: fileName ?? `arquivo.${mimetype?.split("/").pop() ?? "bin"}`,
          caption: caption ?? "",
          options: { delay: 1200, presence: "composing" }
        })
      }, 6e4);
      if (!res.ok) {
        const errText = await res.text();
        log2.error("sendMediaBase64 falhou", { instance: instanceName, phone, mediatype, status: res.status, body: errText.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log2.error("sendMediaBase64 erro inesperado", { instance: instanceName, phone, mediatype, ...errCtx(err) });
      return null;
    }
  },
  async fetchInstances() {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/fetchInstances`, {
        headers: authHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        log2.error("fetchInstances falhou", { status: res.status, body: text.slice(0, 200) });
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      log2.error("fetchInstances erro inesperado", errCtx(err));
      return [];
    }
  },
  async findChats(instanceName) {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/findChats/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ where: {} })
      }, 2e4);
      const text = await res.text();
      log2.debug("findChats resposta", { instance: instanceName, status: res.status, len: text.length });
      if (!res.ok) return [];
      try {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    } catch (err) {
      log2.error("findChats erro inesperado", { instance: instanceName, ...errCtx(err) });
      return [];
    }
  },
  // POST /chat/findMessages/{instance} com { where: { key: { remoteJid } }, limit }
  // Resposta v2.x: { messages: { total, pages, currentPage, records: [...] } }
  async findMessages(instanceName, remoteJid, msgLimit = 50) {
    const candidates = [
      { path: `/chat/findMessages/${instanceName}`, method: "POST" },
      { path: `/message/findMessages/${instanceName}`, method: "POST" }
    ];
    for (const { path, method } of candidates) {
      try {
        const url = `${EVOLUTION_API_URL()}${path}`;
        const res = await fetchWithTimeout(url, {
          method,
          headers: authHeaders(),
          body: JSON.stringify({ where: { key: { remoteJid } }, limit: msgLimit })
        }, 15e3);
        if (res.status === 404) continue;
        const text = await res.text();
        if (!res.ok) {
          log2.warn("findMessages retornou erro", { instance: instanceName, path, status: res.status });
          continue;
        }
        try {
          const data = JSON.parse(text);
          const msgs = Array.isArray(data) ? data : Array.isArray(data?.messages?.records) ? data.messages.records : Array.isArray(data?.messages) ? data.messages : [];
          log2.debug("findMessages OK", { instance: instanceName, path, count: msgs.length, total: data?.messages?.total ?? "?" });
          return msgs;
        } catch {
          continue;
        }
      } catch (err) {
        if (err?.name === "AbortError") continue;
        log2.warn("findMessages timeout/erro", { instance: instanceName, path, ...errCtx(err) });
        continue;
      }
    }
    return [];
  },
  async findContacts(instanceName) {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/findContacts/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ where: {} })
      }, 2e4);
      if (!res.ok) return [];
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    } catch (err) {
      log2.error("findContacts erro inesperado", { instance: instanceName, ...errCtx(err) });
      return [];
    }
  },
  async fetchProfilePicture(instanceName, phone) {
    const number = phone.replace(/@.*$/, "");
    try {
      const res = await fetchWithTimeout(
        `${EVOLUTION_API_URL()}/chat/fetchProfilePicture/${instanceName}?number=${number}`,
        { headers: authHeaders() },
        8e3
      );
      if (res.ok) {
        const data = await res.json();
        const pic = data?.profilePictureUrl ?? data?.url ?? data?.picture ?? null;
        if (pic) return pic;
      }
      const res2 = await fetchWithTimeout(
        `${EVOLUTION_API_URL()}/chat/fetchProfilePicture/${instanceName}`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ number })
        },
        8e3
      );
      if (res2.ok) {
        const data = await res2.json();
        return data?.profilePictureUrl ?? data?.url ?? data?.picture ?? null;
      }
      return null;
    } catch {
      return null;
    }
  },
  // Busca uma mensagem pelo key.id (WhatsApp ID) para obter key+message completos
  async findMessageById(instanceName, waId) {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/findMessages/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ where: { key: { id: waId } }, limit: 1 })
      }, 1e4);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.messages?.records?.[0] ?? null;
    } catch {
      return null;
    }
  },
  // Descriptografa mídia via Evolution API e retorna base64
  async getMediaBase64(instanceName, msg) {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/getBase64FromMediaMessage/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message: { key: msg.key, message: msg.message } })
      }, 6e4);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.base64) return null;
      return { base64: data.base64, mimetype: data.mimetype ?? "application/octet-stream" };
    } catch {
      return null;
    }
  },
  async getInstanceInfo(instanceName) {
    try {
      const res = await fetchWithTimeout(
        `${EVOLUTION_API_URL()}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) {
        const text = await res.text();
        log2.warn("getInstanceInfo falhou", { instance: instanceName, status: res.status, body: text.slice(0, 200) });
        return null;
      }
      const data = await res.json();
      if (Array.isArray(data)) return data[0] ?? null;
      return data ?? null;
    } catch (err) {
      log2.error("getInstanceInfo erro inesperado", { instance: instanceName, ...errCtx(err) });
      return null;
    }
  }
};

// _api/evolution/sessions.ts
init_adminFirebase();
var log3 = createLogger("evolution/sessions");
async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const { organizationId } = req.query ?? {};
      const filters = [];
      if (organizationId) {
        filters.push({ field: "organizationId", value: String(organizationId) });
      }
      const sessions = filters.length > 0 ? await fsQuery("whatsapp_sessions", filters) : [];
      return res.status(200).json({ sessions });
    } catch (err) {
      log3.error("GET sessions falhou", errCtx(err));
      return res.status(500).json({ error: "Erro ao listar sess\xF5es", detail: err?.message });
    }
  }
  if (req.method === "POST") {
    try {
      if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
        return res.status(503).json({
          error: "Evolution API n\xE3o configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no .env"
        });
      }
      const { userId, sessionName, organizationId } = req.body ?? {};
      if (!userId || !organizationId) {
        return res.status(400).json({ error: "userId e organizationId s\xE3o obrigat\xF3rios" });
      }
      const instanceName = sessionName || `michelin_${organizationId}_${userId}`;
      const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL || "";
      log3.info("Criando inst\xE2ncia", { instance: instanceName, webhook: webhookUrl || "(none)" });
      const result = await EvolutionAPI.createInstance(instanceName, webhookUrl);
      log3.debug("createInstance result", { instance: instanceName, result: JSON.stringify(result)?.slice(0, 200) });
      if (!result) {
        return res.status(502).json({ error: "Falha ao criar inst\xE2ncia na Evolution API. Verifique se a URL e a chave est\xE3o corretas e se o servi\xE7o est\xE1 acess\xEDvel." });
      }
      const qrInCreate = result?.qrcode ?? result?.hash?.qrcode;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await fsSet("whatsapp_sessions", instanceName, {
        id: instanceName,
        userId,
        sessionName: instanceName,
        phoneNumber: null,
        profileName: null,
        profilePicture: null,
        status: "qr",
        organizationId,
        ...qrInCreate?.base64 ? { qrBase64: qrInCreate.base64, qrCode: qrInCreate.code ?? null } : {},
        createdAt: now,
        updatedAt: now
      });
      log3.info("Sess\xE3o criada", { instance: instanceName });
      return res.status(201).json({ instanceName, status: "qr" });
    } catch (err) {
      log3.error("POST sessions falhou", { instance: req.body?.sessionName, ...errCtx(err) });
      return res.status(500).json({ error: "Erro ao criar sess\xE3o", detail: err?.message });
    }
  }
  if (req.method === "DELETE") {
    try {
      const name = String(req.query?.name ?? "");
      if (!name) {
        return res.status(400).json({ error: 'Query param "name" \xE9 obrigat\xF3rio' });
      }
      log3.info("Encerrando inst\xE2ncia", { instance: name });
      await EvolutionAPI.logoutInstance(name);
      await EvolutionAPI.deleteInstance(name);
      await fsDelete("whatsapp_sessions", name);
      return res.status(200).json({ success: true, instanceName: name });
    } catch (err) {
      log3.error("DELETE sessions falhou", { instance: req.query?.name, ...errCtx(err) });
      return res.status(500).json({ error: "Erro ao encerrar sess\xE3o", detail: err?.message });
    }
  }
  if (req.method === "PUT") {
    try {
      const { name, userId, organizationId } = req.body ?? {};
      if (!name) {
        return res.status(400).json({ error: 'Campo "name" \xE9 obrigat\xF3rio no body' });
      }
      log3.info("Reiniciando inst\xE2ncia", { instance: name });
      await EvolutionAPI.logoutInstance(String(name));
      await EvolutionAPI.deleteInstance(String(name));
      await new Promise((r) => setTimeout(r, 2e3));
      const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL || "";
      const result = await EvolutionAPI.createInstance(String(name), webhookUrl);
      log3.debug("createInstance result (PUT)", { instance: name, result: JSON.stringify(result)?.slice(0, 200) });
      if (!result) {
        return res.status(502).json({ error: "Falha ao recriar inst\xE2ncia na Evolution API" });
      }
      const qrInCreate = result?.qrcode ?? result?.hash?.qrcode;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await fsUpdate("whatsapp_sessions", String(name), {
        status: "qr",
        ...qrInCreate?.base64 ? { qrBase64: qrInCreate.base64, qrCode: qrInCreate.code ?? null } : {},
        updatedAt: now
      });
      log3.info("Inst\xE2ncia reiniciada", { instance: name });
      return res.status(200).json({ instanceName: name, status: "qr" });
    } catch (err) {
      log3.error("PUT sessions falhou", { instance: req.body?.name, ...errCtx(err) });
      return res.status(500).json({ error: "Erro ao reiniciar sess\xE3o", detail: err?.message });
    }
  }
  if (req.method === "PATCH") {
    try {
      const { name } = req.body ?? {};
      if (!name) return res.status(400).json({ error: 'Campo "name" \xE9 obrigat\xF3rio no body' });
      const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL || "";
      if (!webhookUrl) return res.status(400).json({ error: "EVOLUTION_WEBHOOK_URL n\xE3o definida no .env" });
      const ok = await EvolutionAPI.setWebhook(String(name), webhookUrl);
      if (!ok) return res.status(502).json({ error: "Falha ao definir webhook na Evolution API" });
      return res.status(200).json({ success: true, instanceName: name, webhookUrl });
    } catch (err) {
      log3.error("PATCH sessions (webhook) falhou", { instance: req.body?.name, ...errCtx(err) });
      return res.status(500).json({ error: "Erro ao definir webhook", detail: err?.message });
    }
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// _api/evolution/qr.ts
init_adminFirebase();
async function handler2(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const name = String(req.query?.name ?? "");
  if (!name) {
    return res.status(400).json({ error: 'Query param "name" \xE9 obrigat\xF3rio' });
  }
  try {
    const connState = await EvolutionAPI.getConnectionState(name);
    const state = (connState?.instance?.state ?? connState?.state ?? "").toLowerCase();
    if (state === "open") {
      console.log(`[EVOLUTION/qr] ${name} est\xE1 conectado (open) \u2014 atualizando Firestore`);
      await fsUpdate("whatsapp_sessions", name, {
        status: "open",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }).catch(
        (err) => console.error("[EVOLUTION/qr] fsUpdate open error:", err?.message)
      );
      return res.status(200).json({ status: "open", base64: null, code: null });
    }
    const qr = await EvolutionAPI.getQRCode(name);
    console.log(`[EVOLUTION/qr] getQRCode(${name}) \u2192`, JSON.stringify(qr)?.slice(0, 200));
    if (!qr) {
      return res.status(404).json({ error: "QR Code n\xE3o encontrado para a inst\xE2ncia informada" });
    }
    return res.status(200).json({
      base64: qr.base64 ?? null,
      code: qr.code ?? null,
      status: "qr"
    });
  } catch (err) {
    console.error("[EVOLUTION/qr] GET error:", err);
    return res.status(500).json({ error: "Erro ao obter QR Code", detail: err?.message });
  }
}

// _api/evolution/send.ts
init_adminFirebase();

// _api/lib/messageQueue.ts
var MAX_MESSAGES_PER_MINUTE = 20;
var MIN_DELAY_MS = 1200;
var MAX_DELAY_MS = 3500;
var MAX_ATTEMPTS = 3;
var BACKOFF_BASE_MS = 2e3;
var MAX_QUEUE_SIZE = 500;
var queues = /* @__PURE__ */ new Map();
var processing = /* @__PURE__ */ new Set();
var sentCount = /* @__PURE__ */ new Map();
function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRateLimited(instanceName) {
  const now = Date.now();
  const windowStart = now - 6e4;
  const timestamps = (sentCount.get(instanceName) ?? []).filter((t) => t > windowStart);
  sentCount.set(instanceName, timestamps);
  return timestamps.length >= MAX_MESSAGES_PER_MINUTE;
}
function recordSent(instanceName) {
  const timestamps = sentCount.get(instanceName) ?? [];
  timestamps.push(Date.now());
  sentCount.set(instanceName, timestamps);
}
async function processQueue(instanceName) {
  if (processing.has(instanceName)) return;
  processing.add(instanceName);
  try {
    const queue = queues.get(instanceName) ?? [];
    while (queue.length > 0) {
      while (isRateLimited(instanceName)) {
        console.log(`[MessageQueue] Rate limit atingido para ${instanceName} \u2014 aguardando...`);
        await sleep(5e3);
      }
      const item = queue[0];
      await sleep(randomDelay());
      let result = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          result = await EvolutionAPI.sendText(instanceName, item.phone, item.text);
          if (result) break;
          throw new Error("sendText retornou null");
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_ATTEMPTS) {
            const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
            console.warn(`[MessageQueue] Tentativa ${attempt} falhou para ${instanceName}\u2192${item.phone}. Retry em ${backoff}ms`);
            await sleep(backoff);
          }
        }
      }
      queue.shift();
      if (result) {
        recordSent(instanceName);
        item.resolve(result);
      } else {
        item.reject(lastErr ?? new Error("Falha ao enviar mensagem ap\xF3s m\xFAltiplas tentativas"));
      }
    }
  } finally {
    processing.delete(instanceName);
    if ((queues.get(instanceName) ?? []).length === 0) {
      queues.delete(instanceName);
    }
  }
}
function enqueueMessage(instanceName, phone, text) {
  return new Promise((resolve, reject) => {
    const queue = queues.get(instanceName) ?? [];
    if (queue.length >= MAX_QUEUE_SIZE) {
      return reject(new Error(`Fila cheia para inst\xE2ncia ${instanceName} (m\xE1x ${MAX_QUEUE_SIZE} mensagens)`));
    }
    queue.push({ instanceName, phone, text, resolve, reject, attempts: 0, addedAt: Date.now() });
    queues.set(instanceName, queue);
    console.log(`[MessageQueue] Enfileirada mensagem para ${instanceName}\u2192${phone} (fila: ${queue.length})`);
    processQueue(instanceName).catch(
      (err) => console.error("[MessageQueue] processQueue error:", err)
    );
  });
}
function getQueueStatus() {
  const status = {};
  const now = Date.now();
  for (const [instance, queue] of queues) {
    const windowStart = now - 6e4;
    const sentLast = (sentCount.get(instance) ?? []).filter((t) => t > windowStart).length;
    status[instance] = { pending: queue.length, sentLastMinute: sentLast };
  }
  return status;
}

// _api/lib/sentMessageIds.ts
var sentMap = /* @__PURE__ */ new Map();
var TTL_MS = 2 * 60 * 1e3;
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sentMap) {
    if (now - entry.addedAt > TTL_MS) sentMap.delete(id);
  }
}, 3e4);
function markSentByUs(evolutionId, optimisticDocId) {
  sentMap.set(evolutionId, { evolutionId, optimisticDocId, addedAt: Date.now() });
}
function getSentEntry(evolutionId) {
  const entry = sentMap.get(evolutionId);
  if (!entry) return null;
  if (Date.now() - entry.addedAt > TTL_MS) {
    sentMap.delete(evolutionId);
    return null;
  }
  return entry;
}
function clearSentById(evolutionId) {
  sentMap.delete(evolutionId);
}
function getSentCount() {
  return sentMap.size;
}
var statusTrackMap = /* @__PURE__ */ new Map();
var STATUS_TTL_MS = 10 * 60 * 1e3;
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of statusTrackMap) {
    if (now - entry.addedAt > STATUS_TTL_MS) statusTrackMap.delete(id);
  }
}, 6e4);
function trackForStatusUpdates(evolutionId, optimisticDocId) {
  statusTrackMap.set(evolutionId, { optimisticDocId, addedAt: Date.now() });
}
function getOptimisticId(evolutionId) {
  const entry = statusTrackMap.get(evolutionId);
  if (!entry) return null;
  if (Date.now() - entry.addedAt > STATUS_TTL_MS) {
    statusTrackMap.delete(evolutionId);
    return null;
  }
  return entry.optimisticDocId;
}

// _api/lib/conversationCache.ts
var convStore = /* @__PURE__ */ new Map();
var msgStore = /* @__PURE__ */ new Map();
var msgByConv = /* @__PURE__ */ new Map();
function setConversation(conv) {
  convStore.set(conv.id, conv);
}
function updateConversation(id, patch) {
  const existing = convStore.get(id);
  if (existing) convStore.set(id, { ...existing, ...patch });
}
function getConversation(id) {
  return convStore.get(id);
}
function getConversations(sessionId) {
  const result = [];
  for (const conv of convStore.values()) {
    if (conv.sessionId === sessionId) result.push(conv);
  }
  return result.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}
function findConversationsByPhone(phone) {
  const result = [];
  for (const conv of convStore.values()) {
    if (conv.phone === phone) result.push(conv);
  }
  return result;
}
function setMessage(msg) {
  msgStore.set(msg.id, msg);
  if (!msgByConv.has(msg.conversationId)) msgByConv.set(msg.conversationId, /* @__PURE__ */ new Set());
  msgByConv.get(msg.conversationId).add(msg.id);
}
function updateMessage(id, patch) {
  const existing = msgStore.get(id);
  if (existing) msgStore.set(id, { ...existing, ...patch });
}
function deleteMessage(id) {
  const msg = msgStore.get(id);
  if (!msg) return;
  msgStore.delete(id);
  msgByConv.get(msg.conversationId)?.delete(id);
}
function getMessages(conversationId) {
  const ids = msgByConv.get(conversationId);
  if (!ids) return [];
  return Array.from(ids).map((id) => msgStore.get(id)).filter(Boolean).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
function hasMessage(id) {
  return msgStore.has(id);
}

// _api/evolution/send.ts
init_socketRegistry();
var log4 = createLogger("evolution/send");
var orgIdCache = /* @__PURE__ */ new Map();
async function getOrgId(sessionName) {
  if (orgIdCache.has(sessionName)) return orgIdCache.get(sessionName);
  try {
    const session = await fsGet("whatsapp_sessions", sessionName);
    const orgId = session?.organizationId ?? "default";
    orgIdCache.set(sessionName, orgId);
    return orgId;
  } catch (err) {
    log4.warn("getOrgId falhou, usando default", { session: sessionName, ...errCtx(err) });
    return "default";
  }
}
async function handler3(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ queue: getQueueStatus() });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { sessionName, phone, message, type = "text" } = req.body ?? {};
  if (!sessionName || !phone || !message) {
    return res.status(400).json({ error: "sessionName, phone e message s\xE3o obrigat\xF3rios" });
  }
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const optimisticId = `wamsg_out_${Date.now()}`;
    const conversationId = `${sessionName}_${phone}`;
    const organizationId = await getOrgId(String(sessionName));
    const messageDoc = {
      id: optimisticId,
      conversationId,
      sessionId: String(sessionName),
      direction: "outbound",
      messageType: type === "text" ? "text" : String(type),
      body: String(message),
      phone: String(phone),
      contactName: String(phone),
      timestamp: now,
      status: "sending",
      organizationId
    };
    setMessage(messageDoc);
    emitToSession(String(sessionName), "wa:message_upsert", messageDoc);
    updateConversation(conversationId, {
      lastMessage: String(message),
      lastMessageAt: now,
      lastMessageDirection: "outbound",
      updatedAt: now
    });
    const updatedConv = getConversation(conversationId);
    if (updatedConv) emitToSession(String(sessionName), "wa:chat_upsert", updatedConv);
    res.status(200).json({ success: true, messageId: optimisticId });
    enqueueMessage(String(sessionName), String(phone), String(message)).then((result) => {
      const evolutionMsgId = result?.key?.id;
      if (evolutionMsgId) {
        markSentByUs(evolutionMsgId, optimisticId);
        updateMessage(optimisticId, { evolutionId: evolutionMsgId, status: "sent" });
      } else {
        updateMessage(optimisticId, { status: "sent" });
      }
    }).catch((err) => {
      log4.error("Entrega de mensagem falhou", { session: sessionName, phone, msgId: optimisticId, ...errCtx(err) });
      updateMessage(optimisticId, { status: "failed" });
    });
  } catch (err) {
    log4.error("POST /send erro inesperado", { session: req.body?.sessionName, phone: req.body?.phone, ...errCtx(err) });
    return res.status(500).json({ error: "Erro ao enviar mensagem", detail: err?.message });
  }
}

// _api/evolution/sync.ts
init_adminFirebase();

// _api/lib/whatsappUtils.ts
function extractPhone(jid) {
  return jid.replace(/@s\.whatsapp\.net$/, "").replace(/@c\.us$/, "").replace(/@g\.us$/, "").replace(/:\d+$/, "");
}
function stripDDI(phone) {
  if (phone.startsWith("55") && phone.length >= 12) return phone.slice(2);
  return phone;
}
function isGroup(jid) {
  return jid.endsWith("@g.us");
}
function isIgnoredJid(jid) {
  return jid.endsWith("@broadcast") || jid === "status@broadcast" || jid.endsWith("@newsletter");
}
function unwrapMessage(m) {
  if (!m) return {};
  const inner = m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m.viewOnceMessageV2Extension?.message ?? m.ephemeralMessage?.message ?? m.documentWithCaptionMessage?.message ?? m.templateMessage?.hydratedFourRowTemplate?.hydratedContentText;
  return inner ? unwrapMessage(inner) : m;
}
function extractMessageContent(msg) {
  const raw = msg?.message ?? {};
  const m = unwrapMessage(raw);
  const topType = (msg?.messageType ?? "").toLowerCase();
  if (m.conversation) return { body: m.conversation, messageType: "text" };
  if (m.extendedTextMessage?.text) return { body: m.extendedTextMessage.text, messageType: "text" };
  if (m.imageMessage) return {
    body: m.imageMessage.caption ?? "",
    messageType: "image",
    mediaUrl: m.imageMessage.url ?? m.imageMessage.directPath ?? "",
    mimeType: m.imageMessage.mimetype
  };
  if (m.videoMessage) return {
    body: m.videoMessage.caption ?? "",
    messageType: "video",
    mediaUrl: m.videoMessage.url ?? m.videoMessage.directPath ?? "",
    mimeType: m.videoMessage.mimetype
  };
  if (m.audioMessage || m.pttMessage) {
    const audio = m.audioMessage ?? m.pttMessage;
    return {
      body: "",
      messageType: "audio",
      mediaUrl: audio.url ?? audio.directPath ?? "",
      mimeType: audio.mimetype ?? "audio/ogg; codecs=opus"
    };
  }
  if (m.documentMessage) return {
    body: m.documentMessage.caption ?? m.documentMessage.fileName ?? "",
    messageType: "document",
    mediaUrl: m.documentMessage.url ?? m.documentMessage.directPath ?? "",
    mimeType: m.documentMessage.mimetype,
    fileName: m.documentMessage.fileName
  };
  if (m.stickerMessage) return {
    body: "",
    messageType: "sticker",
    mediaUrl: m.stickerMessage.url ?? "",
    mimeType: m.stickerMessage.mimetype
  };
  if (topType.includes("audio") || topType.includes("ptt")) {
    return { body: "", messageType: "audio", mimeType: "audio/ogg; codecs=opus" };
  }
  if (topType.includes("image")) return { body: "", messageType: "image" };
  if (topType.includes("video")) return { body: "", messageType: "video" };
  if (topType.includes("document")) return { body: "", messageType: "document" };
  if (topType.includes("sticker")) return { body: "", messageType: "sticker" };
  return { body: "", messageType: "text" };
}
function extractPhoneFromJid(jid, remoteJidAlt) {
  if (jid.endsWith("@lid")) {
    if (!remoteJidAlt) return null;
    return remoteJidAlt.replace(/@s\.whatsapp\.net$|@c\.us$/, "").replace(/:\d+$/, "");
  }
  if (isIgnoredJid(jid) && !jid.endsWith("@g.us")) return null;
  return extractPhone(jid);
}
var MEDIA_LABELS = {
  audio: "\u{1F3A4} \xC1udio",
  video: "\u{1F3AC} V\xEDdeo",
  image: "\u{1F4F7} Imagem",
  document: "\u{1F4C4} Documento",
  sticker: "\u{1F5F3}\uFE0F Figurinha"
};
function mediaLabel(messageType) {
  return MEDIA_LABELS[messageType] ?? `[${messageType}]`;
}

// _api/lib/syncService.ts
init_socketRegistry();
function extractBody(message) {
  if (!message) return "";
  return message.conversation ?? message.extendedTextMessage?.text ?? message.imageMessage?.caption ?? message.videoMessage?.caption ?? message.documentMessage?.fileName ?? (message.audioMessage || message.pttMessage ? mediaLabel("audio") : null) ?? (message.stickerMessage ? mediaLabel("sticker") : null) ?? (message.videoMessage ? mediaLabel("video") : null) ?? (message.imageMessage ? mediaLabel("image") : null) ?? (message.documentMessage ? mediaLabel("document") : null) ?? mediaLabel("unknown");
}
async function importConversationMessages(sessionName, phone, organizationId, msgLimit = 100, isGroup2 = false) {
  const conversationId = `${sessionName}_${phone}`;
  const remoteJid = isGroup2 ? `${phone}@g.us` : `${phone}@s.whatsapp.net`;
  const msgs = await EvolutionAPI.findMessages(sessionName, remoteJid, msgLimit);
  if (msgs.length === 0) return { imported: 0, contactName: phone };
  let imported = 0;
  let bestContactName = phone;
  for (const msg of msgs) {
    const key = msg.key ?? {};
    const msgId = key.id ?? "";
    if (!msgId) continue;
    const fromMe = Boolean(key.fromMe);
    const pushName = msg.pushName || "";
    if (!fromMe && pushName && bestContactName === phone) bestContactName = pushName;
    const storedId = `wamsg_${msgId}`;
    if (hasMessage(storedId)) continue;
    const timestampSec = Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1e3));
    const timestamp = new Date(timestampSec * 1e3).toISOString();
    const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(msg);
    const doc = {
      id: storedId,
      conversationId,
      sessionId: sessionName,
      direction: fromMe ? "outbound" : "inbound",
      messageType,
      body,
      phone,
      contactName: pushName || phone,
      timestamp,
      status: fromMe ? "sent" : "received",
      organizationId
    };
    if (mediaUrl) doc.mediaUrl = mediaUrl;
    if (mimeType) doc.mimeType = mimeType;
    if (fileName) doc.fileName = fileName;
    setMessage(doc);
    imported++;
  }
  return { imported, contactName: bestContactName };
}
async function syncSession(sessionName, organizationId, importMessages = false) {
  const result = { conversationsImported: 0, messagesImported: 0, cleaned: 0, errors: [] };
  const contacts = await EvolutionAPI.findContacts(sessionName).catch(() => []);
  const contactNameMap = /* @__PURE__ */ new Map();
  const contactPictureMap = /* @__PURE__ */ new Map();
  function brVariants(phone) {
    if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") {
      return [phone, phone.slice(0, 4) + phone.slice(5)];
    }
    if (phone.startsWith("55") && phone.length === 12) {
      return [phone, phone.slice(0, 4) + "9" + phone.slice(4)];
    }
    return [phone];
  }
  for (const c of contacts) {
    const jid = c.remoteJid ?? c.id ?? "";
    const name = c.pushName || c.notify || c.name || "";
    const picture = c.profilePicUrl ?? c.profilePictureUrl ?? "";
    if (jid && !jid.startsWith("cm")) {
      const phone = jid.replace(/@s\.whatsapp\.net$|@c\.us$|@g\.us$/, "").replace(/:\d+$/, "");
      for (const v of brVariants(phone)) {
        if (name) contactNameMap.set(v, name);
        if (picture) contactPictureMap.set(v, picture);
      }
    }
  }
  process.stdout.write(`[SyncService] ${sessionName}: ${contacts.length} contatos carregados (${contactPictureMap.size} com foto)
`);
  const chats = await EvolutionAPI.findChats(sessionName);
  process.stdout.write(`[SyncService] ${sessionName}: ${chats.length} chats encontrados
`);
  for (const chat of chats) {
    const remoteJid = chat.remoteJid ?? "";
    if (!remoteJid || isIgnoredJid(remoteJid)) continue;
    const lastMsg = chat.lastMessage ?? null;
    const remoteJidAlt = lastMsg?.key?.remoteJidAlt;
    const phone = extractPhoneFromJid(remoteJid, remoteJidAlt);
    if (!phone) continue;
    const groupChat = remoteJid.endsWith("@g.us");
    const chatPic = chat.profilePicUrl ?? "";
    const contactPic = contactPictureMap.get(phone) ?? "";
    const resolvedPicture = chatPic || contactPic;
    const isInbound = lastMsg?.key?.fromMe === false;
    const inboundPushName = isInbound ? lastMsg?.pushName ?? "" : "";
    const contactName = contactNameMap.get(phone) || chat.pushName || inboundPushName || chat.name || phone;
    const groupName = chat.pushName || chat.name || "";
    const resolvedName = groupChat ? groupName || `Grupo ${phone}` : contactName;
    const convId = `${sessionName}_${phone}`;
    const lastMsgBody = lastMsg ? extractBody(lastMsg.message) : "";
    const lastMsgTs = lastMsg?.messageTimestamp ? new Date(lastMsg.messageTimestamp * 1e3).toISOString() : chat.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString();
    const lastMsgDir = lastMsg?.key?.fromMe ? "outbound" : "inbound";
    const conv = {
      id: convId,
      sessionId: sessionName,
      sessionName,
      phone,
      contactName: resolvedName,
      contactPicture: resolvedPicture || void 0,
      isGroup: groupChat || void 0,
      lastMessage: lastMsgBody,
      lastMessageAt: lastMsgTs,
      lastMessageDirection: lastMsgDir,
      unreadCount: chat.unreadMessages ?? 0,
      organizationId,
      updatedAt: lastMsgTs
    };
    setConversation(conv);
    result.conversationsImported++;
    if (lastMsg) {
      const key = lastMsg.key ?? {};
      const msgId = key.id ?? "";
      if (msgId) {
        const storedId = `wamsg_${msgId}`;
        if (!hasMessage(storedId)) {
          const fromMe = Boolean(key.fromMe);
          const timestampSec = Number(lastMsg.messageTimestamp ?? Math.floor(Date.now() / 1e3));
          const timestamp = new Date(timestampSec * 1e3).toISOString();
          const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(lastMsg);
          const pushName = lastMsg.pushName || "";
          const doc = {
            id: storedId,
            conversationId: convId,
            sessionId: sessionName,
            direction: fromMe ? "outbound" : "inbound",
            messageType,
            body,
            phone,
            contactName: pushName || contactName,
            timestamp,
            status: fromMe ? "sent" : "received",
            organizationId
          };
          if (mediaUrl) doc.mediaUrl = mediaUrl;
          if (mimeType) doc.mimeType = mimeType;
          if (fileName) doc.fileName = fileName;
          setMessage(doc);
          result.messagesImported++;
        }
      }
    }
    if (importMessages) {
      try {
        const { imported } = await importConversationMessages(sessionName, phone, organizationId, 50, groupChat);
        result.messagesImported += imported;
      } catch (err) {
        result.errors.push(`msgs ${convId}: ${err.message}`);
      }
    }
  }
  process.stdout.write(
    `[SyncService] ${sessionName}: ${result.conversationsImported} conversas, ${result.messagesImported} mensagens, ${result.cleaned} removidos
`
  );
  return result;
}
async function reconcileSession(sessionName, organizationId, lookbackMinutes = 60) {
  const cutoff = Date.now() - lookbackMinutes * 60 * 1e3;
  const conversations = getConversations(sessionName).filter((c) => {
    const ts = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
    return ts > cutoff;
  });
  let checked = 0;
  let imported = 0;
  for (const conv of conversations.slice(0, 30)) {
    const phone = conv.phone ?? "";
    if (!phone) continue;
    const msgs = await EvolutionAPI.findMessages(sessionName, `${phone}@s.whatsapp.net`, 20).catch(() => []);
    const conversationId = `${sessionName}_${phone}`;
    for (const msg of msgs) {
      const key = msg.key ?? {};
      const msgId = key.id ?? "";
      if (!msgId) continue;
      checked++;
      const storedId = `wamsg_${msgId}`;
      if (hasMessage(storedId)) continue;
      const fromMe = Boolean(key.fromMe);
      const timestampSec = Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1e3));
      const timestamp = new Date(timestampSec * 1e3).toISOString();
      const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(msg);
      const doc = {
        id: storedId,
        conversationId,
        sessionId: sessionName,
        direction: fromMe ? "outbound" : "inbound",
        messageType,
        body,
        phone,
        contactName: msg.pushName || conv.contactName || phone,
        timestamp,
        status: fromMe ? "sent" : "received",
        organizationId
      };
      if (mediaUrl) doc.mediaUrl = mediaUrl;
      if (mimeType) doc.mimeType = mimeType;
      if (fileName) doc.fileName = fileName;
      setMessage(doc);
      imported++;
      emitToSession(sessionName, "wa:message_upsert", doc);
      const existingConv = getConversation(conversationId);
      if (existingConv && (!existingConv.lastMessageAt || new Date(doc.timestamp) > new Date(existingConv.lastMessageAt))) {
        const patch = {
          lastMessage: doc.body || mediaLabel(doc.messageType),
          lastMessageAt: doc.timestamp,
          lastMessageDirection: doc.direction,
          updatedAt: doc.timestamp,
          unreadCount: doc.direction === "inbound" ? (existingConv.unreadCount ?? 0) + 1 : existingConv.unreadCount ?? 0
        };
        updateConversation(conversationId, patch);
        emitToSession(sessionName, "wa:chat_upsert", { ...existingConv, ...patch });
      }
    }
  }
  process.stdout.write(`[SyncService] reconcile ${sessionName}: ${checked} verificados, ${imported} importados
`);
  return { checked, imported };
}

// _api/evolution/sync.ts
async function handler4(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { sessionName, organizationId: bodyOrgId, importMessages = false } = req.body ?? {};
  if (!sessionName) {
    return res.status(400).json({ error: "sessionName \xE9 obrigat\xF3rio" });
  }
  try {
    let organizationId = bodyOrgId || "default";
    if (!bodyOrgId) {
      const sessionDoc = await fsGet("whatsapp_sessions", sessionName).catch(() => null);
      if (sessionDoc?.organizationId) organizationId = sessionDoc.organizationId;
    }
    const result = await syncSession(sessionName, organizationId, Boolean(importMessages));
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[EVOLUTION/sync] error:", err);
    return res.status(500).json({ error: "Erro ao sincronizar conversas", detail: err?.message });
  }
}

// _api/evolution/conversation.ts
async function handler5(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { conversationId, leadId, clienteId, unreadCount } = req.body ?? {};
  if (!conversationId) {
    return res.status(400).json({ error: "conversationId \xE9 obrigat\xF3rio" });
  }
  const patch = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  if (leadId !== void 0) patch.leadId = leadId;
  if (clienteId !== void 0) patch.clienteId = clienteId;
  if (unreadCount !== void 0) patch.unreadCount = unreadCount;
  updateConversation(conversationId, patch);
  return res.status(200).json({ success: true });
}

// _api/evolution/conversations.ts
function handler6(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { session } = req.query ?? {};
  if (!session) {
    return res.status(400).json({ error: "session \xE9 obrigat\xF3rio" });
  }
  const convs = getConversations(String(session));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(convs);
}

// _api/evolution/messages.ts
async function handler7(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { session, phone } = req.query ?? {};
  if (!session || !phone) {
    return res.status(400).json({ error: "session e phone s\xE3o obrigat\xF3rios" });
  }
  const sessionName = String(session);
  const phoneStr = String(phone);
  const conversationId = `${sessionName}_${phoneStr}`;
  try {
    const convCached = getConversation(conversationId);
    const { imported, contactName } = await importConversationMessages(sessionName, phoneStr, "default", 50, convCached?.isGroup);
    if (contactName !== phoneStr) {
      updateConversation(conversationId, { contactName, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    const messages = getMessages(conversationId);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ success: true, imported, contactName, messages });
  } catch (err) {
    console.error("[EVOLUTION/messages] error:", err);
    return res.status(500).json({ error: "Erro ao buscar mensagens", detail: err?.message });
  }
}

// _api/evolution/reconcile.ts
init_adminFirebase();

// _api/webhook/evolution.ts
init_adminFirebase();
init_socketRegistry();
var log5 = createLogger("evolution/webhook");
var lastWebhookAt = null;
var webhookCount = 0;
var messagesProcessed = 0;
var messagesFailed = 0;
var duplicatesIgnored = 0;
function getWebhookStats() {
  return { lastWebhookAt, webhookCount, messagesProcessed, messagesFailed, duplicatesIgnored };
}
var activeSessions = /* @__PURE__ */ new Map();
function getActiveSessions() {
  return activeSessions;
}
var orgIdCache2 = /* @__PURE__ */ new Map();
async function resolveOrgId(sessionId) {
  if (orgIdCache2.has(sessionId)) return orgIdCache2.get(sessionId);
  try {
    const session = await fsGet("whatsapp_sessions", sessionId);
    const orgId = session?.organizationId ?? "default";
    orgIdCache2.set(sessionId, orgId);
    return orgId;
  } catch (err) {
    log5.warn("resolveOrgId falhou, usando default", { sessionId, ...errCtx(err) });
    return "default";
  }
}
async function findExistingLead(phone, timestamp) {
  const phoneLocal = stripDDI(phone);
  let existing = await fsQuery("leads", [{ field: "phone", value: phoneLocal }]);
  if (existing.length === 0 && phoneLocal !== phone) {
    existing = await fsQuery("leads", [{ field: "phone", value: phone }]);
  }
  if (existing.length > 0) {
    const leadId = existing[0].id;
    await fsUpdate("leads", leadId, { lastInteraction: timestamp, updatedAt: timestamp }).catch(() => {
    });
    return leadId;
  }
  return null;
}
async function handleMessagesUpsert(event) {
  const sessionId = event.instance ?? "";
  const data = event.data ?? {};
  const key = data.key ?? {};
  const remoteJid = key.remoteJid ?? "";
  if (!remoteJid || isIgnoredJid(remoteJid)) return;
  const remoteJidAlt = key.remoteJidAlt;
  const phone = extractPhoneFromJid(remoteJid, remoteJidAlt) ?? extractPhone(remoteJid);
  if (!phone || phone.endsWith("@lid")) return;
  const groupChat = remoteJid.endsWith("@g.us");
  const fromMe = Boolean(key.fromMe);
  const msgId = key.id ?? `auto_${Date.now()}`;
  if (fromMe && msgId) {
    const sentEntry = getSentEntry(msgId);
    if (sentEntry) {
      clearSentById(msgId);
      trackForStatusUpdates(msgId, sentEntry.optimisticDocId);
      updateMessage(sentEntry.optimisticDocId, { evolutionId: msgId, status: "sent" });
      emitToSession(sessionId, "wa:message_update", {
        id: sentEntry.optimisticDocId,
        patch: { evolutionId: msgId, status: "sent" }
      });
      duplicatesIgnored++;
      return;
    }
  }
  const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(data);
  if (messageType !== "text") {
    log5.info("MEDIA_MSG recebido", {
      topType: data.messageType ?? "\u2014",
      resolved: messageType,
      msgKeys: Object.keys(data.message ?? {}).join(","),
      session: sessionId
    });
  }
  if (fromMe && messageType === "text" && !body) return;
  const timestampSec = Number(data.messageTimestamp ?? Math.floor(Date.now() / 1e3));
  const timestamp = new Date(timestampSec * 1e3).toISOString();
  const senderName = data.pushName || extractPhone(key.participant ?? "") || phone;
  const direction = fromMe ? "outbound" : "inbound";
  const conversationId = `${sessionId}_${phone}`;
  const storedMsgId = `wamsg_${msgId}`;
  const organizationId = await resolveOrgId(sessionId);
  log5.info("MESSAGES_UPSERT", {
    session: sessionId,
    phone,
    group: groupChat,
    fromMe,
    type: messageType,
    body: body.slice(0, 80)
  });
  const msgDoc = {
    id: storedMsgId,
    conversationId,
    sessionId,
    direction,
    messageType,
    body,
    contactName: senderName,
    phone,
    timestamp,
    status: fromMe ? "sent" : "received",
    organizationId
  };
  if (mediaUrl) msgDoc.mediaUrl = mediaUrl;
  if (mimeType) msgDoc.mimeType = mimeType;
  if (fileName) msgDoc.fileName = fileName;
  setMessage(msgDoc);
  emitToSession(sessionId, "wa:message_upsert", msgDoc);
  const existing = getConversation(conversationId);
  const convDoc = {
    id: conversationId,
    sessionId,
    sessionName: sessionId,
    phone,
    contactName: existing?.contactName || (groupChat ? `Grupo ${phone}` : senderName),
    contactPicture: existing?.contactPicture,
    isGroup: groupChat || void 0,
    lastMessage: body || mediaLabel(messageType),
    lastMessageAt: timestamp,
    lastMessageDirection: direction,
    updatedAt: timestamp,
    unreadCount: direction === "inbound" ? (existing?.unreadCount ?? 0) + 1 : existing?.unreadCount ?? 0,
    organizationId,
    leadId: existing?.leadId,
    clienteId: existing?.clienteId
  };
  setConversation(convDoc);
  emitToSession(sessionId, "wa:chat_upsert", convDoc);
  if (!fromMe && !groupChat && !existing?.leadId) {
    const leadId = await findExistingLead(phone, timestamp).catch(() => null);
    if (leadId) {
      updateConversation(conversationId, { leadId });
      emitToSession(sessionId, "wa:chat_update", { id: conversationId, patch: { leadId } });
    }
  }
  messagesProcessed++;
}
async function handleMessagesUpdate(event) {
  const updates = Array.isArray(event.data) ? event.data : [event.data];
  const sessionId = event.instance ?? "";
  for (const update of updates) {
    const key = update?.key ?? {};
    const msgId = key.id ?? "";
    if (!msgId) continue;
    const rawStatus = String(update?.update?.status ?? "").toUpperCase();
    const statusMap = {
      PENDING: "pending",
      SERVER_ACK: "sent",
      DELIVERY_ACK: "delivered",
      READ: "read",
      PLAYED: "read",
      "1": "pending",
      "2": "sent",
      "3": "delivered",
      "4": "read",
      "5": "read"
    };
    const status = statusMap[rawStatus] ?? rawStatus.toLowerCase();
    if (!status) continue;
    const optimisticId = getOptimisticId(msgId);
    const emitId = optimisticId ?? `wamsg_${msgId}`;
    log5.info("MESSAGES_UPDATE", { session: sessionId, msgId, rawStatus, status, resolvedId: emitId });
    updateMessage(emitId, { status });
    emitToSession(sessionId, "wa:message_update", { id: emitId, patch: { status } });
  }
}
async function handleMessagesDelete(event) {
  const sessionId = event.instance ?? "";
  const messages = Array.isArray(event.data) ? event.data : [event.data];
  for (const msg of messages) {
    const key = msg?.key ?? msg ?? {};
    const msgId = key.id ?? "";
    if (!msgId) continue;
    const storedId = `wamsg_${msgId}`;
    deleteMessage(storedId);
    emitToSession(sessionId, "wa:message_delete", { id: storedId });
    log5.info("MESSAGES_DELETE", { session: sessionId, msgId });
  }
}
async function handlePresenceUpdate(event) {
  const sessionId = event.instance ?? "";
  const presences = Array.isArray(event.data) ? event.data : [event.data];
  for (const p of presences) {
    const jid = p.id ?? p.remoteJid ?? "";
    if (!jid || isGroup(jid)) continue;
    const phone = extractPhone(jid);
    if (!phone) continue;
    const convId = `${sessionId}_${phone}`;
    const presenceStatus = p.presences?.[jid]?.lastKnownPresence ?? p.lastKnownPresence ?? "available";
    updateConversation(convId, { presence: presenceStatus });
    emitToSession(sessionId, "wa:presence_update", { id: convId, presence: presenceStatus });
  }
}
async function handleConnectionUpdate(event) {
  const instanceName = event.instance ?? "";
  if (!instanceName) return;
  const rawState = (event.data?.state ?? "").toLowerCase();
  const statusMap = {
    open: "open",
    close: "close",
    closed: "close",
    connecting: "connecting",
    qr: "qr"
  };
  const status = statusMap[rawState] ?? rawState;
  log5.info("CONNECTION_UPDATE", { instance: instanceName, state: rawState, mapped: status });
  const update = { status, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  if (rawState === "open") {
    const instanceData = event.data?.instance ?? {};
    if (instanceData.profileName) update.profileName = instanceData.profileName;
    if (instanceData.profilePictureUrl) update.profilePicture = instanceData.profilePictureUrl;
    if (instanceData.wuid || instanceData.phone) {
      update.phoneNumber = instanceData.wuid ?? instanceData.phone;
    }
    update.connectedAt = (/* @__PURE__ */ new Date()).toISOString();
    const orgId = await resolveOrgId(instanceName);
    activeSessions.set(instanceName, orgId);
  }
  if (rawState === "close" || rawState === "closed") {
    update.phoneNumber = null;
    update.profileName = null;
    update.profilePicture = null;
    update.qrBase64 = null;
    update.qrCode = null;
    activeSessions.delete(instanceName);
  }
  await fsUpdate("whatsapp_sessions", instanceName, update).catch(
    (err) => log5.error("fsUpdate sessions falhou (CONNECTION_UPDATE)", { instance: instanceName, ...errCtx(err) })
  );
  emitToSession(instanceName, "wa:connection_update", { instanceName, status: rawState });
  if (rawState === "open") {
    log5.info("Sess\xE3o conectada \u2014 iniciando sync autom\xE1tico", { instance: instanceName });
    const orgId = await resolveOrgId(instanceName);
    syncSession(instanceName, orgId, false).then((result) => {
      log5.info("Auto-sync conclu\xEDdo", { instance: instanceName, conversas: result.conversationsImported });
      emitToSession(instanceName, "wa:sync_complete", {
        instanceName,
        conversationsImported: result.conversationsImported
      });
    }).catch((err) => {
      log5.error("Auto-sync falhou", { instance: instanceName, ...errCtx(err) });
    });
  }
}
async function handleQrcodeUpdated(event) {
  const instanceName = event.instance ?? "";
  if (!instanceName) return;
  const qrcode = event.data?.qrcode ?? {};
  log5.info("QRCODE_UPDATED", { instance: instanceName });
  await fsUpdate("whatsapp_sessions", instanceName, {
    status: "qr",
    qrBase64: qrcode.base64 ?? null,
    qrCode: qrcode.code ?? null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).catch(
    (err) => log5.error("fsUpdate sessions falhou (QRCODE_UPDATED)", { instance: instanceName, ...errCtx(err) })
  );
}
async function handleContactsUpdate(event) {
  const sessionId = event.instance ?? "";
  const contacts = Array.isArray(event.data) ? event.data : [];
  for (const contact of contacts) {
    const jid = contact.id ?? "";
    if (!jid || isGroup(jid)) continue;
    const phone = extractPhone(jid);
    const name = contact.pushName || contact.notify || contact.name || "";
    const picture = contact.profilePicUrl ?? contact.profilePictureUrl;
    if (!phone) continue;
    const convs = findConversationsByPhone(phone);
    for (const conv of convs) {
      const patch = {};
      if (name) patch.contactName = name;
      if (picture) patch.contactPicture = picture;
      if (Object.keys(patch).length > 0) {
        updateConversation(conv.id, patch);
        emitToSession(conv.sessionId, "wa:chat_update", { id: conv.id, patch });
      }
    }
    if (name || picture) {
      const existingLeads = await fsQuery("leads", [{ field: "phone", value: phone }]).catch(() => []);
      if (existingLeads.length > 0) {
        const leadId = existingLeads[0].id;
        const upd = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        if (name) upd.name = name;
        if (picture) upd.profilePicture = picture;
        await fsUpdate("leads", leadId, upd).catch(() => {
        });
      }
    }
  }
  log5.info("CONTACTS_UPDATE", { session: sessionId, count: contacts.length });
}
async function handleChatsUpdate(event, isUpsert = false) {
  const sessionId = event.instance ?? "";
  if (!sessionId) return;
  const chats = Array.isArray(event.data) ? event.data : [event.data];
  const organizationId = await resolveOrgId(sessionId);
  for (const chat of chats) {
    const remoteJid = chat.remoteJid ?? chat.id ?? "";
    if (!remoteJid || isIgnoredJid(remoteJid)) continue;
    const remoteJidAlt = chat.remoteJidAlt ?? chat.lastMessage?.key?.remoteJidAlt;
    const phone = extractPhoneFromJid(remoteJid, remoteJidAlt) ?? extractPhone(remoteJid);
    if (!phone || phone.endsWith("@lid")) continue;
    const conversationId = `${sessionId}_${phone}`;
    const existing = getConversation(conversationId);
    if (existing) {
      const patch = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      const unreadCount = typeof chat.unreadCount === "number" ? chat.unreadCount : chat.unreadMessages !== void 0 ? chat.unreadMessages : void 0;
      if (unreadCount !== void 0) patch.unreadCount = unreadCount;
      if (chat.name || chat.pushName) patch.contactName = chat.name || chat.pushName;
      if (chat.profilePicUrl && !existing.contactPicture) patch.contactPicture = chat.profilePicUrl;
      updateConversation(conversationId, patch);
      emitToSession(sessionId, "wa:chat_update", { id: conversationId, patch });
    } else if (isUpsert) {
      const lastMsg = chat.lastMessage ?? null;
      const lastMsgBody = lastMsg?.message?.conversation ?? lastMsg?.message?.extendedTextMessage?.text ?? (lastMsg ? "[m\xEDdia]" : "");
      const lastMsgTs = lastMsg?.messageTimestamp ? new Date(lastMsg.messageTimestamp * 1e3).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
      const groupChat = remoteJid.endsWith("@g.us");
      const newConv = {
        id: conversationId,
        sessionId,
        sessionName: sessionId,
        phone,
        contactName: chat.name || chat.pushName || phone,
        contactPicture: chat.profilePicUrl || void 0,
        isGroup: groupChat || void 0,
        lastMessage: lastMsgBody,
        lastMessageAt: lastMsgTs,
        lastMessageDirection: lastMsg?.key?.fromMe ? "outbound" : "inbound",
        unreadCount: chat.unreadMessages ?? 0,
        organizationId,
        updatedAt: lastMsgTs
      };
      setConversation(newConv);
      emitToSession(sessionId, "wa:chat_upsert", newConv);
    }
  }
  log5.info(`CHATS_${isUpsert ? "UPSERT" : "UPDATE"}`, { session: sessionId, count: chats.length });
}
async function processEvent(event) {
  lastWebhookAt = (/* @__PURE__ */ new Date()).toISOString();
  webhookCount++;
  const eventType = (event.event ?? "").toUpperCase().replace(/\./g, "_");
  switch (eventType) {
    case "MESSAGES_UPSERT":
      await handleMessagesUpsert(event);
      break;
    case "MESSAGES_UPDATE":
      await handleMessagesUpdate(event);
      break;
    case "MESSAGES_DELETE":
      await handleMessagesDelete(event);
      break;
    case "PRESENCE_UPDATE":
      await handlePresenceUpdate(event);
      break;
    case "CONNECTION_UPDATE":
      await handleConnectionUpdate(event);
      break;
    case "QRCODE_UPDATED":
      await handleQrcodeUpdated(event);
      break;
    case "CONTACTS_UPDATE":
    case "CONTACTS_UPSERT":
      await handleContactsUpdate(event);
      break;
    case "CHATS_UPDATE":
      await handleChatsUpdate(event, false);
      break;
    case "CHATS_UPSERT":
      await handleChatsUpdate(event, true);
      break;
    default:
      log5.debug("Evento n\xE3o tratado", { eventType, instance: event.instance });
  }
}
function handler8(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.status(200).json({ status: "ok" });
  const body = req.body;
  if (!body) return;
  const pathSlug = req.path?.split("/").pop() ?? "";
  const pathEvent = pathSlug ? pathSlug.replace(/-([a-z])/g, (_, c) => `_${c}`).toUpperCase() : "";
  const events = Array.isArray(body) ? body : [body];
  if (pathEvent) {
    events.forEach((e) => {
      if (!e.event) e.event = pathEvent;
    });
  }
  Promise.all(
    events.map(
      (event) => processEvent(event).catch((err) => {
        messagesFailed++;
        const eventType = (event.event ?? "").toUpperCase();
        const sessionId = event.instance ?? "?";
        log5.error("processEvent falhou", { eventType, session: sessionId, ...errCtx(err) });
      })
    )
  ).catch((err) => log5.error("Promise.all webhook falhou", errCtx(err)));
}

// _api/evolution/reconcile.ts
var lastReconcileAt = null;
var totalImported = 0;
var reconcileRunning = false;
function getReconcileStats() {
  return { lastReconcileAt, totalImported, reconcileRunning };
}
async function runReconcile() {
  if (reconcileRunning) {
    console.log("[EVOLUTION/reconcile] J\xE1 em execu\xE7\xE3o, ignorando...");
    return;
  }
  reconcileRunning = true;
  const startedAt = Date.now();
  try {
    const inMemory = getActiveSessions();
    const instances = await EvolutionAPI.fetchInstances().catch(() => []);
    const openInstances = instances.filter((i) => {
      const state = (i.instance?.state ?? i.connectionStatus ?? i.state ?? "").toLowerCase();
      return state === "open";
    });
    const sessions = new Map(inMemory);
    for (const inst of openInstances) {
      const name = inst.instance?.instanceName ?? inst.instanceName ?? "";
      if (name && !sessions.has(name)) sessions.set(name, "default");
    }
    process.stdout.write(`[EVOLUTION/reconcile] ${sessions.size} sess\xF5es ativas
`);
    for (const [sessionName, orgId] of sessions) {
      const { imported } = await reconcileSession(sessionName, orgId, 60).catch((err) => {
        console.error(`[EVOLUTION/reconcile] Erro em ${sessionName}:`, err?.message);
        return { checked: 0, imported: 0 };
      });
      totalImported += imported;
    }
    lastReconcileAt = (/* @__PURE__ */ new Date()).toISOString();
    process.stdout.write(
      `[EVOLUTION/reconcile] Conclu\xEDdo em ${Date.now() - startedAt}ms. Total importado: ${totalImported}
`
    );
  } finally {
    reconcileRunning = false;
  }
}
async function handler9(req, res) {
  if (req.method === "GET") {
    return res.status(200).json(getReconcileStats());
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { sessionName } = req.body ?? {};
  try {
    if (sessionName) {
      const session = await fsGet("whatsapp_sessions", sessionName).catch(() => null);
      const orgId = session?.organizationId ?? "default";
      const result = await reconcileSession(sessionName, orgId, 120);
      return res.status(200).json({ ok: true, ...result });
    } else {
      res.status(202).json({ ok: true, message: "Reconcilia\xE7\xE3o iniciada" });
      runReconcile().catch((err) => console.error("[EVOLUTION/reconcile] Erro:", err));
    }
  } catch (err) {
    console.error("[EVOLUTION/reconcile] handler error:", err);
    return res.status(500).json({ error: "Erro na reconcilia\xE7\xE3o", detail: err?.message });
  }
}

// _api/evolution/media.ts
function serveBuffer(req, res, data, mime) {
  const total = data.length;
  const rangeHeader = req.headers["range"];
  res.setHeader("Content-Type", mime);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=1800");
  if (!rangeHeader) {
    res.setHeader("Content-Length", total);
    res.status(200);
    return res.end(data);
  }
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    res.setHeader("Content-Range", `bytes */${total}`);
    return res.status(416).end();
  }
  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : total - 1;
  if (start > end || start >= total || end >= total) {
    res.setHeader("Content-Range", `bytes */${total}`);
    return res.status(416).end();
  }
  const chunk = data.subarray(start, end + 1);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
  res.setHeader("Content-Length", chunk.length);
  res.status(206);
  return res.end(chunk);
}
var mediaCache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 30 * 60 * 1e3;
async function handler10(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { session, msgId } = req.query ?? {};
  if (!session || !msgId) return res.status(400).json({ error: "session e msgId obrigat\xF3rios" });
  const sessionName = String(session);
  const waId = String(msgId).replace(/^wamsg_/, "");
  const cacheKey = `${sessionName}:${waId}`;
  const cached = mediaCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return serveBuffer(req, res, cached.data, cached.mime);
  }
  try {
    const msgs = await EvolutionAPI.findMessageById(sessionName, waId);
    if (!msgs || !msgs.key || !msgs.message) {
      return res.status(404).json({ error: "Mensagem n\xE3o encontrada" });
    }
    const result = await EvolutionAPI.getMediaBase64(sessionName, msgs);
    if (!result?.base64) {
      return res.status(404).json({ error: "M\xEDdia n\xE3o dispon\xEDvel" });
    }
    const mime = result.mimetype ?? "application/octet-stream";
    const data = Buffer.from(result.base64, "base64");
    mediaCache.set(cacheKey, { data, mime, ts: Date.now() });
    return serveBuffer(req, res, data, mime);
  } catch (err) {
    console.error("[EVOLUTION/media] erro:", err?.message);
    return res.status(500).json({ error: err?.message });
  }
}

// _api/evolution/stats.ts
init_adminFirebase();
async function handler11(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { sessionName } = req.query ?? {};
  try {
    const sessionFilter = sessionName ? [{ field: "sessionId", value: String(sessionName) }] : [];
    const conversations = await fsQueryFull(
      "whatsapp_conversations",
      sessionFilter,
      500
    ).catch(() => []);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
    const allMessages = await fsQueryFull(
      "whatsapp_messages",
      sessionFilter,
      1e3
    ).catch(() => []);
    const msgsToday = allMessages.filter((m) => (m.timestamp ?? "") >= since24h);
    const inbound = msgsToday.filter((m) => m.direction === "inbound").length;
    const outbound = msgsToday.filter((m) => m.direction === "outbound").length;
    const failed = allMessages.filter((m) => m.status === "failed").length;
    const sessions = await fsQueryFull("whatsapp_sessions", [], 50).catch(() => []);
    const activeSessions2 = sessions.filter((s) => s.status === "open");
    return res.status(200).json({
      sessions: {
        total: sessions.length,
        active: activeSessions2.length,
        list: activeSessions2.map((s) => ({
          name: s.id,
          phone: s.phoneNumber,
          profileName: s.profileName,
          connectedAt: s.connectedAt,
          status: s.status
        }))
      },
      conversations: {
        total: conversations.length,
        withUnread: conversations.filter((c) => (c.unreadCount ?? 0) > 0).length,
        withLead: conversations.filter((c) => !!c.leadId).length
      },
      messages: {
        totalToday: msgsToday.length,
        inboundToday: inbound,
        outboundToday: outbound,
        failedTotal: failed
      },
      queue: getQueueStatus(),
      webhook: getWebhookStats(),
      reconcile: getReconcileStats(),
      dedup: {
        pendingInMemory: getSentCount()
      },
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[EVOLUTION/stats] error:", err);
    return res.status(500).json({ error: "Erro ao gerar stats", detail: err?.message });
  }
}

// _api/evolution/sendMedia.ts
init_socketRegistry();
async function handler12(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { sessionName, phone, base64, mediatype, mimetype, fileName, caption } = req.body ?? {};
  if (!sessionName || !phone || !base64 || !mediatype) {
    return res.status(400).json({ error: "sessionName, phone, base64 e mediatype s\xE3o obrigat\xF3rios" });
  }
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const optimisticId = `wamsg_out_${Date.now()}`;
    const conversationId = `${sessionName}_${phone}`;
    const messageDoc = {
      id: optimisticId,
      conversationId,
      sessionId: String(sessionName),
      direction: "outbound",
      messageType: String(mediatype),
      body: caption || fileName || `[${mediatype}]`,
      phone: String(phone),
      contactName: String(phone),
      timestamp: now,
      status: "sending",
      organizationId: "default"
    };
    if (fileName) messageDoc.fileName = fileName;
    if (mimetype) messageDoc.mimeType = mimetype;
    setMessage(messageDoc);
    emitToSession(String(sessionName), "wa:message_upsert", messageDoc);
    updateConversation(conversationId, {
      lastMessage: caption || fileName || `[${mediatype}]`,
      lastMessageAt: now,
      lastMessageDirection: "outbound",
      updatedAt: now
    });
    const updatedConv = getConversation(conversationId);
    if (updatedConv) emitToSession(String(sessionName), "wa:chat_upsert", updatedConv);
    res.status(200).json({ success: true, messageId: optimisticId });
    EvolutionAPI.sendMediaBase64(
      String(sessionName),
      String(phone),
      String(mediatype),
      String(mimetype ?? "application/octet-stream"),
      String(base64),
      fileName,
      caption
    ).then(() => {
      updateMessage(optimisticId, { status: "sent" });
      emitToSession(String(sessionName), "wa:message_update", { id: optimisticId, patch: { status: "sent" } });
    }).catch((err) => {
      console.error(`[EVOLUTION/sendMedia] Falhou para ${phone}:`, err?.message);
      updateMessage(optimisticId, { status: "failed" });
      emitToSession(String(sessionName), "wa:message_update", { id: optimisticId, patch: { status: "failed" } });
    });
  } catch (err) {
    console.error("[EVOLUTION/sendMedia] POST error:", err);
    return res.status(500).json({ error: "Erro ao enviar m\xEDdia", detail: err?.message });
  }
}

// _api/evolution/avatar.ts
var log6 = createLogger("evolution/avatar");
var cache = /* @__PURE__ */ new Map();
var TTL = 2 * 60 * 60 * 1e3;
var MISS_TTL = 30 * 60 * 1e3;
async function handler13(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { session, phone } = req.query ?? {};
  if (!session || !phone) return res.status(400).end();
  const key = `${session}:${phone}`;
  const hit = cache.get(key);
  if (hit) {
    const age = Date.now() - hit.ts;
    if (hit.type === "miss" && age < MISS_TTL) {
      return res.status(404).end();
    }
    if (hit.type === "hit" && age < TTL) {
      res.setHeader("Content-Type", hit.mime);
      res.setHeader("Cache-Control", "public, max-age=7200");
      return res.end(hit.buf);
    }
  }
  try {
    const url = await EvolutionAPI.fetchProfilePicture(String(session), String(phone));
    if (!url) {
      log6.debug("Avatar n\xE3o encontrado na Evolution API", { session, phone });
      cache.set(key, { type: "miss", ts: Date.now() });
      return res.status(404).end();
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(8e3) });
    if (!r.ok) {
      log6.debug("CDN retornou erro ao buscar avatar", { session, phone, status: r.status, url: url.slice(0, 80) });
      cache.set(key, { type: "miss", ts: Date.now() });
      return res.status(404).end();
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    cache.set(key, { type: "hit", buf, mime, ts: Date.now() });
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=7200");
    return res.end(buf);
  } catch (err) {
    log6.warn("Erro ao buscar avatar", { session, phone, ...errCtx(err) });
    cache.set(key, { type: "miss", ts: Date.now() });
    return res.status(404).end();
  }
}

// _api/evolution/contacts.ts
async function handler14(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { session } = req.query ?? {};
  if (!session) return res.status(400).json({ error: "session \xE9 obrigat\xF3rio" });
  const sessionName = String(session);
  try {
    const rawContacts = await EvolutionAPI.findContacts(sessionName);
    const conversations = getConversations(sessionName);
    const convPhones = new Set(conversations.map((c) => c.phone));
    const result = rawContacts.filter((c) => {
      const jid = c.remoteJid ?? c.id ?? "";
      return jid && !jid.includes("@g.us") && !jid.startsWith("cm") && !jid.includes("@lid");
    }).map((c) => {
      const jid = c.remoteJid ?? c.id ?? "";
      const phone = jid.replace(/@s\.whatsapp\.net$|@c\.us$|@g\.us$/, "").replace(/:\d+$/, "");
      const name = c.pushName || c.notify || c.name || phone;
      const picture = c.profilePicUrl ?? c.profilePictureUrl ?? void 0;
      return { phone, name, picture, hasChat: convPhones.has(phone) };
    }).filter((c) => c.phone && c.phone.length >= 8).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
    return res.json(result);
  } catch (err) {
    console.error("[EVOLUTION/contacts] erro:", err?.message);
    return res.status(500).json({ error: err?.message });
  }
}

// _api/webhook/whatsapp.ts
init_adminFirebase();

// _api/lib/metaApi.ts
import axios from "axios";
var GRAPH_URL = "https://graph.facebook.com/v23.0";
var MAX_RETRIES = 3;
var TIMEOUT_MS = 15e3;
function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("[MetaAPI] META_ACCESS_TOKEN n\xE3o definida");
  return t;
}
function phoneNumberId() {
  const id = process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("[MetaAPI] META_PHONE_NUMBER_ID n\xE3o definida");
  return id;
}
function authHeaders2() {
  return {
    Authorization: `Bearer ${token()}`,
    "Content-Type": "application/json"
  };
}
async function post(endpoint, data, retries = MAX_RETRIES) {
  const url = `${GRAPH_URL}${endpoint}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(url, data, {
        headers: authHeaders2(),
        timeout: TIMEOUT_MS
      });
      return res.data;
    } catch (err) {
      const axErr = err;
      const status = axErr.response?.status ?? 0;
      const errData = axErr.response?.data;
      const code = errData?.error?.code;
      if (status === 429 || code === 80007) {
        const wait = attempt * 3e3;
        console.warn(`[MetaAPI] Rate limit (tentativa ${attempt}/${retries}), aguardando ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (attempt < retries && (status >= 500 || status === 0)) {
        console.warn(`[MetaAPI] Erro ${status} em ${endpoint}, retry ${attempt}/${retries}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      console.error(`[MetaAPI] POST ${endpoint} falhou (${status}):`, JSON.stringify(errData));
      throw new Error(`MetaAPI error ${status}: ${errData?.error?.message ?? axErr.message}`);
    }
  }
}
async function get(endpoint) {
  const url = `${GRAPH_URL}${endpoint}`;
  try {
    const res = await axios.get(url, { headers: authHeaders2(), timeout: TIMEOUT_MS });
    return res.data;
  } catch (err) {
    const axErr = err;
    const status = axErr.response?.status ?? 0;
    const errData = axErr.response?.data;
    console.error(`[MetaAPI] GET ${endpoint} falhou (${status}):`, JSON.stringify(errData));
    throw new Error(`MetaAPI error ${status}: ${errData?.error?.message ?? axErr.message}`);
  }
}
var MetaAPI = {
  async sendText(to, body) {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendText \u2192 ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { preview_url: false, body }
    });
  },
  async sendImage(to, imageUrl, caption) {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendImage \u2192 ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "image",
      image: { link: imageUrl, ...caption ? { caption } : {} }
    });
  },
  async sendDocument(to, documentUrl, filename, caption) {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendDocument \u2192 ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "document",
      document: { link: documentUrl, filename, ...caption ? { caption } : {} }
    });
  },
  async sendAudio(to, audioUrl) {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendAudio \u2192 ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "audio",
      audio: { link: audioUrl }
    });
  },
  async sendTemplate(to, templateName, languageCode, components) {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendTemplate '${templateName}' \u2192 ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...components ? { components } : {}
      }
    });
  },
  async markAsRead(messageId) {
    try {
      return await post(`/${phoneNumberId()}/messages`, {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId
      });
    } catch (err) {
      console.warn(`[MetaAPI] markAsRead ${messageId} falhou:`, err);
      return null;
    }
  },
  async downloadMedia(mediaId) {
    try {
      const info = await get(`/${mediaId}`);
      return { url: info.url, mimeType: info.mime_type, fileSize: info.file_size };
    } catch (err) {
      console.error(`[MetaAPI] downloadMedia ${mediaId} falhou:`, err);
      return null;
    }
  },
  async getPhoneNumberInfo() {
    return get(`/${phoneNumberId()}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,throughput,webhook_configuration`);
  },
  async getProfile(wabaId) {
    const id = wabaId ?? process.env.META_WABA_ID;
    if (!id) return null;
    return get(`/${id}?fields=id,name,timezone_id,currency,message_template_namespace`);
  },
  async validateToken() {
    try {
      const data = await get("/me");
      return { valid: true, name: data.name, id: data.id };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
};
function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

// _api/webhook/whatsapp.ts
init_socketRegistry();
var META_SESSION_ID = "meta";
function handleVerify(req, res) {
  const mode = req.query?.["hub.mode"];
  const token2 = req.query?.["hub.verify_token"];
  const challenge = req.query?.["hub.challenge"];
  const expected = process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    console.error("[WEBHOOK/META] Verify token n\xE3o definido");
    return res.status(500).json({ error: "Server misconfigured" });
  }
  if (mode === "subscribe" && token2 === expected) {
    console.log("[WEBHOOK/META] Verifica\xE7\xE3o OK \u2713");
    return res.status(200).send(challenge);
  }
  console.warn(`[WEBHOOK/META] Token inv\xE1lido. Esperado: ${expected}, recebido: ${token2}`);
  return res.status(403).json({ error: "Forbidden" });
}
function handleEvent(req, res) {
  const body = req.body;
  if (body?.object === "whatsapp_business_account") {
    res.status(200).json({ status: "ok" });
    processWebhook(body).catch(
      (err) => console.error("[WEBHOOK/META] Erro ao processar evento:", err)
    );
  } else {
    res.status(200).end();
  }
}
async function processWebhook(body) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const val = change.value ?? {};
      const contacts = val.contacts ?? [];
      const messages = val.messages ?? [];
      const statuses = val.statuses ?? [];
      const profileMap = {};
      for (const c of contacts) {
        if (c.wa_id) profileMap[c.wa_id] = c.profile?.name ?? "";
      }
      for (const msg of messages) {
        await handleIncomingMessage(msg, profileMap[msg.from]).catch(
          (err) => console.error("[WEBHOOK/META] handleIncomingMessage error:", err)
        );
      }
      for (const status of statuses) {
        await handleStatus(status).catch(
          (err) => console.error("[WEBHOOK/META] handleStatus error:", err)
        );
      }
    }
  }
}
async function handleIncomingMessage(msg, profileName) {
  const from = msg.from;
  const wamid = msg.id;
  const ts = new Date(Number(msg.timestamp) * 1e3).toISOString();
  const msgType = msg.type ?? "unknown";
  const { text, mediaId, mimeType, fileName } = extractContent(msg);
  console.log(`[WEBHOOK/META] \u2190 ${msgType} de ${from}: "${text.slice(0, 80)}"`);
  const existing = await fsQuery("messages", [{ field: "wamid", value: wamid }]);
  if (existing.length > 0) {
    console.log(`[WEBHOOK/META] Msg ${wamid} j\xE1 existe, ignorando`);
    return;
  }
  const organizationId = process.env.META_ORG_ID ?? "default";
  const lead = await findOrCreateLead(from, organizationId, ts, profileName);
  const conversationId = `meta_${from}`;
  const msgId = `meta_in_${wamid}`;
  let mediaUrl = null;
  if (mediaId) {
    const media = await MetaAPI.downloadMedia(mediaId).catch(() => null);
    mediaUrl = media?.url ?? null;
  }
  await fsSet("messages", msgId, {
    id: msgId,
    leadId: lead.id,
    organizationId,
    sender: "lead",
    channel: "whatsapp_meta",
    messageType: msgType,
    text,
    wamid,
    status: "received",
    timestamp: ts,
    conversationId,
    direction: "inbound",
    ...mediaUrl ? { mediaUrl } : {},
    ...mimeType ? { mimeType } : {},
    ...fileName ? { fileName } : {},
    createdAt: ts
  });
  await fsUpdate("leads", lead.id, {
    lastMessage: text.slice(0, 200),
    lastMessageAt: ts,
    lastMessageDirection: "inbound",
    lastInteractionAt: ts,
    unreadCount: (lead.unreadCount ?? 0) + 1,
    updatedAt: ts
  });
  const existingConv = getConversation(conversationId);
  const cachedConv = {
    id: conversationId,
    sessionId: META_SESSION_ID,
    sessionName: META_SESSION_ID,
    phone: from,
    contactName: existingConv?.contactName || profileName || `+${from}`,
    contactPicture: existingConv?.contactPicture,
    lastMessage: text.slice(0, 200),
    lastMessageAt: ts,
    lastMessageDirection: "inbound",
    updatedAt: ts,
    unreadCount: (existingConv?.unreadCount ?? 0) + 1,
    organizationId,
    leadId: lead.id
  };
  setConversation(cachedConv);
  const cachedMsg = {
    id: msgId,
    conversationId,
    sessionId: META_SESSION_ID,
    direction: "inbound",
    messageType: msgType,
    body: text,
    phone: from,
    contactName: cachedConv.contactName,
    timestamp: ts,
    status: "received",
    organizationId,
    ...mediaUrl ? { mediaUrl } : {},
    ...mimeType ? { mimeType } : {},
    ...fileName ? { fileName } : {}
  };
  setMessage(cachedMsg);
  emitToSession(META_SESSION_ID, "wa:chat_upsert", cachedConv);
  emitToSession(META_SESSION_ID, "wa:message_upsert", cachedMsg);
  MetaAPI.markAsRead(wamid).catch(() => {
  });
}
async function handleStatus(status) {
  const wamid = status.id;
  const newStatus = status.status;
  const phone = status.recipient_id;
  const ts = new Date(Number(status.timestamp) * 1e3).toISOString();
  console.log(`[WEBHOOK/META] Status ${wamid} \u2192 ${newStatus}`);
  const docs = await fsQuery("messages", [{ field: "wamid", value: wamid }]);
  for (const doc of docs) {
    await fsUpdate("messages", doc.id, { status: newStatus, statusUpdatedAt: ts });
  }
  if (newStatus === "failed") {
    const errors = status.errors ?? [];
    console.error(`[WEBHOOK/META] Entrega falhou para ${phone}:`, JSON.stringify(errors));
  }
}
function extractContent(msg) {
  const type = msg.type;
  if (type === "text") {
    return { text: msg.text?.body ?? "", mediaId: null, mimeType: null, fileName: null };
  }
  if (type === "image") {
    return {
      text: msg.image?.caption ?? "[imagem]",
      mediaId: msg.image?.id ?? null,
      mimeType: msg.image?.mime_type ?? "image/jpeg",
      fileName: null
    };
  }
  if (type === "document") {
    return {
      text: msg.document?.caption ?? msg.document?.filename ?? "[documento]",
      mediaId: msg.document?.id ?? null,
      mimeType: msg.document?.mime_type ?? "application/octet-stream",
      fileName: msg.document?.filename ?? "arquivo"
    };
  }
  if (type === "audio" || type === "voice") {
    return {
      text: "[\xE1udio]",
      mediaId: msg.audio?.id ?? msg.voice?.id ?? null,
      mimeType: msg.audio?.mime_type ?? msg.voice?.mime_type ?? "audio/ogg",
      fileName: null
    };
  }
  if (type === "video") {
    return {
      text: msg.video?.caption ?? "[v\xEDdeo]",
      mediaId: msg.video?.id ?? null,
      mimeType: msg.video?.mime_type ?? "video/mp4",
      fileName: null
    };
  }
  if (type === "sticker") {
    return {
      text: "[sticker]",
      mediaId: msg.sticker?.id ?? null,
      mimeType: msg.sticker?.mime_type ?? "image/webp",
      fileName: null
    };
  }
  if (type === "location") {
    const { latitude, longitude, name, address } = msg.location ?? {};
    return {
      text: `[localiza\xE7\xE3o] ${name ?? ""} ${address ?? ""} (${latitude}, ${longitude})`.trim(),
      mediaId: null,
      mimeType: null,
      fileName: null
    };
  }
  if (type === "contacts") {
    const names = (msg.contacts ?? []).map(
      (c) => `${c.name?.formatted_name ?? ""}`.trim()
    ).join(", ");
    return { text: `[contato] ${names}`, mediaId: null, mimeType: null, fileName: null };
  }
  if (type === "button") {
    return { text: msg.button?.text ?? "[bot\xE3o]", mediaId: null, mimeType: null, fileName: null };
  }
  if (type === "interactive") {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    return {
      text: reply?.title ?? msg.interactive?.type ?? "[interativo]",
      mediaId: null,
      mimeType: null,
      fileName: null
    };
  }
  if (type === "order") {
    return { text: "[pedido]", mediaId: null, mimeType: null, fileName: null };
  }
  if (type === "system") {
    return { text: msg.system?.body ?? "[sistema]", mediaId: null, mimeType: null, fileName: null };
  }
  return { text: `[${type}]`, mediaId: null, mimeType: null, fileName: null };
}
async function findOrCreateLead(phone, organizationId, now, profileName) {
  const existing = await fsQuery("leads", [
    { field: "phone", value: phone },
    { field: "organizationId", value: organizationId }
  ]);
  if (existing.length > 0) {
    return existing[0];
  }
  const id = `wa_${phone}_${Date.now()}`;
  const name = profileName?.trim() || `WhatsApp ${phone}`;
  await fsSet("leads", id, {
    id,
    phone,
    name,
    status: "Novo Lead",
    organizationId,
    iaActive: false,
    responsibleAgentType: "human",
    source: "whatsapp_meta",
    channel: "whatsapp_meta",
    createdAt: now,
    updatedAt: now,
    ownerId: "system",
    unreadCount: 0
  });
  console.log(`[WEBHOOK/META] Novo lead criado: ${id} (${phone})`);
  return { id, organizationId, unreadCount: 0 };
}

// _api/meta/send.ts
init_adminFirebase();
init_socketRegistry();
async function handler15(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { to, type = "text", message, imageUrl, documentUrl, filename, audioUrl, templateName, languageCode, components, caption } = req.body ?? {};
  if (!to) return res.status(400).json({ error: 'Campo "to" obrigat\xF3rio' });
  const organizationId = process.env.META_ORG_ID ?? "default";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let result;
  try {
    switch (type) {
      case "text":
        if (!message) return res.status(400).json({ error: 'Campo "message" obrigat\xF3rio para texto' });
        result = await MetaAPI.sendText(to, message);
        break;
      case "image":
        if (!imageUrl) return res.status(400).json({ error: 'Campo "imageUrl" obrigat\xF3rio' });
        result = await MetaAPI.sendImage(to, imageUrl, caption);
        break;
      case "document":
        if (!documentUrl) return res.status(400).json({ error: 'Campo "documentUrl" obrigat\xF3rio' });
        result = await MetaAPI.sendDocument(to, documentUrl, filename ?? "documento", caption);
        break;
      case "audio":
        if (!audioUrl) return res.status(400).json({ error: 'Campo "audioUrl" obrigat\xF3rio' });
        result = await MetaAPI.sendAudio(to, audioUrl);
        break;
      case "template":
        if (!templateName) return res.status(400).json({ error: 'Campo "templateName" obrigat\xF3rio' });
        result = await MetaAPI.sendTemplate(to, templateName, languageCode ?? "pt_BR", components);
        break;
      default:
        return res.status(400).json({ error: `Tipo '${type}' n\xE3o suportado` });
    }
    const wamid = result?.messages?.[0]?.id;
    const phone = to.replace(/\D/g, "");
    const conversationId = `${META_SESSION_ID}_${phone}`;
    const msgId = `meta_out_${wamid ?? Date.now()}`;
    const bodyText = message ?? caption ?? `[${type}]`;
    try {
      const lead = await findOrCreateLead2(phone, organizationId, now);
      await fsSet("messages", msgId, {
        id: msgId,
        leadId: lead.id,
        organizationId,
        sender: "agent",
        channel: "whatsapp_meta",
        messageType: type,
        text: bodyText,
        wamid: wamid ?? null,
        status: "sent",
        timestamp: now,
        conversationId,
        direction: "outbound",
        createdAt: now
      });
      await fsUpdate("leads", lead.id, {
        lastMessage: bodyText,
        lastMessageAt: now,
        lastMessageDirection: "outbound",
        updatedAt: now
      });
      const existingConv = getConversation(conversationId);
      const cachedConv = {
        id: conversationId,
        sessionId: META_SESSION_ID,
        sessionName: META_SESSION_ID,
        phone,
        contactName: existingConv?.contactName ?? `+${phone}`,
        contactPicture: existingConv?.contactPicture,
        lastMessage: bodyText,
        lastMessageAt: now,
        lastMessageDirection: "outbound",
        updatedAt: now,
        unreadCount: existingConv?.unreadCount ?? 0,
        organizationId,
        leadId: lead.id
      };
      setConversation(cachedConv);
      const cachedMsg = {
        id: msgId,
        conversationId,
        sessionId: META_SESSION_ID,
        direction: "outbound",
        messageType: type,
        body: bodyText,
        phone,
        contactName: cachedConv.contactName,
        timestamp: now,
        status: "sent",
        organizationId
      };
      setMessage(cachedMsg);
      emitToSession(META_SESSION_ID, "wa:chat_upsert", cachedConv);
      emitToSession(META_SESSION_ID, "wa:message_upsert", cachedMsg);
    } catch (dbErr) {
      console.error("[META/send] Erro ao persistir mensagem:", dbErr);
    }
    return res.status(200).json({ success: true, wamid, raw: result });
  } catch (err) {
    console.error("[META/send] Erro ao enviar:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
async function findOrCreateLead2(phone, organizationId, now) {
  const existing = await fsQuery("leads", [
    { field: "phone", value: phone },
    { field: "organizationId", value: organizationId }
  ]);
  if (existing.length > 0) return existing[0];
  const id = `wa_${phone}_${Date.now()}`;
  await fsSet("leads", id, {
    id,
    phone,
    name: `WhatsApp ${phone}`,
    status: "Novo Lead",
    organizationId,
    iaActive: false,
    source: "whatsapp_meta",
    createdAt: now,
    updatedAt: now,
    ownerId: "system"
  });
  return { id, organizationId };
}

// _api/meta/status.ts
async function handler16(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const phoneNumberId2 = process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const wabaId = process.env.META_WABA_ID ?? "";
  const verifyToken = process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const tokenPresent = !!process.env.META_ACCESS_TOKEN;
  const report = {
    config: {
      phoneNumberId: phoneNumberId2 || null,
      wabaId: wabaId || null,
      verifyToken: verifyToken ? "***" + verifyToken.slice(-4) : null,
      tokenPresent
    },
    token: { valid: false },
    phoneNumber: null,
    waba: null,
    webhook: {
      verifyTokenSet: !!verifyToken,
      url: `${req.protocol}://${req.get("host")}/api/webhook/whatsapp`
    },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const tokenCheck = await MetaAPI.validateToken();
    report.token = tokenCheck;
  } catch (err) {
    report.token = { valid: false, error: err.message };
  }
  if (phoneNumberId2) {
    try {
      const info = await MetaAPI.getPhoneNumberInfo();
      report.phoneNumber = {
        id: info.id,
        displayNumber: info.display_phone_number,
        verifiedName: info.verified_name,
        qualityRating: info.quality_rating,
        throughput: info.throughput
      };
    } catch (err) {
      report.phoneNumber = { error: err.message };
    }
  }
  if (wabaId) {
    try {
      const waba = await MetaAPI.getProfile(wabaId);
      report.waba = {
        id: waba.id,
        name: waba.name,
        currency: waba.currency,
        messageTemplateNamespace: waba.message_template_namespace
      };
    } catch (err) {
      report.waba = { error: err.message };
    }
  }
  const allOk = report.token.valid && !!report.phoneNumber?.displayNumber;
  return res.status(200).json({ ok: allOk, ...report });
}

// _api/meta/messages.ts
init_adminFirebase();
async function handler17(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { phone } = req.query ?? {};
  if (!phone) return res.status(400).json({ error: "phone \xE9 obrigat\xF3rio" });
  const phoneStr = String(phone).replace(/\D/g, "");
  const conversationId = `${META_SESSION_ID}_${phoneStr}`;
  const cached = getMessages(conversationId);
  let firestoreMsgs = [];
  try {
    firestoreMsgs = await fsQuery("messages", [{ field: "conversationId", value: conversationId }]);
  } catch (err) {
    console.error("[META/messages] Erro ao buscar Firestore:", err);
  }
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  for (const m of [...firestoreMsgs, ...cached]) {
    const id = m.id ?? m.wamid;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push({
      id: m.id,
      conversationId,
      sessionId: META_SESSION_ID,
      direction: m.direction ?? (m.sender === "lead" ? "inbound" : "outbound"),
      messageType: m.messageType ?? "text",
      body: m.text ?? m.body ?? "",
      phone: phoneStr,
      contactName: m.contactName ?? `+${phoneStr}`,
      timestamp: m.timestamp ?? m.createdAt,
      status: m.status ?? "received",
      organizationId: m.organizationId ?? "default",
      ...m.mediaUrl ? { mediaUrl: m.mediaUrl } : {},
      ...m.mimeType ? { mimeType: m.mimeType } : {},
      ...m.fileName ? { fileName: m.fileName } : {}
    });
  }
  merged.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    success: true,
    imported: merged.length,
    contactName: getConversation(conversationId)?.contactName ?? `+${phoneStr}`,
    messages: merged
  });
}

// _api/email/accounts.ts
init_adminFirebase();
init_emailCache();
function stripTokens(account) {
  const { accessToken, refreshToken, ...safe } = account;
  return safe;
}
async function handler18(req, res) {
  try {
    if (req.method === "GET") {
      const { userId } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: "userId \xE9 obrigat\xF3rio" });
      const accounts = await fsQueryFull("email_accounts", [
        { field: "userId", value: String(userId) }
      ]);
      return res.status(200).json({
        accounts: accounts.map(stripTokens)
      });
    }
    if (req.method === "DELETE") {
      const { accountId } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
      await fsDelete("email_accounts", String(accountId));
      clearAccount(String(accountId));
      return res.status(200).json({ success: true });
    }
    if (req.method === "PUT") {
      const { accountId, isDefault, displayName } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
      const patch = {};
      if (isDefault !== void 0) patch.isDefault = Boolean(isDefault);
      if (displayName !== void 0) patch.displayName = String(displayName);
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nenhum campo para atualizar" });
      }
      await fsUpdate("email_accounts", String(accountId), patch);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[email/accounts] error:", err);
    return res.status(500).json({ error: "Erro interno", detail: err?.message });
  }
}

// _api/email/auth/gmail.ts
init_adminFirebase();
init_emailEncryption();
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var GOOGLE_USERINFO_URL = "https://www.googleapis.com/userinfo/v2/me";
var SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
].join(" ");
function generateId() {
  return `gmail_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
async function handler19(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const url = req.url ?? "";
  if (url.includes("/auth/gmail/init") || url.includes("/auth/gmail") && !url.includes("/callback")) {
    try {
      const { userId, returnUrl } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: "userId \xE9 obrigat\xF3rio" });
      const clientId = process.env.GMAIL_CLIENT_ID;
      const redirectUri = process.env.GMAIL_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).json({ error: "GMAIL_CLIENT_ID/REDIRECT_URI n\xE3o configurados" });
      }
      const state = Buffer.from(
        JSON.stringify({ userId: String(userId), returnUrl: String(returnUrl ?? "/") })
      ).toString("base64url");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state
      });
      return res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
    } catch (err) {
      console.error("[gmail/auth/init] error:", err);
      return res.status(500).json({ error: "Erro ao iniciar OAuth2", detail: err?.message });
    }
  }
  if (url.includes("/callback")) {
    try {
      const { code, state, error: oauthError } = req.query ?? {};
      if (oauthError) {
        return res.status(400).json({ error: `OAuth2 error: ${oauthError}` });
      }
      if (!code || !state) {
        return res.status(400).json({ error: "code e state s\xE3o obrigat\xF3rios" });
      }
      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      const redirectUri = process.env.GMAIL_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({ error: "GMAIL_CLIENT_ID/SECRET/REDIRECT_URI n\xE3o configurados" });
      }
      let parsedState;
      try {
        parsedState = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
      } catch {
        return res.status(400).json({ error: "state inv\xE1lido" });
      }
      const { userId, returnUrl } = parsedState;
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error("[gmail/auth/callback] token exchange failed:", text);
        return res.status(500).json({ error: "Falha na troca de tokens", detail: text });
      }
      const tokenData = await tokenRes.json();
      const { access_token, refresh_token, expires_in } = tokenData;
      if (!access_token || !refresh_token) {
        return res.status(500).json({ error: "Tokens inv\xE1lidos na resposta" });
      }
      const profileRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!profileRes.ok) {
        return res.status(500).json({ error: "Falha ao buscar perfil do usu\xE1rio" });
      }
      const profile = await profileRes.json();
      const email = profile.email;
      const displayName = profile.name ?? email;
      const existing = await fsQueryFull("email_accounts", [
        { field: "userId", value: userId },
        { field: "email", value: email }
      ]).catch(() => []);
      const accountId = existing[0]?.id ?? generateId();
      const now = Date.now();
      const accountData = {
        userId,
        email,
        displayName,
        provider: "gmail",
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        tokenExpiry: now + (expires_in ?? 3600) * 1e3,
        status: "active",
        createdAt: existing[0]?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        isDefault: existing.length === 0,
        // first account is default
        picture: profile.picture ?? ""
      };
      await fsSet("email_accounts", accountId, accountData);
      Promise.resolve().then(() => (init_emailSync(), emailSync_exports)).then(({ syncAccount: syncAccount2 }) => syncAccount2(accountId)).catch((err) => console.error("[gmail/auth/callback] initial sync error:", err));
      const separator = returnUrl.includes("?") ? "&" : "?";
      return res.redirect(`${returnUrl}${separator}emailConnected=gmail&accountId=${accountId}`);
    } catch (err) {
      console.error("[gmail/auth/callback] error:", err);
      return res.status(500).json({ error: "Erro no callback OAuth2", detail: err?.message });
    }
  }
  return res.status(404).json({ error: "Rota n\xE3o encontrada" });
}

// _api/email/auth/microsoft.ts
init_adminFirebase();
init_emailEncryption();
var MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
var MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
var GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";
var SCOPES2 = [
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access"
].join(" ");
function generateId2() {
  return `microsoft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
async function handler20(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const url = req.url ?? "";
  if (url.includes("/auth/microsoft/init") || url.includes("/auth/microsoft") && !url.includes("/callback")) {
    try {
      const { userId, returnUrl } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: "userId \xE9 obrigat\xF3rio" });
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).json({ error: "MICROSOFT_CLIENT_ID/REDIRECT_URI n\xE3o configurados" });
      }
      const state = Buffer.from(
        JSON.stringify({ userId: String(userId), returnUrl: String(returnUrl ?? "/") })
      ).toString("base64url");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES2,
        response_mode: "query",
        state
      });
      return res.redirect(`${MS_AUTH_URL}?${params}`);
    } catch (err) {
      console.error("[microsoft/auth/init] error:", err);
      return res.status(500).json({ error: "Erro ao iniciar OAuth2", detail: err?.message });
    }
  }
  if (url.includes("/callback")) {
    try {
      const { code, state, error: oauthError, error_description } = req.query ?? {};
      if (oauthError) {
        console.error("[microsoft/auth/callback] OAuth error:", oauthError, error_description);
        return res.status(400).json({ error: `OAuth2 error: ${oauthError}`, detail: error_description });
      }
      if (!code || !state) {
        return res.status(400).json({ error: "code e state s\xE3o obrigat\xF3rios" });
      }
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(500).json({ error: "MICROSOFT_CLIENT_ID/SECRET/REDIRECT_URI n\xE3o configurados" });
      }
      let parsedState;
      try {
        parsedState = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
      } catch {
        return res.status(400).json({ error: "state inv\xE1lido" });
      }
      const { userId, returnUrl } = parsedState;
      const tokenRes = await fetch(MS_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope: SCOPES2
        })
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error("[microsoft/auth/callback] token exchange failed:", text);
        return res.status(500).json({ error: "Falha na troca de tokens", detail: text });
      }
      const tokenData = await tokenRes.json();
      const { access_token, refresh_token, expires_in } = tokenData;
      if (!access_token || !refresh_token) {
        return res.status(500).json({ error: "Tokens inv\xE1lidos na resposta" });
      }
      const profileRes = await fetch(GRAPH_ME_URL, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!profileRes.ok) {
        return res.status(500).json({ error: "Falha ao buscar perfil do usu\xE1rio" });
      }
      const profile = await profileRes.json();
      const email = profile.mail ?? profile.userPrincipalName ?? "";
      const displayName = profile.displayName ?? email;
      if (!email) {
        return res.status(500).json({ error: "N\xE3o foi poss\xEDvel obter o e-mail do perfil" });
      }
      const existing = await fsQueryFull("email_accounts", [
        { field: "userId", value: userId },
        { field: "email", value: email }
      ]).catch(() => []);
      const accountId = existing[0]?.id ?? generateId2();
      const now = Date.now();
      const accountData = {
        userId,
        email,
        displayName,
        provider: "microsoft",
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        tokenExpiry: now + (expires_in ?? 3600) * 1e3,
        status: "active",
        createdAt: existing[0]?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        isDefault: existing.length === 0,
        microsoftId: profile.id ?? ""
      };
      await fsSet("email_accounts", accountId, accountData);
      Promise.resolve().then(() => (init_emailSync(), emailSync_exports)).then(({ syncAccount: syncAccount2 }) => syncAccount2(accountId)).catch((err) => console.error("[microsoft/auth/callback] initial sync error:", err));
      const separator = returnUrl.includes("?") ? "&" : "?";
      return res.redirect(`${returnUrl}${separator}emailConnected=microsoft&accountId=${accountId}`);
    } catch (err) {
      console.error("[microsoft/auth/callback] error:", err);
      return res.status(500).json({ error: "Erro no callback OAuth2", detail: err?.message });
    }
  }
  return res.status(404).json({ error: "Rota n\xE3o encontrada" });
}

// _api/email/messages.ts
init_adminFirebase();
init_emailCache();
init_emailSync();
init_gmailClient();
init_microsoftClient();
var CACHE_TTL_MS2 = 5 * 60 * 1e3;
async function loadAccount(accountId) {
  const account = await fsGet("email_accounts", accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  return account;
}
async function handler21(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const url = req.url ?? "";
    const query = req.query ?? {};
    const pathParts = url.split("?")[0].split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    const messageId = query.id ?? (lastPart !== "messages" ? lastPart : void 0);
    if (messageId && messageId !== "messages") {
      const { accountId: accountId2 } = query;
      if (!accountId2) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
      const account2 = await loadAccount(String(accountId2));
      const cached = getEmail(String(accountId2), String(messageId));
      if (cached?.bodyHtml !== void 0 || cached?.bodyText !== void 0) {
        if (!cached.isRead) {
          if (account2.provider === "gmail") {
            await modifyMessage(account2, String(messageId), [], ["UNREAD"]).catch(() => {
            });
          } else {
            await updateMessage2(account2, String(messageId), { isRead: true }).catch(() => {
            });
          }
          updateEmail(String(accountId2), String(messageId), { isRead: true });
        }
        return res.status(200).json({ message: { ...cached, isRead: true } });
      }
      let fullEmail;
      if (account2.provider === "gmail") {
        const full = await getMessage(account2, String(messageId), "full");
        fullEmail = parseGmailMessage(full, String(accountId2));
        await modifyMessage(account2, String(messageId), [], ["UNREAD"]).catch(() => {
        });
        fullEmail.isRead = true;
      } else {
        const full = await getMessage2(account2, String(messageId));
        const folder2 = cached?.folder ?? "inbox";
        fullEmail = parseMicrosoftMessage(full, String(accountId2), folder2);
        await updateMessage2(account2, String(messageId), { isRead: true }).catch(() => {
        });
        fullEmail.isRead = true;
      }
      setEmail(fullEmail);
      return res.status(200).json({ message: fullEmail });
    }
    const { accountId, folder = "inbox", page = "1", limit = "50", threadId } = query;
    if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
    const account = await loadAccount(String(accountId));
    if (account.status === "error" || account.status === "disconnected") {
      return res.status(400).json({ error: `Account status: ${account.status}` });
    }
    const syncState = getSyncState(String(accountId));
    const cacheAge = Date.now() - (syncState.lastSync ?? 0);
    const { emails: cachedEmails, total } = getEmailsByFolder(
      String(accountId),
      String(folder),
      pageNum,
      limitNum
    );
    if (total === 0 || cacheAge > CACHE_TTL_MS2) {
      if (total === 0) {
        await syncAccount(String(accountId)).catch(() => {
        });
      } else {
        syncAccount(String(accountId)).catch(() => {
        });
      }
    }
    const { emails: freshEmails } = getEmailsByFolder(
      String(accountId),
      String(folder),
      pageNum,
      limitNum
    );
    let result = freshEmails;
    if (threadId) {
      result = freshEmails.filter((e) => e.threadId === String(threadId));
    }
    const totalCount = total > 0 ? total : freshEmails.length;
    return res.status(200).json({
      messages: result,
      total: totalCount,
      page: pageNum,
      hasMore: pageNum * limitNum < totalCount
    });
  } catch (err) {
    console.error("[email/messages] error:", err);
    return res.status(500).json({ error: "Erro interno", detail: err?.message });
  }
}

// _api/email/send.ts
init_adminFirebase();
init_emailCache();
init_socketRegistry();
init_gmailClient();
init_microsoftClient();
function encodeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}
function formatAddress(recipient) {
  if (recipient.name) {
    return `${encodeHeader(recipient.name)} <${recipient.email}>`;
  }
  return recipient.email;
}
function buildMimeMessage(params, fromEmail) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [];
  lines.push(`From: ${fromEmail}`);
  lines.push(`To: ${params.to.map(formatAddress).join(", ")}`);
  if (params.cc && params.cc.length > 0) {
    lines.push(`Cc: ${params.cc.map(formatAddress).join(", ")}`);
  }
  if (params.bcc && params.bcc.length > 0) {
    lines.push(`Bcc: ${params.bcc.map(formatAddress).join(", ")}`);
  }
  lines.push(`Subject: ${encodeHeader(params.subject)}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");
  if (params.bodyText) {
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(params.bodyText);
    lines.push("");
  }
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/html; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(Buffer.from(params.bodyHtml, "utf8").toString("base64"));
  lines.push("");
  lines.push(`--${boundary}--`);
  const rawMessage = lines.join("\r\n");
  return Buffer.from(rawMessage).toString("base64url");
}
function buildMicrosoftPayload(params) {
  const toRecipients = params.to.map((r) => ({
    emailAddress: { address: r.email, name: r.name ?? r.email }
  }));
  const ccRecipients = (params.cc ?? []).map((r) => ({
    emailAddress: { address: r.email, name: r.name ?? r.email }
  }));
  const bccRecipients = (params.bcc ?? []).map((r) => ({
    emailAddress: { address: r.email, name: r.name ?? r.email }
  }));
  const message = {
    subject: params.subject,
    body: {
      contentType: "HTML",
      content: params.bodyHtml
    },
    toRecipients,
    ccRecipients,
    bccRecipients
  };
  return { message, saveToSentItems: true };
}
async function handler22(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = req.body ?? {};
    const { accountId, to, subject, bodyHtml } = body;
    if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
    if (!to || !Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: "to \xE9 obrigat\xF3rio e deve ser um array" });
    }
    if (!subject) return res.status(400).json({ error: "subject \xE9 obrigat\xF3rio" });
    if (!bodyHtml) return res.status(400).json({ error: "bodyHtml \xE9 obrigat\xF3rio" });
    const account = await fsGet("email_accounts", accountId);
    if (!account) return res.status(404).json({ error: "Conta n\xE3o encontrada" });
    let sentMessageId;
    if (account.provider === "gmail") {
      const rawMessage = buildMimeMessage(body, account.email);
      const result = await sendMessage(account, rawMessage);
      sentMessageId = result?.id;
    } else if (account.provider === "microsoft") {
      const payload = buildMicrosoftPayload(body);
      await sendMessage2(account, payload);
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const optimisticId = sentMessageId ?? `sent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const cachedSent = {
      id: optimisticId,
      accountId,
      provider: account.provider,
      folder: "sent",
      subject,
      from: { email: account.email, name: account.displayName },
      to: to.map((r) => ({ email: r.email, name: r.name })),
      cc: body.cc?.map((r) => ({ email: r.email, name: r.name })),
      date: now,
      snippet: bodyHtml.replace(/<[^>]+>/g, "").slice(0, 200),
      isRead: true,
      isStarred: false,
      hasAttachments: Boolean(body.attachments?.length),
      bodyHtml,
      bodyText: body.bodyText,
      fetchedAt: Date.now()
    };
    setEmail(cachedSent);
    emitGlobal("email:update", {
      type: "sent",
      userId: account.userId,
      accountId,
      messageId: optimisticId
    });
    return res.status(200).json({ success: true, messageId: optimisticId });
  } catch (err) {
    console.error("[email/send] error:", err);
    return res.status(500).json({ error: "Erro ao enviar e-mail", detail: err?.message });
  }
}

// _api/email/action.ts
init_adminFirebase();
init_emailCache();
init_socketRegistry();
init_gmailClient();
init_microsoftClient();
var MS_FOLDER_IDS = {
  inbox: "inbox",
  trash: "deleteditems",
  spam: "junkemail",
  archive: "archive",
  sent: "sentitems",
  drafts: "drafts"
};
async function applyGmailAction(account, messageId, action) {
  switch (action) {
    case "read":
      await modifyMessage(account, messageId, [], ["UNREAD"]);
      break;
    case "unread":
      await modifyMessage(account, messageId, ["UNREAD"], []);
      break;
    case "star":
      await modifyMessage(account, messageId, ["STARRED"], []);
      break;
    case "unstar":
      await modifyMessage(account, messageId, [], ["STARRED"]);
      break;
    case "archive":
      await modifyMessage(account, messageId, [], ["INBOX"]);
      break;
    case "trash":
      await trashMessage(account, messageId);
      break;
    case "spam":
      await modifyMessage(account, messageId, ["SPAM"], ["INBOX"]);
      break;
    case "restore":
      await untrashMessage(account, messageId);
      break;
    case "delete":
      await trashMessage(account, messageId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
async function applyMicrosoftAction(account, messageId, action) {
  switch (action) {
    case "read":
      await updateMessage2(account, messageId, { isRead: true });
      break;
    case "unread":
      await updateMessage2(account, messageId, { isRead: false });
      break;
    case "star":
      await updateMessage2(account, messageId, { flag: { flagStatus: "flagged" } });
      break;
    case "unstar":
      await updateMessage2(account, messageId, { flag: { flagStatus: "notFlagged" } });
      break;
    case "archive":
      await moveMessage(account, messageId, MS_FOLDER_IDS.archive);
      break;
    case "trash":
      await moveMessage(account, messageId, MS_FOLDER_IDS.trash);
      break;
    case "spam":
      await moveMessage(account, messageId, MS_FOLDER_IDS.spam);
      break;
    case "restore":
      await moveMessage(account, messageId, MS_FOLDER_IDS.inbox);
      break;
    case "delete":
      await deleteMessage2(account, messageId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
function applyLocalCacheUpdate(accountId, messageId, action) {
  const email = getEmail(accountId, messageId);
  if (!email) return;
  switch (action) {
    case "read":
      updateEmail(accountId, messageId, { isRead: true });
      break;
    case "unread":
      updateEmail(accountId, messageId, { isRead: false });
      break;
    case "star":
      updateEmail(accountId, messageId, { isStarred: true });
      break;
    case "unstar":
      updateEmail(accountId, messageId, { isStarred: false });
      break;
    case "archive":
      updateEmail(accountId, messageId, { folder: "archive" });
      break;
    case "trash":
      updateEmail(accountId, messageId, { folder: "trash" });
      break;
    case "spam":
      updateEmail(accountId, messageId, { folder: "spam" });
      break;
    case "restore":
      updateEmail(accountId, messageId, { folder: "inbox" });
      break;
    case "delete":
      removeEmail(accountId, messageId);
      break;
  }
}
async function handler23(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { accountId, messageId, action } = req.body ?? {};
    if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
    if (!messageId) return res.status(400).json({ error: "messageId \xE9 obrigat\xF3rio" });
    if (!action) return res.status(400).json({ error: "action \xE9 obrigat\xF3rio" });
    const validActions = [
      "read",
      "unread",
      "star",
      "unstar",
      "archive",
      "trash",
      "spam",
      "restore",
      "delete"
    ];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `action inv\xE1lida: ${action}` });
    }
    const account = await fsGet("email_accounts", String(accountId));
    if (!account) return res.status(404).json({ error: "Conta n\xE3o encontrada" });
    if (account.provider === "gmail") {
      await applyGmailAction(account, String(messageId), action);
    } else if (account.provider === "microsoft") {
      await applyMicrosoftAction(account, String(messageId), action);
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }
    applyLocalCacheUpdate(String(accountId), String(messageId), action);
    emitGlobal("email:update", {
      type: "action",
      userId: account.userId,
      accountId: String(accountId),
      messageId: String(messageId),
      action
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[email/action] error:", err);
    return res.status(500).json({ error: "Erro ao executar a\xE7\xE3o", detail: err?.message });
  }
}

// _api/email/draft.ts
init_adminFirebase();
init_emailCache();
init_gmailClient();
init_microsoftClient();
function buildGmailDraftRaw(params, fromEmail) {
  const lines = [];
  lines.push(`From: ${fromEmail}`);
  if (params.to?.length) lines.push(`To: ${params.to.map((r) => r.email).join(", ")}`);
  if (params.cc?.length) lines.push(`Cc: ${params.cc.map((r) => r.email).join(", ")}`);
  lines.push(`Subject: ${params.subject ?? "(sem assunto)"}`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/html; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(Buffer.from(params.bodyHtml ?? "", "utf8").toString("base64"));
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
function buildMsDraftPayload(params) {
  return {
    subject: params.subject ?? "(sem assunto)",
    body: { contentType: "HTML", content: params.bodyHtml ?? "" },
    toRecipients: (params.to ?? []).map((r) => ({
      emailAddress: { address: r.email, name: r.name ?? r.email }
    })),
    ccRecipients: (params.cc ?? []).map((r) => ({
      emailAddress: { address: r.email, name: r.name ?? r.email }
    })),
    isDraft: true
  };
}
async function handler24(req, res) {
  try {
    const url = req.url ?? "";
    const query = req.query ?? {};
    if (req.method === "GET") {
      const { accountId } = query;
      if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
      const drafts = getAllEmailsByFolder(String(accountId), "drafts");
      return res.status(200).json({ drafts });
    }
    if (req.method === "POST") {
      const body = req.body ?? {};
      const { accountId, draftId } = body;
      if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
      const account = await fsGet("email_accounts", String(accountId));
      if (!account) return res.status(404).json({ error: "Conta n\xE3o encontrada" });
      let resultId;
      if (account.provider === "gmail") {
        const raw = buildGmailDraftRaw(body, account.email);
        if (draftId) {
          const result = await updateDraft(account, draftId, raw);
          resultId = result?.id ?? draftId;
        } else {
          const result = await createDraft(account, raw);
          resultId = result?.id ?? `draft_${Date.now()}`;
        }
      } else if (account.provider === "microsoft") {
        const payload = buildMsDraftPayload(body);
        if (draftId) {
          const result = await updateDraft2(account, draftId, payload);
          resultId = result?.id ?? draftId;
        } else {
          const result = await createDraft2(account, payload);
          resultId = result?.id ?? `draft_${Date.now()}`;
        }
      } else {
        return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const cachedDraft = {
        id: resultId,
        accountId: String(accountId),
        provider: account.provider,
        folder: "drafts",
        subject: body.subject ?? "(sem assunto)",
        from: { email: account.email, name: account.displayName },
        to: body.to ?? [],
        cc: body.cc,
        date: now,
        snippet: (body.bodyHtml ?? "").replace(/<[^>]+>/g, "").slice(0, 200),
        isRead: true,
        isStarred: false,
        hasAttachments: false,
        bodyHtml: body.bodyHtml,
        fetchedAt: Date.now()
      };
      setEmail(cachedDraft);
      return res.status(200).json({ success: true, draftId: resultId });
    }
    if (req.method === "DELETE") {
      const { accountId } = query;
      if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
      const pathParts = url.split("?")[0].split("/").filter(Boolean);
      const draftId = pathParts[pathParts.length - 1];
      if (!draftId || draftId === "draft") {
        return res.status(400).json({ error: "draftId \xE9 obrigat\xF3rio na URL" });
      }
      const account = await fsGet("email_accounts", String(accountId));
      if (!account) return res.status(404).json({ error: "Conta n\xE3o encontrada" });
      if (account.provider === "gmail") {
        await deleteDraft(account, draftId);
      } else if (account.provider === "microsoft") {
        await deleteDraft2(account, draftId);
      } else {
        return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
      }
      removeEmail(String(accountId), draftId);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[email/draft] error:", err);
    return res.status(500).json({ error: "Erro interno", detail: err?.message });
  }
}

// _api/email/sync.ts
init_emailSync();
init_emailCache();
async function handler25(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { accountId } = req.query ?? {};
    if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
    const result = await syncAccount(String(accountId));
    const syncState = getSyncState(String(accountId));
    return res.status(200).json({
      success: true,
      imported: result.imported,
      errors: result.errors,
      lastSync: syncState.lastSync
    });
  } catch (err) {
    console.error("[email/sync] error:", err);
    return res.status(500).json({ error: "Erro ao sincronizar", detail: err?.message });
  }
}

// _api/email/search.ts
init_adminFirebase();
init_emailCache();
init_gmailClient();
init_microsoftClient();
var MAX_RESULTS = 20;
async function searchGmail(account, q, folder) {
  const params = new URLSearchParams({
    maxResults: String(MAX_RESULTS),
    q
  });
  if (folder && folder !== "all") {
    const labelMap = {
      inbox: "INBOX",
      sent: "SENT",
      drafts: "DRAFT",
      trash: "TRASH",
      spam: "SPAM"
    };
    const label = labelMap[folder];
    if (label) params.append("labelIds", label);
  }
  const data = await gmailRequest(account, `/users/me/messages?${params}`);
  const messages = [];
  const msgRefs = data?.messages ?? [];
  for (const ref of msgRefs.slice(0, MAX_RESULTS)) {
    try {
      const full = await getMessage(account, ref.id, "metadata");
      const parsed = parseGmailMessage(full, account.id);
      messages.push(parsed);
    } catch {
    }
  }
  return messages;
}
async function searchMicrosoft(account, q, folder) {
  const folderMap = {
    inbox: "inbox",
    sent: "sentitems",
    drafts: "drafts",
    trash: "deleteditems",
    spam: "junkemail",
    archive: "archive"
  };
  const folderPath = folder && folder !== "all" ? folderMap[folder] ?? "inbox" : "inbox";
  const params = new URLSearchParams({
    $search: `"${q}"`,
    $top: String(MAX_RESULTS),
    $select: "id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,flag,hasAttachments,conversationId"
  });
  let data;
  try {
    data = await graphRequest(
      account,
      `me/mailFolders/${folderPath}/messages?${params}`,
      { headers: { ConsistencyLevel: "eventual" } }
    );
  } catch {
    const fallbackParams = new URLSearchParams({
      $filter: `contains(subject,'${q.replace(/'/g, "''")}')`,
      $top: String(MAX_RESULTS),
      $select: "id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,flag,hasAttachments,conversationId"
    });
    data = await graphRequest(account, `me/mailFolders/${folderPath}/messages?${fallbackParams}`);
  }
  const msgs = data?.value ?? [];
  return msgs.map((msg) => parseMicrosoftMessage(msg, account.id, folderPath));
}
function searchCache(accountId, q, folder) {
  const folders = folder && folder !== "all" ? [folder] : ["inbox", "sent", "drafts", "trash", "spam", "archive"];
  const lowerQ = q.toLowerCase();
  const results = [];
  for (const f of folders) {
    const emails = getAllEmailsByFolder(accountId, f);
    for (const email of emails) {
      if (email.subject.toLowerCase().includes(lowerQ) || email.from.email.toLowerCase().includes(lowerQ) || email.from.name?.toLowerCase().includes(lowerQ) || email.snippet.toLowerCase().includes(lowerQ) || email.to.some(
        (r) => r.email.toLowerCase().includes(lowerQ) || r.name?.toLowerCase().includes(lowerQ)
      )) {
        results.push(email);
        if (results.length >= MAX_RESULTS) break;
      }
    }
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}
async function handler26(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { accountId, q, folder } = req.query ?? {};
    if (!accountId) return res.status(400).json({ error: "accountId \xE9 obrigat\xF3rio" });
    if (!q) return res.status(400).json({ error: "q (query) \xE9 obrigat\xF3rio" });
    const account = await fsGet("email_accounts", String(accountId));
    if (!account) return res.status(404).json({ error: "Conta n\xE3o encontrada" });
    const cachedResults = searchCache(String(accountId), String(q), folder ? String(folder) : void 0);
    if (cachedResults.length >= MAX_RESULTS) {
      return res.status(200).json({ messages: cachedResults.slice(0, MAX_RESULTS) });
    }
    let apiResults = [];
    try {
      if (account.provider === "gmail") {
        apiResults = await searchGmail(
          account,
          String(q),
          folder ? String(folder) : void 0
        );
      } else if (account.provider === "microsoft") {
        apiResults = await searchMicrosoft(
          account,
          String(q),
          folder ? String(folder) : void 0
        );
      }
    } catch (err) {
      console.error("[email/search] API search failed, returning cache results:", err.message);
    }
    const merged = /* @__PURE__ */ new Map();
    for (const e of apiResults) merged.set(e.id, e);
    for (const e of cachedResults) {
      if (!merged.has(e.id)) merged.set(e.id, e);
    }
    const results = Array.from(merged.values()).slice(0, MAX_RESULTS);
    return res.status(200).json({ messages: results });
  } catch (err) {
    console.error("[email/search] error:", err);
    return res.status(500).json({ error: "Erro na busca", detail: err?.message });
  }
}

// _api/email/settings.ts
init_adminFirebase();
var DEFAULT_SETTINGS = {
  signature: "",
  displayName: "",
  defaultAccountId: "",
  notifications: {
    enabled: true,
    sound: false,
    desktop: true
  },
  theme: "system",
  previewPane: "right",
  emailsPerPage: 50
};
async function handler27(req, res) {
  try {
    if (req.method === "GET") {
      const { userId } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: "userId \xE9 obrigat\xF3rio" });
      const settings = await fsGet("email_settings", String(userId));
      return res.status(200).json({
        settings: settings ?? { userId: String(userId), ...DEFAULT_SETTINGS }
      });
    }
    if (req.method === "PUT") {
      const body = req.body ?? {};
      const { userId, signature, displayName, defaultAccountId, notifications, theme, previewPane, emailsPerPage } = body;
      if (!userId) return res.status(400).json({ error: "userId \xE9 obrigat\xF3rio" });
      const existing = await fsGet("email_settings", String(userId)) ?? {
        ...DEFAULT_SETTINGS,
        userId: String(userId)
      };
      const updated = {
        ...existing,
        userId: String(userId)
      };
      if (signature !== void 0) updated.signature = String(signature);
      if (displayName !== void 0) updated.displayName = String(displayName);
      if (defaultAccountId !== void 0) updated.defaultAccountId = String(defaultAccountId);
      if (notifications !== void 0) {
        updated.notifications = {
          enabled: Boolean(notifications.enabled ?? existing.notifications?.enabled ?? true),
          sound: Boolean(notifications.sound ?? existing.notifications?.sound ?? false),
          desktop: Boolean(notifications.desktop ?? existing.notifications?.desktop ?? true)
        };
      }
      if (theme !== void 0) updated.theme = theme;
      if (previewPane !== void 0) updated.previewPane = previewPane;
      if (emailsPerPage !== void 0) updated.emailsPerPage = Number(emailsPerPage);
      await fsSet("email_settings", String(userId), updated);
      return res.status(200).json({ success: true, settings: updated });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[email/settings] error:", err);
    return res.status(500).json({ error: "Erro interno", detail: err?.message });
  }
}

// _api/email/stats.ts
init_adminFirebase();
init_emailCache();
async function handler28(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { userId } = req.query ?? {};
    if (!userId) return res.status(400).json({ error: "userId \xE9 obrigat\xF3rio" });
    const accounts = await fsQueryFull("email_accounts", [
      { field: "userId", value: String(userId) }
    ]);
    const totals = {
      inbox: 0,
      unread: 0,
      sent: 0,
      drafts: 0,
      archived: 0,
      spam: 0,
      trash: 0
    };
    for (const account of accounts) {
      if (!account.id) continue;
      if (account.status === "error" || account.status === "disconnected") continue;
      const counts = getAccountFolderCounts(account.id);
      totals.inbox += counts["inbox"] ?? 0;
      totals.sent += counts["sent"] ?? 0;
      totals.drafts += counts["drafts"] ?? 0;
      totals.archived += counts["archive"] ?? 0;
      totals.spam += counts["spam"] ?? 0;
      totals.trash += counts["trash"] ?? 0;
      totals.unread += getUnreadCount(account.id, "inbox");
    }
    return res.status(200).json({
      stats: totals,
      accounts: accounts.length,
      cacheStats: cacheStats2()
    });
  } catch (err) {
    console.error("[email/stats] error:", err);
    return res.status(500).json({ error: "Erro interno", detail: err?.message });
  }
}

// _api/server.ts
init_emailSync();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var app = express();
var BODY_LIMIT = "25mb";
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  }
  next(err);
});
app.get("/api/health", (_req, res) => res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() }));
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.post("/api/datadog/llm-obs", async (req, res) => {
  const apiKey = process.env.DD_API_KEY;
  const site = process.env.DD_SITE || "us5.datadoghq.com";
  if (!apiKey) return res.status(204).end();
  try {
    const r = await axios2.post(
      `https://api.${site}/api/intake/llm-observability/v1/api/traces`,
      req.body,
      { headers: { "DD-API-KEY": apiKey, "Content-Type": "application/json" }, timeout: 5e3 }
    );
    res.status(r.status).end();
  } catch {
    res.status(204).end();
  }
});
app.get("/api/webhook/whatsapp", handleVerify);
app.post("/api/webhook/whatsapp", handleEvent);
app.get("/api/meta/status", handler16);
app.post("/api/meta/send", handler15);
app.get("/api/meta/messages", handler17);
app.post("/api/proxy/openrouter/request", async (req, res) => {
  const { apiKey, method, endpoint, data } = req.body;
  if (!apiKey) return res.status(400).json({ error: "API Key is required" });
  try {
    const r = await axios2({
      method: method || "GET",
      url: `https://openrouter.ai/api/v1${endpoint}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": `https://${req.get("host")}`,
        "X-OpenRouter-Title": "Michelin Seguros CRM"
      },
      data: data || void 0,
      timeout: 3e4,
      maxBodyLength: 15 * 1024 * 1024,
      maxContentLength: 15 * 1024 * 1024
    });
    res.status(r.status).json(r.data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
  }
});
app.post("/api/proxy/openrouter/auth", async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: "API Key is required" });
  try {
    const r = await axios2.get("https://openrouter.ai/api/v1/auth/key", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": `https://${req.get("host")}`,
        "X-OpenRouter-Title": "Michelin Seguros CRM"
      },
      timeout: 1e4
    });
    res.json(r.data);
  } catch (e) {
    res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
  }
});
app.all("/api/evolution/sessions", handler);
app.all("/api/evolution/qr", handler2);
app.all("/api/evolution/send", handler3);
app.all("/api/evolution/sync", handler4);
app.all("/api/evolution/conversation", handler5);
app.all("/api/evolution/conversations", handler6);
app.all("/api/evolution/messages", handler7);
app.all("/api/evolution/reconcile", handler9);
app.all("/api/evolution/media", handler10);
app.all("/api/evolution/stats", handler11);
app.all("/api/evolution/sendMedia", handler12);
app.all("/api/evolution/avatar", handler13);
app.all("/api/evolution/contacts", handler14);
app.all("/api/webhook/evolution", handler8);
app.all("/api/webhook/evolution/:event", handler8);
app.post("/api/cron/reconcile", async (_req, res) => {
  runReconcile().catch(console.error);
  res.json({ ok: true });
});
app.post("/api/cron/email-sync", async (_req, res) => {
  syncAllAccounts().catch(console.error);
  res.json({ ok: true });
});
app.all("/api/email/accounts", handler18);
app.all("/api/email/auth/gmail/init", handler19);
app.all("/api/email/auth/gmail/callback", handler19);
app.all("/api/email/auth/microsoft/init", handler20);
app.all("/api/email/auth/microsoft/callback", handler20);
app.all("/api/email/messages", handler21);
app.all("/api/email/messages/:id", handler21);
app.all("/api/email/send", handler22);
app.all("/api/email/action", handler23);
app.all("/api/email/drafts", handler24);
app.all("/api/email/draft", handler24);
app.all("/api/email/draft/:id", handler24);
app.all("/api/email/sync", handler25);
app.all("/api/email/search", handler26);
app.all("/api/email/settings", handler27);
app.all("/api/email/stats", handler28);
var server_default = app;
export {
  server_default as default
};
