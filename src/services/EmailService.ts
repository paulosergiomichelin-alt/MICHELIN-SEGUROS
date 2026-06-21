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
  provider: 'gmail' | 'microsoft';
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
  provider: 'gmail' | 'microsoft';
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

export interface SendEmailPayload {
  accountId: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: File[];
  replyToMessageId?: string;
  threadId?: string;
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
  sendEmail: (data: Omit<SendEmailPayload, 'attachments'> & { attachments?: string[] }): Promise<{ success: boolean; messageId?: string }> =>
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  sendEmailWithFiles: async (data: SendEmailPayload): Promise<{ success: boolean; messageId?: string }> => {
    const formData = new FormData();
    const { attachments, ...rest } = data;
    formData.append('data', JSON.stringify(rest));
    if (attachments) {
      attachments.forEach(file => formData.append('attachments', file));
    }
    return fetch('/api/email/send', { method: 'POST', body: formData }).then(r => r.json());
  },

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
