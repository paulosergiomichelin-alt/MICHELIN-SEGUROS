import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

// `settings` e `config` são duas coleções Firestore reais com ID composto "{orgId}::{id}"
// (DataService.resolveDocId/ORG_SETTINGS_COLLECTIONS) — preservado literalmente como PK
// de texto único (ADR-8), sem split de coluna. Ver SPEC §4.13.
export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  data: jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const config = pgTable('config', {
  id: text('id').primaryKey(),
  data: jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
