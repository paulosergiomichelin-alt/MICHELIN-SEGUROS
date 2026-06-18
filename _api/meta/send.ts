import { MetaAPI } from '../lib/metaApi.js';
import { fsSet, fsQuery, fsUpdate } from '../lib/adminFirebase.js';
import {
  setConversation, setMessage, getConversation,
  CachedConversation, CachedMessage,
} from '../lib/conversationCache.js';
import { emitToSession } from '../lib/socketRegistry.js';
import { META_SESSION_ID } from '../webhook/whatsapp.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, type = 'text', message, imageUrl, documentUrl, filename, audioUrl, templateName, languageCode, components, caption } = req.body ?? {};

  if (!to) return res.status(400).json({ error: 'Campo "to" obrigatório' });

  const organizationId = process.env.META_ORG_ID ?? 'default';
  const now = new Date().toISOString();
  let result: any;

  try {
    switch (type) {
      case 'text':
        if (!message) return res.status(400).json({ error: 'Campo "message" obrigatório para texto' });
        result = await MetaAPI.sendText(to, message);
        break;
      case 'image':
        if (!imageUrl) return res.status(400).json({ error: 'Campo "imageUrl" obrigatório' });
        result = await MetaAPI.sendImage(to, imageUrl, caption);
        break;
      case 'document':
        if (!documentUrl) return res.status(400).json({ error: 'Campo "documentUrl" obrigatório' });
        result = await MetaAPI.sendDocument(to, documentUrl, filename ?? 'documento', caption);
        break;
      case 'audio':
        if (!audioUrl) return res.status(400).json({ error: 'Campo "audioUrl" obrigatório' });
        result = await MetaAPI.sendAudio(to, audioUrl);
        break;
      case 'template':
        if (!templateName) return res.status(400).json({ error: 'Campo "templateName" obrigatório' });
        result = await MetaAPI.sendTemplate(to, templateName, languageCode ?? 'pt_BR', components);
        break;
      default:
        return res.status(400).json({ error: `Tipo '${type}' não suportado` });
    }

    const wamid = result?.messages?.[0]?.id;
    const phone = to.replace(/\D/g, '');
    const conversationId = `${META_SESSION_ID}_${phone}`;
    const msgId = `meta_out_${wamid ?? Date.now()}`;
    const bodyText = message ?? caption ?? `[${type}]`;

    // Persist to Firestore
    try {
      const lead = await findOrCreateLead(phone, organizationId, now);

      await fsSet('messages', msgId, {
        id: msgId,
        leadId: lead.id,
        organizationId,
        sender: 'agent',
        channel: 'whatsapp_meta',
        messageType: type,
        text: bodyText,
        wamid: wamid ?? null,
        status: 'sent',
        timestamp: now,
        conversationId,
        direction: 'outbound',
        createdAt: now,
      });

      await fsUpdate('leads', lead.id, {
        lastMessage: bodyText,
        lastMessageAt: now,
        lastMessageDirection: 'outbound',
        updatedAt: now,
      });

      // ── Atualiza cache → painel WhatsApp ────────────────────────────────
      const existingConv = getConversation(conversationId);
      const cachedConv: CachedConversation = {
        id: conversationId,
        sessionId: META_SESSION_ID,
        sessionName: META_SESSION_ID,
        phone,
        contactName: existingConv?.contactName ?? `+${phone}`,
        contactPicture: existingConv?.contactPicture,
        lastMessage: bodyText,
        lastMessageAt: now,
        lastMessageDirection: 'outbound',
        updatedAt: now,
        unreadCount: existingConv?.unreadCount ?? 0,
        organizationId,
        leadId: lead.id,
      };
      setConversation(cachedConv);

      const cachedMsg: CachedMessage = {
        id: msgId,
        conversationId,
        sessionId: META_SESSION_ID,
        direction: 'outbound',
        messageType: type,
        body: bodyText,
        phone,
        contactName: cachedConv.contactName,
        timestamp: now,
        status: 'sent',
        organizationId,
      };
      setMessage(cachedMsg);

      emitToSession(META_SESSION_ID, 'wa:chat_upsert', cachedConv);
      emitToSession(META_SESSION_ID, 'wa:message_upsert', cachedMsg);
    } catch (dbErr) {
      console.error('[META/send] Erro ao persistir mensagem:', dbErr);
    }

    return res.status(200).json({ success: true, wamid, raw: result });
  } catch (err: any) {
    console.error('[META/send] Erro ao enviar:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function findOrCreateLead(phone: string, organizationId: string, now: string) {
  const existing = await fsQuery('leads', [
    { field: 'phone', value: phone },
    { field: 'organizationId', value: organizationId },
  ]);
  if (existing.length > 0) return existing[0];

  const id = `wa_${phone}_${Date.now()}`;
  await fsSet('leads', id, {
    id, phone, name: `WhatsApp ${phone}`, status: 'Novo Lead',
    organizationId, iaActive: false, source: 'whatsapp_meta',
    createdAt: now, updatedAt: now, ownerId: 'system',
  });
  return { id, organizationId };
}
