import { EvolutionAPI } from '../lib/evolutionApi.js';
import { fsSet, fsUpdate } from '../lib/adminFirebase.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionName, phone, message, type = 'text' } = req.body ?? {};

  if (!sessionName || !phone || !message) {
    return res.status(400).json({ error: 'sessionName, phone e message são obrigatórios' });
  }

  try {
    console.log(`[EVOLUTION/send] Enviando mensagem via ${sessionName} para ${phone}`);

    const result = await EvolutionAPI.sendText(String(sessionName), String(phone), String(message));
    if (!result) {
      return res.status(502).json({ error: 'Falha ao enviar mensagem pela Evolution API' });
    }

    const now = new Date().toISOString();
    const msgId = `wamsg_${Date.now()}`;
    const conversationId = `${sessionName}_${phone}`;

    // Persist outbound message
    await fsSet('whatsapp_messages', msgId, {
      id: msgId,
      conversationId,
      sessionId: String(sessionName),
      direction: 'outbound',
      messageType: type === 'text' ? 'text' : String(type),
      body: String(message),
      timestamp: now,
      status: 'sent',
    });

    // Update conversation last-message info
    await fsUpdate('whatsapp_conversations', conversationId, {
      lastMessage: String(message),
      lastMessageAt: now,
      lastMessageDirection: 'outbound',
      updatedAt: now,
    }).catch((err: any) => {
      // Conversation may not exist yet — non-fatal, will be created on first inbound
      console.warn('[EVOLUTION/send] fsUpdate whatsapp_conversations ignorado:', err?.message);
    });

    console.log(`[EVOLUTION/send] Mensagem enviada: ${msgId} → ${phone}`);
    return res.status(200).json({ success: true, messageId: msgId, evolutionResult: result });
  } catch (err: any) {
    console.error('[EVOLUTION/send] POST error:', err);
    return res.status(500).json({ error: 'Erro ao enviar mensagem', detail: err?.message });
  }
}
