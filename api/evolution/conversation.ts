import { updateConversation } from '../lib/conversationCache.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { conversationId, leadId, clienteId, unreadCount } = req.body ?? {};

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId é obrigatório' });
  }

  const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (leadId !== undefined) patch.leadId = leadId;
  if (clienteId !== undefined) patch.clienteId = clienteId;
  if (unreadCount !== undefined) patch.unreadCount = unreadCount;

  updateConversation(conversationId, patch);
  return res.status(200).json({ success: true });
}
