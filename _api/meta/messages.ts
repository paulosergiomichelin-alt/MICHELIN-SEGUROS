import { fsQuery } from '../lib/adminFirebase.js';
import { getMessages, getConversation } from '../lib/conversationCache.js';
import { META_SESSION_ID } from '../webhook/whatsapp.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.query ?? {};
  if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });

  const phoneStr = String(phone).replace(/\D/g, '');
  const conversationId = `${META_SESSION_ID}_${phoneStr}`;

  // 1. Cache em memória (mensagens da sessão atual do servidor)
  const cached = getMessages(conversationId);

  // 2. Firestore (histórico completo)
  let firestoreMsgs: any[] = [];
  try {
    firestoreMsgs = await fsQuery('messages', [{ field: 'conversationId', value: conversationId }]);
  } catch (err) {
    console.error('[META/messages] Erro ao buscar Firestore:', err);
  }

  // Merge: cache + Firestore, dedup por id
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const m of [...firestoreMsgs, ...cached]) {
    const id = m.id ?? m.wamid;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push({
      id: m.id,
      conversationId,
      sessionId: META_SESSION_ID,
      direction: m.direction ?? (m.sender === 'lead' ? 'inbound' : 'outbound'),
      messageType: m.messageType ?? 'text',
      body: m.text ?? m.body ?? '',
      phone: phoneStr,
      contactName: m.contactName ?? `+${phoneStr}`,
      timestamp: m.timestamp ?? m.createdAt,
      status: m.status ?? 'received',
      organizationId: m.organizationId ?? 'default',
      ...(m.mediaUrl ? { mediaUrl: m.mediaUrl } : {}),
      ...(m.mimeType ? { mimeType: m.mimeType } : {}),
      ...(m.fileName ? { fileName: m.fileName } : {}),
    });
  }

  // Sort ascending by timestamp
  merged.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    success: true,
    imported: merged.length,
    contactName: getConversation(conversationId)?.contactName ?? `+${phoneStr}`,
    messages: merged,
  });
}
