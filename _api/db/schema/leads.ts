import { pgTable, text, boolean, integer, numeric, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { clientes } from './clientes';

export const leads = pgTable('leads', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  status: text('status').notNull(),
  temperature: text('temperature'),
  score: numeric('score'),
  vendedorId: text('vendedor_id'),
  ownerId: text('owner_id'),
  responsibleAgentId: text('responsible_agent_id'),
  responsibleAgentType: text('responsible_agent_type'),
  clienteId: text('cliente_id').references(() => clientes.id),
  origin: text('origin').notNull(),
  isTest: boolean('is_test').notNull().default(false),
  iaActive: boolean('ia_active'),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  cpf: text('cpf').notNull(),
  plate: text('plate').notNull(),
  chassis: text('chassis').notNull(),
  insurer: text('insurer'),
  insuranceType: text('insurance_type'),
  closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
  lastInteraction: timestamp('last_interaction', { withTimezone: true, mode: 'string' }),
  nextReturnAt: timestamp('next_return_at', { withTimezone: true, mode: 'string' }),
  stuckSince: timestamp('stuck_since', { withTimezone: true, mode: 'string' }),
  version: integer('version').notNull().default(1),
  data: jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_leads_org_status').on(t.organizationId, t.status),
  index('idx_leads_org_vendedor').on(t.organizationId, t.vendedorId),
  index('idx_leads_cliente').on(t.clienteId),
]);

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  leadId: text('lead_id').notNull().references(() => leads.id),
  sender: text('sender').notNull(),
  text: text('text').notNull(),
  attachments: jsonb('attachments'),
  isTest: boolean('is_test').notNull().default(false),
  aiProcessed: boolean('ai_processed'),
  aiProcessingStartedAt: timestamp('ai_processing_started_at', { withTimezone: true, mode: 'string' }),
  timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_messages_lead').on(t.leadId, t.timestamp),
]);

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  userId: text('user_id').notNull(),
  leadId: text('lead_id').references(() => leads.id),
  leadName: text('lead_name'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(),
  priority: text('priority').notNull(),
  read: boolean('read').notNull().default(false),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_user_read').on(t.userId, t.read),
]);

export const followUps = pgTable('follow_ups', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  leadId: text('lead_id').notNull().references(() => leads.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'string' }).notNull(),
  status: text('status').notNull(),
  origin: text('origin').notNull(),
  contextSummary: text('context_summary'),
  executedAt: timestamp('executed_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_followups_scheduled').on(t.status, t.scheduledAt),
]);

export const flows = pgTable('flows', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  priority: integer('priority').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  layer: text('layer'),
  activationScore: numeric('activation_score'),
  compressedDescription: text('compressed_description'),
  applicableStatus: jsonb('applicable_status'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const learningMemory = pgTable('learning_memory', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  status: text('status').notNull(),
  temperature: text('temperature'),
  profile: text('profile'),
  objectionType: text('objection_type'),
  argumentUsed: text('argument_used'),
  step: text('step'),
  outcome: text('outcome').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' }).notNull(),
});
