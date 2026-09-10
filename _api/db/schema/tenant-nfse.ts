import { pgTable, text, boolean, integer, numeric, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { organizations } from './core';
import { clientes } from './clientes';

export const platformAgentTemplates = pgTable('platform_agent_templates', {
  id: text('id').primaryKey(),
  segment: text('segment').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  publishedBy: text('published_by').notNull(),
  defaultPersona: jsonb('default_persona').notNull(),
  defaultSalesBlocks: jsonb('default_sales_blocks').notNull(),
  defaultHardRules: jsonb('default_hard_rules').notNull(),
  funnelSteps: jsonb('funnel_steps').notNull(),
  leadFields: jsonb('lead_fields').notNull(),
  wizardQuestions: jsonb('wizard_questions').notNull(),
  previewConversation: jsonb('preview_conversation'),
  lockedFields: jsonb('locked_fields').notNull().default([]),
  suggestedInsurers: jsonb('suggested_insurers'),
});

export const platformGuardrails = pgTable('platform_guardrails', {
  id: text('id').primaryKey().default('universal'),
  hardProhibitions: jsonb('hard_prohibitions').notNull(),
  hardRequirements: jsonb('hard_requirements').notNull(),
  maxResponseLength: integer('max_response_length').notNull(),
  maxQuestionsPerMessage: integer('max_questions_per_message').notNull(),
  forbiddenPhrases: jsonb('forbidden_phrases').notNull(),
  version: integer('version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantAgentConfigs = pgTable('tenant_agent_configs', {
  organizationId: text('organization_id').primaryKey().references(() => organizations.id),
  templateId: text('template_id').notNull(),
  templateVersion: integer('template_version').notNull(),
  segment: text('segment').notNull(),
  customPersona: jsonb('custom_persona'),
  customSalesBlocks: jsonb('custom_sales_blocks'),
  customHardRules: jsonb('custom_hard_rules'),
  businessContext: jsonb('business_context').notNull(),
  onboarding: jsonb('onboarding').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').notNull(),
});

export const tenantOnboardingWizardState = pgTable('tenant_onboarding_wizard_state', {
  organizationId: text('organization_id').primaryKey().references(() => organizations.id),
  currentStep: integer('current_step').notNull(),
  completedSteps: jsonb('completed_steps').notNull().default([]),
  segment: text('segment'),
  templateId: text('template_id'),
  persona: jsonb('persona'),
  businessContext: jsonb('business_context'),
  tone: text('tone'),
  completed: boolean('completed').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastSavedStep: integer('last_saved_step').notNull(),
});

export const nfseDocuments = pgTable('nfse_documents', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  numeroNota: text('numero_nota'),
  numeroRps: text('numero_rps'),
  protocolo: text('protocolo'),
  codigoVerificacao: text('codigo_verificacao'),
  clienteId: text('cliente_id').references(() => clientes.id),
  clienteNome: text('cliente_nome').notNull(),
  clienteCpfCnpj: text('cliente_cpf_cnpj').notNull(),
  clienteEmail: text('cliente_email'),
  clienteTelefone: text('cliente_telefone'),
  clienteEndereco: jsonb('cliente_endereco'),
  servicoId: text('servico_id'),
  descricaoServico: text('descricao_servico').notNull(),
  valorServicoCentavos: integer('valor_servico_centavos').notNull(),
  quantidade: integer('quantidade').notNull(),
  descontoCentavos: integer('desconto_centavos'),
  valorIssCentavos: integer('valor_iss_centavos'),
  aliquotaIss: numeric('aliquota_iss').notNull(),
  issRetido: boolean('iss_retido').notNull().default(false),
  naturezaOperacao: text('natureza_operacao'),
  exigibilidadeIss: text('exigibilidade_iss'),
  observacoes: text('observacoes'),
  ambiente: text('ambiente').notNull(),
  provider: text('provider').notNull(),
  status: text('status').notNull(),
  xmlUrl: text('xml_url'),
  pdfUrl: text('pdf_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  emittedAt: timestamp('emitted_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
}, (t) => [
  index('idx_nfse_org').on(t.organizationId),
]);

export const nfseLogs = pgTable('nfse_logs', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  nfseId: text('nfse_id').notNull().references(() => nfseDocuments.id),
  action: text('action').notNull(),
  status: text('status').notNull(),
  message: text('message'),
  providerResponse: text('provider_response'),
  processingTimeMs: integer('processing_time_ms'),
  userId: text('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
