import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { users } from '../db/schema';

export async function loadTenantContext(req: any, res: any, next: any) {
  const [profile] = await getDb().select().from(users).where(eq(users.id, req.userId));
  if (!profile) return res.status(403).json({ error: 'Usuário sem perfil cadastrado' });
  req.organizationId = profile.organizationId;
  req.userRole = profile.role;
  req.userPermissions = profile.permissions;
  req.userSuperadmin = profile.superadmin === true;
  next();
}

// Mesma lista de DataService.ts:47-58 (ORG_SCOPED_ENTITIES) — mantida em paridade.
export const ORG_SCOPED_ENTITIES = new Set([
  'leads', 'lead', 'users', 'user', 'messages', 'message',
  'notifications', 'notification', 'flows', 'flow',
  'follow_ups', 'follow_up', 'empresas', 'empresa',
  'clientes', 'cliente',
  'cliente_relacionamentos', 'cliente_relacionamento',
  'cliente_pessoa_juridica', 'lead_pessoa_juridica',
  'nfse_documents', 'nfse_logs',
  'email_accounts', 'email_account',
  'email_rules', 'email_rule',
  'cotacoes', 'cotacao',
  // Ambas têm coluna organization_id mas ficaram de fora desta lista — qualquer
  // usuário autenticado de QUALQUER organização lia/editava/apagava eventos de
  // agenda e dados de aprendizado de IA de outra organização pela rota genérica
  // /api/data/calendar_events e /api/data/learning_memory (achado F-04 da
  // auditoria; calendar_events tem sua própria rota dedicada em
  // _api/calendar/events.ts com verificação de posse, mas isso nunca protegeu
  // o caminho genérico, que continua registrado em ENTITY_TABLE).
  'calendar_events', 'learning_memory',
  // Chaveadas pela própria organizationId (ver PK_COLUMN em entityMap.ts) — sem
  // estarem aqui, GET/PATCH/PUT /api/data/tenant_agent_configs/:id (ou
  // tenant_onboarding_wizard_state) não recebia NENHUM filtro de organização, e
  // :id é justamente o organizationId escolhido livremente pelo cliente: qualquer
  // usuário autenticado lia e sobrescrevia a config do agente de IA / estado do
  // wizard de onboarding de QUALQUER outra empresa só trocando o id na URL
  // (achado F-08 da auditoria).
  'tenant_agent_configs', 'tenant_onboarding_wizard_state',
]);
