import { pgTable, text, boolean, integer, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';

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

// Regra de organização automática: quando uma mensagem nova chega na inbox e
// bate no critério (remetente contém X, domínio do remetente, ou assunto contém X),
// o sync periódico (ver emailSync.ts) move a mensagem pra pasta de destino real
// no provedor (Gmail label / pasta do Outlook / pasta IMAP) antes de notificar o usuário.
export const emailRules = pgTable('email_rules', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  accountId: text('account_id').notNull(),
  nome: text('nome').notNull(),
  matchTipo: text('match_tipo').notNull(), // 'dominio' | 'remetente_contem' | 'assunto_contem'
  matchValor: text('match_valor').notNull(),
  pastaDestinoId: text('pasta_destino_id').notNull(),
  pastaDestinoNome: text('pasta_destino_nome').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_email_rules_account').on(t.accountId),
]);

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
