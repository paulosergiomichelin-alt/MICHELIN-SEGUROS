import { fsGet } from '../lib/adminFirebase.js';
import { enqueueMessage, getQueueStatus } from '../lib/messageQueue.js';
import { markSentByUs } from '../lib/sentMessageIds.js';
import { setMessage, updateMessage, updateConversation, getConversation, CachedMessage } from '../lib/conversationCache.js';
import { emitToSession } from '../lib/socketRegistry.js';
import { createLogger, errCtx } from '../lib/logger.js';

const log = createLogger('evolution/send');
const orgIdCache = new Map<string, string>();

async function getOrgId(sessionName: string): Promise<string> {
  if (orgIdCache.has(sessionName)) return orgIdCache.get(sessionName)!;
  try {
    const session = await fsGet('whatsapp_sessions', sessionName);
    const orgId = session?.organizationId ?? 'default';
    orgIdCache.set(sessionName, orgId);
    return orgId;
  } catch (err) {
    log.warn('getOrgId falhou, usando default', { session: sessionName, ...errCtx(err) });
    return 'default';
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json({ queue: getQueueStatus() });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionName, phone, message, type = 'text' } = req.body ?? {};

  if (!sessionName || !phone || !message) {
    return res.status(400).json({ error: 'sessionName, phone e message são obrigatórios' });
  }

  try {
    const now = new Date().toISOString();
    const optimisticId = `wamsg_out_${Date.now()}`;
    const conversationId = `${sessionName}_${phone}`;
    const organizationId = await getOrgId(String(sessionName));

    const messageDoc: CachedMessage = {
      id: optimisticId,
      conversationId,
      sessionId: String(sessionName),
      direction: 'outbound',
      messageType: type === 'text' ? 'text' : String(type),
      body: String(message),
      phone: String(phone),
      contactName: String(phone),
      timestamp: now,
      status: 'sending',
      organizationId,
    };

    // 1. Escrita otimista no cache — usuário vê a mensagem imediatamente
    setMessage(messageDoc);
    emitToSession(String(sessionName), 'wa:message_upsert', messageDoc);

    updateConversation(conversationId, {
      lastMessage: String(message),
      lastMessageAt: now,
      lastMessageDirection: 'outbound',
      updatedAt: now,
    });
    const updatedConv = getConversation(conversationId);
    if (updatedConv) emitToSession(String(sessionName), 'wa:chat_upsert', updatedConv);

    // 2. Retornar imediatamente ao cliente
    res.status(200).json({ success: true, messageId: optimisticId });

    // 3. Entregar via Evolution API em background
    enqueueMessage(String(sessionName), String(phone), String(message))
      .then((result: any) => {
        const evolutionMsgId: string | undefined = result?.key?.id;

        if (evolutionMsgId) {
          markSentByUs(evolutionMsgId, optimisticId);
          updateMessage(optimisticId, { evolutionId: evolutionMsgId, status: 'sent' });
        } else {
          updateMessage(optimisticId, { status: 'sent' });
        }
      })
      .catch((err: any) => {
        log.error('Entrega de mensagem falhou', { session: sessionName, phone, msgId: optimisticId, ...errCtx(err) });
        updateMessage(optimisticId, { status: 'failed' });
      });

  } catch (err: any) {
    log.error('POST /send erro inesperado', { session: req.body?.sessionName, phone: req.body?.phone, ...errCtx(err) });
    return res.status(500).json({ error: 'Erro ao enviar mensagem', detail: err?.message });
  }
}
