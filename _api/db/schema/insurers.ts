import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { leads } from './leads';

export const cotacoes = pgTable('cotacoes', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id),
  // onDelete cascade desde o início — esta mesma sessão encontrou dois bugs em produção
  // (lead_pessoa_juridica, campaign_log) causados por FK pra leads.id sem essa configuração.
  leadId: text('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  numeroCalculo: text('numero_calculo'),
  status: text('status').notNull(), // 'ok' | 'erro'
  resultado: jsonb('resultado'),
  erro: text('erro'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  index('idx_cotacoes_lead').on(t.leadId),
]);
