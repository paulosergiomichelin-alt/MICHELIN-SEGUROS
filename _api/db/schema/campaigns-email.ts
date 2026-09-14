import { pgTable, text, boolean, integer, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { leads } from './leads';

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  objective: text('objective'),
  instructions: text('instructions'),
  messageTemplate: text('message_template'),
  sessionName: text('session_name'),
  imageUrl: text('image_url'),
  imageOrder: text('image_order'),
  targetLeads: jsonb('target_leads'),
  status: text('status').notNull(),
  totalLeads: integer('total_leads').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  respondedCount: integer('responded_count').notNull().default(0),
  limit: integer('limit'),
  interval: integer('interval'),
  filters: jsonb('filters'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const campaignLog = pgTable('campaign_log', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  leadId: text('lead_id').notNull().references(() => leads.id),
  leadName: text('lead_name').notNull(),
  status: text('status').notNull(),
  message: text('message'),
  error: text('error'),
  timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' }).notNull(),
}, (t) => [
  index('idx_campaignlog_campaign').on(t.campaignId),
]);

export const emailAccounts = pgTable('email_accounts', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  isDefault: boolean('is_default').notNull().default(false),
  status: text('status').notNull(),
  lastSync: timestamp('last_sync', { withTimezone: true, mode: 'string' }),
  syncError: text('sync_error'),
  // accessToken/refreshToken/tokenExpiry são campos de nível superior (confirmado contra
  // gmailClient.ts/microsoftClient.ts/email/auth/gmail.ts) — NÃO um blob oauthTokens
  // aninhado como a spec original assumia (cópia indevida do padrão de outra entidade).
  accessToken: text('access_token'),        // era .notNull() — agora nullable (IMAP não usa OAuth)
  refreshToken: text('refresh_token'),      // era .notNull() — agora nullable
  tokenExpiry: bigint('token_expiry', { mode: 'number' }),
  picture: text('picture'),
  // Novas colunas — só preenchidas quando provider === 'imap':
  imapHost: text('imap_host'),
  imapPort: integer('imap_port'),
  imapSecure: boolean('imap_secure').notNull().default(true),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpSecure: boolean('smtp_secure').notNull().default(true),
  username: text('username'),
  passwordEncrypted: text('password_encrypted'),
  // Diz se essa conta já reautorizou com o escopo de calendário (ADR-18) — evita ter
  // que fazer uma chamada de teste na API do provedor só pra descobrir isso.
  calendarScopeGranted: boolean('calendar_scope_granted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const emailSettings = pgTable('email_settings', {
  userId: text('user_id').primaryKey(),
  signature: text('signature'),
  displayName: text('display_name'),
  defaultAccountId: text('default_account_id'),
  autoReply: jsonb('auto_reply'),
  notifications: jsonb('notifications').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const calendarEvents = pgTable('calendar_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').references(() => organizations.id),
  accountId: text('account_id').references(() => emailAccounts.id), // null quando provider='internal'
  provider: text('provider').notNull(), // 'google' | 'microsoft' | 'internal'
  providerEventId: text('provider_event_id'), // null quando provider='internal'
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startAt: timestamp('start_at', { withTimezone: true, mode: 'string' }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true, mode: 'string' }).notNull(),
  allDay: boolean('all_day').notNull().default(false),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  organizerEmail: text('organizer_email'),
  attendees: jsonb('attendees'), // [{ email, name, responseStatus }]
  reminderMinutesBefore: integer('reminder_minutes_before').default(15),
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'cancelled' | 'tentative'

  // Recorrência (schema pronto pra Fase 8b — nenhuma lógica usa isso ainda nesta fase)
  recurrenceRule: text('recurrence_rule'),
  excludedDates: jsonb('excluded_dates'),
  masterEventId: text('master_event_id'),
  originalStartAt: timestamp('original_start_at', { withTimezone: true, mode: 'string' }),

  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_calendar_events_user').on(t.userId, t.startAt),
  index('idx_calendar_events_master').on(t.masterEventId),
]);
