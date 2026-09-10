import { pgTable, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { leads } from './leads';
import { clientes } from './clientes';

export const whatsappSessions = pgTable('whatsapp_sessions', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  userId: text('user_id').notNull(),
  sessionName: text('session_name').notNull(),
  phoneNumber: text('phone_number'),
  profileName: text('profile_name'),
  profilePicture: text('profile_picture'),
  status: text('status').notNull(),
  qrBase64: text('qr_base64'),
  qrCode: text('qr_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Novas tabelas reais (ADR-9) — hoje só em memória em conversationCache.ts. Sem dado
// existente no Firestore para migrar (ver SPEC §4.8).
export const whatsappConversations = pgTable('whatsapp_conversations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  sessionId: text('session_id').notNull().references(() => whatsappSessions.id),
  sessionName: text('session_name').notNull(),
  phone: text('phone').notNull(),
  contactName: text('contact_name'),
  contactPicture: text('contact_picture'),
  isGroup: boolean('is_group').notNull().default(false),
  leadId: text('lead_id').references(() => leads.id),
  clienteId: text('cliente_id').references(() => clientes.id),
  lastMessage: text('last_message'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  lastMessageDirection: text('last_message_direction'),
  unreadCount: integer('unread_count').notNull().default(0),
  presence: text('presence'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_wa_conv_session').on(t.sessionId, t.updatedAt),
]);

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  conversationId: text('conversation_id').notNull().references(() => whatsappConversations.id),
  sessionId: text('session_id').notNull(),
  direction: text('direction').notNull(),
  messageType: text('message_type').notNull(),
  body: text('body'),
  phone: text('phone'),
  contactName: text('contact_name'),
  mediaUrl: text('media_url'),
  mediaPath: text('media_path'),
  mimeType: text('mime_type'),
  fileName: text('file_name'),
  transcription: text('transcription'),
  status: text('status'),
  evolutionId: text('evolution_id'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
}, (t) => [
  index('idx_wa_msg_conv').on(t.conversationId, t.timestamp),
]);
