import { pgTable, text, integer, jsonb, timestamp, date } from 'drizzle-orm/pg-core';

export const systemMetricsDashboard = pgTable('system_metrics_dashboard', {
  id: text('id').primaryKey().default('dashboard'),
  totalLeads: integer('total_leads').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const leadStatusCounts = pgTable('lead_status_counts', {
  status: text('status').primaryKey(),
  count: integer('count').notNull().default(0),
});

// `id` text (não bigserial) — DataService.create() SEMPRE injeta um id gerado no
// cliente (nanoid) antes de chamar a API, para toda entidade; um PK bigserial exigiria
// tratamento especial que não existe hoje em DataService.normalizePayload.
export const metricsRaw = pgTable('metrics_raw', {
  id: text('id').primaryKey(),
  event: jsonb('event').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// PK única `id` (formato "{uid}_{day}", igual ao doc ID original do Firestore) em vez de
// PK composta (user_id, day) — o router genérico assume PK de coluna única em toda parte
// (GET/PATCH/PUT/DELETE por :id); uma composta exigiria uma rota dedicada só para isso.
export const metricsUsers = pgTable('metrics_users', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  day: date('day').notNull(),
  data: jsonb('data').notNull(),
});

export const metricsDaily = pgTable('metrics_daily', {
  day: date('day').primaryKey(),
  data: jsonb('data').notNull(),
});
