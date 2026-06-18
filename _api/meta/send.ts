import { MetaAPI } from '../lib/metaApi.js';
import { fsSet, fsQuery, fsGet, fsUpdate } from '../lib/adminFirebase.js';

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

    // Persist outbound message
    try {
      const phone = to.replace(/\D/g, '');
      const lead = await findOrCreateLead(phone, organizationId, now);
      const msgId = `meta_out_${wamid ?? Date.now()}`;
      const conversationId = `meta_${phone}`;

      await fsSet('messages', msgId, {
        id: msgId,
        leadId: lead.id,
        organizationId,
        sender: 'agent',
        channel: 'whatsapp_meta',
        messageType: type,
        text: message ?? caption ?? `[${type}]`,
        wamid: wamid ?? null,
        status: 'sent',
        timestamp: now,
        conversationId,
        direction: 'outbound',
        createdAt: now,
      });

      await fsUpdate('leads', lead.id, {
        lastMessage: message ?? caption ?? `[${type}]`,
        lastMessageAt: now,
        lastMessageDirection: 'outbound',
        updatedAt: now,
      });
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
