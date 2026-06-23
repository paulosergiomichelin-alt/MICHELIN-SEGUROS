import { EvolutionAPI } from '../lib/evolutionApi.js';
import { emitToSession } from '../lib/socketRegistry.js';
import { setMessage, updateMessage, updateConversation, getConversation, CachedMessage } from '../lib/conversationCache.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionName, phone, base64, mediatype, mimetype, fileName, caption } = req.body ?? {};
  if (!sessionName || !phone || !base64 || !mediatype) {
    return res.status(400).json({ error: 'sessionName, phone, base64 e mediatype são obrigatórios' });
  }

  try {
    const now = new Date().toISOString();
    const optimisticId = `wamsg_out_${Date.now()}`;
    const conversationId = `${sessionName}_${phone}`;

    const messageDoc: CachedMessage = {
      id: optimisticId,
      conversationId,
      sessionId: String(sessionName),
      direction: 'outbound',
      messageType: String(mediatype),
      body: caption || fileName || `[${mediatype}]`,
      phone: String(phone),
      contactName: String(phone),
      timestamp: now,
      status: 'sending',
      organizationId: 'default',
    };
    if (fileName) messageDoc.fileName = fileName;
    if (mimetype) messageDoc.mimeType = mimetype;

    setMessage(messageDoc);
    emitToSession(String(sessionName), 'wa:message_upsert', messageDoc);

    updateConversation(conversationId, {
      lastMessage: caption || fileName || `[${mediatype}]`,
      lastMessageAt: now,
      lastMessageDirection: 'outbound',
      updatedAt: now,
    });
    const updatedConv = getConversation(conversationId);
    if (updatedConv) emitToSession(String(sessionName), 'wa:chat_upsert', updatedConv);

    res.status(200).json({ success: true, messageId: optimisticId });

    EvolutionAPI.sendMediaBase64(
      String(sessionName), String(phone), String(mediatype),
      String(mimetype ?? 'application/octet-stream'), String(base64),
      fileName, caption,
    ).then(() => {
      updateMessage(optimisticId, { status: 'sent' });
      emitToSession(String(sessionName), 'wa:message_update', { id: optimisticId, patch: { status: 'sent' } });
    }).catch((err: any) => {
      console.error(`[EVOLUTION/sendMedia] Falhou para ${phone}:`, err?.message);
      updateMessage(optimisticId, { status: 'failed' });
      emitToSession(String(sessionName), 'wa:message_update', { id: optimisticId, patch: { status: 'failed' } });
    });

  } catch (err: any) {
    console.error('[EVOLUTION/sendMedia] POST error:', err);
    return res.status(500).json({ error: 'Erro ao enviar mídia', detail: err?.message });
  }
}
