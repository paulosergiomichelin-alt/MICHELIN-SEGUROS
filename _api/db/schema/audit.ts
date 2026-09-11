import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  // timestamp/category/entity/origin relaxados pra nullable — confirmado via migração real
  // que ~1-3% dos 782 logs reais vêm de uma versão mais antiga do logger, sem esses campos
  // (usava resource/resourceId em vez de entity/entityId, e não gravava category/origin/
  // timestamp). userId/action nunca faltam, continuam NOT NULL.
  timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' }),
  userId: text('user_id').notNull(),
  userName: text('user_name'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  deviceType: text('device_type'),
  browser: text('browser'),
  os: text('os'),
  location: text('location'),
  action: text('action').notNull(),
  category: text('category'),
  entity: text('entity'),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  origin: text('origin'),
  details: text('details'),
  status: text('status'),
  result: text('result'),
  context: text('context'),
  metadata: jsonb('metadata'),
}, (t) => [
  index('idx_audit_entity').on(t.entity, t.entityId),
  index('idx_audit_org_time').on(t.organizationId, t.timestamp),
]);

// Schema confirmado contra src/services/LoggerService.ts (interface SystemLog) na Fase 3
// Task 11 — a versão original da spec (level/message/context/created_at) estava incompleta.
export const systemLogs = pgTable('system_logs', {
  id: text('id').primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' }).notNull(),
  level: text('level').notNull(),
  category: text('category').notNull(),
  message: text('message').notNull(),
  userId: text('user_id'),
  userEmail: text('user_email'),
  action: text('action'),
  details: jsonb('details'),
  stackTrace: text('stack_trace'),
  source: text('source'),
});

export const migrationLogs = pgTable('migration_logs', {
  id: text('id').primaryKey(),
  stats: jsonb('stats').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const deadLetterQueue = pgTable('dead_letter_queue', {
  id: text('id').primaryKey(),
  payload: jsonb('payload').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const processingLocks = pgTable('processing_locks', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id').notNull(),
  ownerId: text('owner_id').notNull(),
  instanceId: text('instance_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
