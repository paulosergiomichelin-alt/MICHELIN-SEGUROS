import { pgTable, text, integer, bigserial, jsonb, timestamp, date, primaryKey } from 'drizzle-orm/pg-core';

export const systemMetricsDashboard = pgTable('system_metrics_dashboard', {
  id: text('id').primaryKey().default('dashboard'),
  totalLeads: integer('total_leads').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const leadStatusCounts = pgTable('lead_status_counts', {
  status: text('status').primaryKey(),
  count: integer('count').notNull().default(0),
});

export const metricsRaw = pgTable('metrics_raw', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  event: jsonb('event').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const metricsUsers = pgTable('metrics_users', {
  userId: text('user_id').notNull(),
  day: date('day').notNull(),
  data: jsonb('data').notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.day] }),
]);

export const metricsDaily = pgTable('metrics_daily', {
  day: date('day').primaryKey(),
  data: jsonb('data').notNull(),
});
