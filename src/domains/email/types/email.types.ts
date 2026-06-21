export type {
  EmailAddress,
  EmailAttachment,
  CachedEmail,
  EmailAccount,
  EmailStats,
  EmailSettings,
  SendEmailPayload,
  DraftPayload,
  MessageListResponse,
  SearchResponse,
} from '../../../services/EmailService';

export type EmailComposerMode = 'new' | 'reply' | 'replyAll' | 'forward';

export type EmailFilter = 'all' | 'unread' | 'attachments';

export interface EmailFolder {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  unreadCount?: number;
}

export interface EmailTag {
  id: string;
  label: string;
  color: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string[];
}

export interface EmailSignature {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  useOnReply: boolean;
}

export interface ScheduledSend {
  sendAt: Date;
  timezone: string;
}

export interface EmailSearchFilters {
  query: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  after?: string;
  before?: string;
  folder?: string;
  isUnread?: boolean;
}
