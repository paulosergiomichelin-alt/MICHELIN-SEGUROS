import * as schema from '../db/schema';

export const ENTITY_TABLE: Record<string, any> = {
  leads: schema.leads, lead: schema.leads,
  users: schema.users, user: schema.users,
  access_profiles: schema.accessProfiles, access_profile: schema.accessProfiles,
  audit_logs: schema.auditLogs, audit_log: schema.auditLogs,
  system_logs: schema.systemLogs, system_log: schema.systemLogs,
  notifications: schema.notifications, notification: schema.notifications,
  messages: schema.messages, message: schema.messages,
  follow_ups: schema.followUps, follow_up: schema.followUps,
  flows: schema.flows, flow: schema.flows,
  learning_memory: schema.learningMemory,
  dead_letter_queue: schema.deadLetterQueue,
  migration_logs: schema.migrationLogs,
  processing_locks: schema.processingLocks,
  empresas: schema.organizations, empresa: schema.organizations,
  clientes: schema.clientes, cliente: schema.clientes,
  cliente_relacionamentos: schema.clienteRelacionamentos, cliente_relacionamento: schema.clienteRelacionamentos,
  seguradoras: schema.seguradoras, seguradora: schema.seguradoras,
  whatsapp_sessions: schema.whatsappSessions, whatsapp_session: schema.whatsappSessions,
  whatsapp_conversations: schema.whatsappConversations, whatsapp_conversation: schema.whatsappConversations,
  whatsapp_messages: schema.whatsappMessages, whatsapp_message: schema.whatsappMessages,
  campaigns: schema.campaigns, campaign: schema.campaigns,
  campaign_log: schema.campaignLog,
  settings: schema.settings,
  config: schema.config,
  platform_agent_templates: schema.platformAgentTemplates,
  platform_guardrails: schema.platformGuardrails,
  tenant_agent_configs: schema.tenantAgentConfigs,
  tenant_onboarding_wizard_state: schema.tenantOnboardingWizardState,
  nfse_documents: schema.nfseDocuments,
  nfse_logs: schema.nfseLogs,
  metrics_raw: schema.metricsRaw,
  metrics_users: schema.metricsUsers,
  metrics_daily: schema.metricsDaily,
  email_accounts: schema.emailAccounts,
  email_settings: schema.emailSettings,
};

// A maioria das tabelas usa `id` como PK — estas duas usam organization_id como PK
// (SPEC §4.11: são chaveadas 1:1 por tenant, sem coleção separada por doc). Sem este mapa,
// o router genérico (que sempre fazia eq(table.id, req.params.id)) quebrava com
// "Cannot read properties of undefined (reading 'keyAsName')" para essas duas entidades —
// descoberto ao testar TemplateService na Fase 3. Estender este mapa ao adicionar entidades
// cuja PK não se chama `id` (ex.: email_settings, PK user_id, na Fase 4).
export const PK_COLUMN: Record<string, string> = {
  tenant_agent_configs: 'organizationId',
  tenant_onboarding_wizard_state: 'organizationId',
  metrics_daily: 'day',
  email_settings: 'userId',
};

export function pkPropertyName(entity: string): string {
  return PK_COLUMN[entity] ?? 'id';
}

export function pkColumn(entity: string, table: any) {
  return table[pkPropertyName(entity)];
}
