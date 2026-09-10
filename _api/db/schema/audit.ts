import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' }).notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  deviceType: text('device_type'),
  browser: text('browser'),
  os: text('os'),
  location: text('location'),
  action: text('action').notNull(),
  category: text('category').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  origin: text('origin').notNull(),
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
