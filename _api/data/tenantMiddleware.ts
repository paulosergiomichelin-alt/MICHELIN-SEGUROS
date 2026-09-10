import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { users } from '../db/schema';

export async function loadTenantContext(req: any, res: any, next: any) {
  const [profile] = await getDb().select().from(users).where(eq(users.id, req.userId));
  if (!profile) return res.status(403).json({ error: 'Usuário sem perfil cadastrado' });
  req.organizationId = profile.organizationId;
  req.userRole = profile.role;
  req.userPermissions = profile.permissions;
  next();
}

// Mesma lista de DataService.ts:47-58 (ORG_SCOPED_ENTITIES) — mantida em paridade.
export const ORG_SCOPED_ENTITIES = new Set([
  'leads', 'lead', 'users', 'user', 'messages', 'message',
  'notifications', 'notification', 'flows', 'flow',
  'follow_ups', 'follow_up', 'empresas', 'empresa',
  'clientes', 'cliente',
  'whatsapp_sessions', 'whatsapp_session',
  'whatsapp_conversations', 'whatsapp_conversation',
  'whatsapp_messages', 'whatsapp_message',
  'cliente_relacionamentos', 'cliente_relacionamento',
  'nfse_documents', 'nfse_logs',
]);
