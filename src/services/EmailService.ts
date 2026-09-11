// ─── Email Types ──────────────────────────────────────────────────────────────

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  id?: string;
  filename: string;
  mimeType: string;
  size: number;
  downloadUrl?: string;
}

export interface CachedEmail {
  id: string;
  accountId: string;
  provider: 'gmail' | 'microsoft' | 'imap';
  folder: string;
  threadId?: string;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: string;
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: EmailAttachment[];
  labels?: string[];
}

export interface EmailAccount {
  id: string;
  userId: string;
  provider: 'gmail' | 'microsoft' | 'imap';
  email: string;
  displayName?: string;
  isDefault: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  errorMessage?: string;
}

export interface EmailStats {
  inbox: number;
  unread: number;
  sent: number;
  drafts: number;
  archived: number;
  spam: number;
  trash: number;
}

export interface EmailSettings {
  userId: string;
  signature?: string;
  displayName?: string;
  defaultAccountId?: string;
  autoReply?: {
    enabled: boolean;
    subject: string;
    body: string;
  };
  notifications: {
    newEmail: boolean;
    desktop: boolean;
  };
}

export interface EmailAttachmentPayload {
  filename: string;
  mimeType: string;
  data: string; // base64, sem prefixo data:
}

export interface SendEmailPayload {
  accountId: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: EmailAttachmentPayload[];
  replyToMessageId?: string;
  threadId?: string;
}

export async function fileToAttachmentPayload(file: File): Promise<EmailAttachmentPayload> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Monta a string em blocos — passar o array inteiro de uma vez pro
  // String.fromCharCode/apply estoura a pilha em arquivos de alguns MB.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { filename: file.name, mimeType: file.type || 'application/octet-stream', data: btoa(binary) };
}

export interface DraftPayload {
  accountId: string;
  draftId?: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

export interface MessageListResponse {
  messages: CachedEmail[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface SearchResponse {
  messages: CachedEmail[];
  total: number;
}

// ─── EmailService ─────────────────────────────────────────────────────────────

export const EmailService = {
  // ── Contas ──────────────────────────────────────────────────────────────────
  getAccounts: (userId: string): Promise<EmailAccount[]> =>
    fetch(`/api/email/accounts?userId=${encodeURIComponent(userId)}`).then(r => r.json()).then(d => d.accounts ?? d),

  deleteAccount: (accountId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/accounts?accountId=${encodeURIComponent(accountId)}`, { method: 'DELETE' }).then(r => r.json()),

  updateAccount: (data: {
    accountId: string;
    isDefault?: boolean;
    displayName?: string;
  }): Promise<EmailAccount> =>
    fetch('/api/email/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

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

  // ── Auth ────────────────────────────────────────────────────────────────────
  getGmailAuthUrl: (userId: string, returnUrl: string): string =>
    `/api/email/auth/gmail/init?userId=${encodeURIComponent(userId)}&returnUrl=${encodeURIComponent(returnUrl)}`,

  getMicrosoftAuthUrl: (userId: string, returnUrl: string): string =>
    `/api/email/auth/microsoft/init?userId=${encodeURIComponent(userId)}&returnUrl=${encodeURIComponent(returnUrl)}`,

  // ── Mensagens ───────────────────────────────────────────────────────────────
  getMessages: (
    accountId: string,
    folder: string,
    page: number,
    limit: number,
  ): Promise<MessageListResponse> =>
    fetch(
      `/api/email/messages?accountId=${encodeURIComponent(accountId)}&folder=${encodeURIComponent(folder)}&page=${page}&limit=${limit}`,
    ).then(r => r.json()),

  getMessage: (id: string, accountId: string): Promise<CachedEmail> =>
    fetch(`/api/email/messages/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`)
      .then(r => { if (!r.ok) throw new Error(`getMessage ${r.status}`); return r.json(); })
      .then(data => { if (!data?.id) throw new Error('empty getMessage response'); return data; }),

  // ── Ações ───────────────────────────────────────────────────────────────────
  doAction: (
    accountId: string,
    messageId: string,
    action: 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'trash' | 'restore' | 'spam' | 'notspam',
  ): Promise<{ success: boolean }> =>
    fetch('/api/email/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, messageId, action }),
    }).then(r => r.json()),

  // ── Envio ───────────────────────────────────────────────────────────────────
  // Anexos vão como base64 no corpo JSON — é o formato que _api/email/send.ts já espera
  // (SendEmailBody.attachments: {filename,mimeType,data}[]). Use fileToAttachmentPayload()
  // para converter File[] do composer antes de chamar isto.
  sendEmail: (data: SendEmailPayload): Promise<{ success: boolean; messageId?: string }> =>
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ── Rascunhos ───────────────────────────────────────────────────────────────
  getDrafts: (accountId: string): Promise<CachedEmail[]> =>
    fetch(`/api/email/drafts?accountId=${encodeURIComponent(accountId)}`).then(r => r.json()),

  saveDraft: (data: DraftPayload): Promise<{ success: boolean; draftId: string }> =>
    fetch('/api/email/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteDraft: (id: string, accountId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/draft/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
    }).then(r => r.json()),

  // ── Sync ────────────────────────────────────────────────────────────────────
  syncAccount: (accountId: string): Promise<{ success: boolean; synced: number }> =>
    fetch(`/api/email/sync?accountId=${encodeURIComponent(accountId)}`, { method: 'POST' }).then(r => r.json()),

  // ── Busca ───────────────────────────────────────────────────────────────────
  search: (accountId: string, q: string, folder?: string): Promise<SearchResponse> =>
    fetch(
      `/api/email/search?accountId=${encodeURIComponent(accountId)}&q=${encodeURIComponent(q)}&folder=${encodeURIComponent(folder || '')}`,
    ).then(r => r.json()),

  // ── Configurações ────────────────────────────────────────────────────────────
  getSettings: (userId: string): Promise<EmailSettings> =>
    fetch(`/api/email/settings?userId=${encodeURIComponent(userId)}`).then(r => r.json()).then(d => d.settings ?? d),

  saveSettings: (data: Partial<EmailSettings>): Promise<{ success: boolean }> =>
    fetch('/api/email/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  // ── Stats ───────────────────────────────────────────────────────────────────
  getStats: (userId: string): Promise<EmailStats> =>
    fetch(`/api/email/stats?userId=${encodeURIComponent(userId)}`).then(r => r.json()).then(d => d.stats ?? d),
};
