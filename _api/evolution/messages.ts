import { importConversationMessages } from '../lib/syncService.js';
import { updateConversation, getMessages, getConversation } from '../lib/conversationCache.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session, phone } = req.query ?? {};
  if (!session || !phone) {
    return res.status(400).json({ error: 'session e phone são obrigatórios' });
  }

  const sessionName = String(session);
  const phoneStr = String(phone);
  const conversationId = `${sessionName}_${phoneStr}`;

  try {
    const convCached = getConversation(conversationId);
    const { imported, contactName } = await importConversationMessages(sessionName, phoneStr, 'default', 50, convCached?.isGroup);

    if (contactName !== phoneStr) {
      updateConversation(conversationId, { contactName, updatedAt: new Date().toISOString() });
    }

    const messages = getMessages(conversationId);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, imported, contactName, messages });
  } catch (err: any) {
    console.error('[EVOLUTION/messages] error:', err);
    return res.status(500).json({ error: 'Erro ao buscar mensagens', detail: err?.message });
  }
}
