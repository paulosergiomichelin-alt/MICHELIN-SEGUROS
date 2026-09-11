import { pgTable, text, boolean, integer, numeric, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { clientes } from './clientes';

export const leads = pgTable('leads', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  status: text('status').notNull(),
  temperature: text('temperature'),
  score: numeric('score', { mode: 'number' }),
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
  // Nulos em produção pra qualquer lead de seguro não-automotivo (residencial, moto,
  // bicicleta elétrica etc.) — confirmado via migração real: chassis ausente em 100% dos
  // 75 leads reais, plate ausente em 70/75. types.ts declara os dois como `string`
  // obrigatório, mas isso nunca foi verdade na prática; NOT NULL aqui era mais estrito
  // que o dado real e travava a migração da Fase 5.
  plate: text('plate'),
  chassis: text('chassis'),
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
  // Sem .references() de propósito: mensagens de leads apagados (ex.: limpeza de leads de
  // teste) sobrevivem como histórico — confirmado via migração real (54/56 mensagens
  // apontavam pra leads já inexistentes). O Firestore nunca validou essa integridade;
  // exigir FK aqui rejeitaria dado real que sempre existiu.
  leadId: text('lead_id').notNull(),
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

// AppNotification (types.ts) mistura snake_case e camelCase no mesmo tipo (user_id,
// lead_id, created_at, created_by são snake — leadName, organizationId são camel) —
// nomes de propriedade abaixo casam exatamente com o tipo, não com uma convenção única,
// porque é isso que o código que constrói/lê AppNotification já espera.
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  user_id: text('user_id').notNull(),
  // Sem .references(): notificações órfãs de leads apagados sobrevivem como histórico (12/12
  // notificações reais apontavam pra leads inexistentes na migração) — mesmo racional de messages acima.
  lead_id: text('lead_id'),
  leadName: text('lead_name'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(),
  priority: text('priority').notNull(),
  read: boolean('read').notNull().default(false),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_user_read').on(t.user_id, t.read),
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
  activationScore: numeric('activation_score', { mode: 'number' }),
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
