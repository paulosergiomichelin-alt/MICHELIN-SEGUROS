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

export interface EmailFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  unreadCount: number;
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
  calendarScopeGranted?: boolean;
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
//
// Toda rota /api/email/* (exceto os redirects OAuth abaixo) exige o Firebase ID
// token do usuário logado — sem isso o backend responde 401 (ver requireAuthForEmail
// em server.ts). Os métodos de leitura/atualização, além disso, não confiam mais no
// userId passado pelo chamador: o backend deriva o usuário do próprio token.

import { authHeader } from '../lib/dataApiClient';

export const EmailService = {
  // ── Contas ──────────────────────────────────────────────────────────────────
  getAccounts: async (): Promise<EmailAccount[]> =>
    fetch('/api/email/accounts', { headers: await authHeader() })
      .then(r => r.json()).then(d => d.accounts ?? d),

  deleteAccount: async (accountId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/accounts?accountId=${encodeURIComponent(accountId)}`, {
      method: 'DELETE', headers: await authHeader(),
    }).then(r => r.json()),

  updateAccount: async (data: {
    accountId: string;
    isDefault?: boolean;
    displayName?: string;
  }): Promise<EmailAccount> =>
    fetch('/api/email/accounts', {
      method: 'PATCH', headers: await authHeader(), body: JSON.stringify(data),
    }).then(r => r.json()),

  createImapAccount: async (data: {
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
      method: 'POST', headers: await authHeader(), body: JSON.stringify(data),
    }).then(async r => {
      const json = await r.json();
      if (!r.ok) return { success: false, error: json.error ?? 'Falha ao conectar' };
      return { success: true, accountId: json.accountId };
    }),

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Redirects de browser puro (o usuário navega pra cá, não um fetch) — o backend
  // identifica o usuário pelo userId embutido no `state` do OAuth, não por um token.
  getGmailAuthUrl: (userId: string, returnUrl: string): string =>
    `/api/email/auth/gmail/init?userId=${encodeURIComponent(userId)}&returnUrl=${encodeURIComponent(returnUrl)}`,

  getMicrosoftAuthUrl: (userId: string, returnUrl: string): string =>
    `/api/email/auth/microsoft/init?userId=${encodeURIComponent(userId)}&returnUrl=${encodeURIComponent(returnUrl)}`,

  // ── Pastas reais ────────────────────────────────────────────────────────────
  getFolders: async (accountId: string): Promise<EmailFolderNode[]> =>
    fetch(`/api/email/folders?accountId=${encodeURIComponent(accountId)}`, { headers: await authHeader() })
      .then(r => r.json())
      .then(data => data?.folders ?? []),

  createFolder: async (accountId: string, name: string, parentId: string | null): Promise<{ folder: { id: string; name: string } }> =>
    fetch('/api/email/folders', {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ accountId, name, parentId }),
    }).then(r => r.json()),

  // Relocaliza uma pasta customizada já existente pra debaixo de outra (ex.: pasta de
  // seguradora criada solta na raiz antes do padrão virar "sempre subpasta da Inbox").
  // Só suportado no Outlook — ver moveFolderForAccount em _api/email/folders.ts.
  moveFolder: async (accountId: string, folderId: string, destinationId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}/move-folder`, {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ accountId, destinationId }),
    }).then(r => r.json()),

  renameFolder: async (accountId: string, folderId: string, name: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}`, {
      method: 'PATCH', headers: await authHeader(), body: JSON.stringify({ accountId, name }),
    }).then(r => r.json()),

  deleteFolder: async (accountId: string, folderId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}?accountId=${encodeURIComponent(accountId)}`, {
      method: 'DELETE', headers: await authHeader(),
    }).then(r => r.json()),

  emptyFolder: async (accountId: string, folderId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}/empty`, {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ accountId }),
    }).then(r => r.json()),

  markFolderRead: async (accountId: string, folderId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/folders/${encodeURIComponent(folderId)}/read-all`, {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ accountId }),
    }).then(r => r.json()),

  // ── Mensagens ───────────────────────────────────────────────────────────────
  getMessages: async (
    accountId: string,
    folder: string,
    page: number,
    limit: number,
  ): Promise<MessageListResponse> =>
    fetch(
      `/api/email/messages?accountId=${encodeURIComponent(accountId)}&folder=${encodeURIComponent(folder)}&page=${page}&limit=${limit}`,
      { headers: await authHeader() },
    ).then(r => r.json()),

  getMessage: async (id: string, accountId: string): Promise<CachedEmail> =>
    fetch(`/api/email/messages/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`, {
      headers: await authHeader(),
    })
      .then(r => { if (!r.ok) throw new Error(`getMessage ${r.status}`); return r.json(); })
      .then(data => {
        const message = data?.message;
        if (!message?.id) throw new Error('empty getMessage response');
        return message;
      }),

  // ── Ações ───────────────────────────────────────────────────────────────────
  doAction: async (
    accountId: string,
    messageId: string,
    action: 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'trash' | 'restore' | 'spam' | 'notspam',
  ): Promise<{ success: boolean }> =>
    fetch('/api/email/action', {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ accountId, messageId, action }),
    }).then(r => r.json()),

  moveMessage: async (
    accountId: string,
    messageId: string,
    sourceFolderId: string,
    targetFolderId: string,
  ): Promise<{ success: boolean }> =>
    fetch('/api/email/action', {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ accountId, messageId, action: 'move', sourceFolderId, targetFolderId }),
    }).then(r => r.json()),

  // ── Envio ───────────────────────────────────────────────────────────────────
  // Anexos vão como base64 no corpo JSON — é o formato que _api/email/send.ts já espera
  // (SendEmailBody.attachments: {filename,mimeType,data}[]). Use fileToAttachmentPayload()
  // para converter File[] do composer antes de chamar isto.
  sendEmail: async (data: SendEmailPayload): Promise<{ success: boolean; messageId?: string }> =>
    fetch('/api/email/send', {
      method: 'POST', headers: await authHeader(), body: JSON.stringify(data),
    }).then(r => r.json()),

  // ── Rascunhos ───────────────────────────────────────────────────────────────
  getDrafts: async (accountId: string): Promise<CachedEmail[]> =>
    fetch(`/api/email/drafts?accountId=${encodeURIComponent(accountId)}`, { headers: await authHeader() }).then(r => r.json()),

  saveDraft: async (data: DraftPayload): Promise<{ success: boolean; draftId: string }> =>
    fetch('/api/email/draft', {
      method: 'POST', headers: await authHeader(), body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteDraft: async (id: string, accountId: string): Promise<{ success: boolean }> =>
    fetch(`/api/email/draft/${encodeURIComponent(id)}?accountId=${encodeURIComponent(accountId)}`, {
      method: 'DELETE', headers: await authHeader(),
    }).then(r => r.json()),

  // ── Sync ────────────────────────────────────────────────────────────────────
  syncAccount: async (accountId: string): Promise<{ success: boolean; synced: number }> =>
    fetch(`/api/email/sync?accountId=${encodeURIComponent(accountId)}`, {
      method: 'POST', headers: await authHeader(),
    }).then(r => r.json()),

  // Roda as regras de organização em todos os e-mails já na inbox (não só nos
  // novos do próximo sync) — ver _api/email/rules-run.ts.
  runRulesNow: async (accountId: string): Promise<{ success: boolean; checked: number; moved: number; errors: string[] }> =>
    fetch('/api/email/rules/run', {
      method: 'POST', headers: await authHeader(), body: JSON.stringify({ accountId }),
    }).then(r => r.json()),

  // ── Busca ───────────────────────────────────────────────────────────────────
  search: async (accountId: string, q: string, folder?: string): Promise<SearchResponse> =>
    fetch(
      `/api/email/search?accountId=${encodeURIComponent(accountId)}&q=${encodeURIComponent(q)}&folder=${encodeURIComponent(folder || '')}`,
      { headers: await authHeader() },
    ).then(r => r.json()),

  // ── Configurações ────────────────────────────────────────────────────────────
  getSettings: async (): Promise<EmailSettings> =>
    fetch('/api/email/settings', { headers: await authHeader() }).then(r => r.json()).then(d => d.settings ?? d),

  saveSettings: async (data: Partial<EmailSettings>): Promise<{ success: boolean }> =>
    fetch('/api/email/settings', {
      method: 'PUT', headers: await authHeader(), body: JSON.stringify(data),
    }).then(r => r.json()),

  // ── Stats ───────────────────────────────────────────────────────────────────
  getStats: async (): Promise<EmailStats> =>
    fetch('/api/email/stats', { headers: await authHeader() }).then(r => r.json()).then(d => d.stats ?? d),
};
