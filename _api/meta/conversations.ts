import { fsQueryFull } from '../lib/adminFirebase.js';
import { getConversations, setConversation } from '../lib/conversationCache.js';
import { META_SESSION_ID } from '../webhook/whatsapp.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 1. In-memory cache — warm after any message arrives in current session
  const cached = getConversations(META_SESSION_ID);
  const convMap = new Map<string, Record<string, any>>();
  for (const c of cached) convMap.set(c.id, { ...c });

  // 2. Firestore — recovers conversations after server restart
  try {
    const msgs = await fsQueryFull('messages', [{ field: 'channel', value: 'whatsapp_meta' }], 500);

    for (const m of msgs) {
      const convId: string = m.conversationId;
      if (!convId) continue;

      const phone = String(convId).replace(/^meta_/, '');
      const existing = convMap.get(convId);
      const msgTs: string = m.timestamp ?? m.createdAt ?? '';

      if (!existing) {
        convMap.set(convId, {
          id: convId,
          sessionId: META_SESSION_ID,
          sessionName: META_SESSION_ID,
          phone,
          contactName: m.contactName ?? `+${phone}`,
          lastMessage: m.text ?? '',
          lastMessageAt: msgTs,
          lastMessageDirection: m.direction ?? 'inbound',
          unreadCount: 0,
          organizationId: m.organizationId ?? 'default',
          leadId: m.leadId,
        });
      } else if (msgTs > (existing.lastMessageAt ?? '')) {
        convMap.set(convId, {
          ...existing,
          lastMessage: m.text ?? existing.lastMessage,
          lastMessageAt: msgTs,
          lastMessageDirection: m.direction ?? existing.lastMessageDirection,
          leadId: m.leadId ?? existing.leadId,
        });
      }
    }

    // Warm up in-memory cache so subsequent requests skip Firestore
    const cachedIds = new Set(cached.map(c => c.id));
    for (const [id, conv] of convMap.entries()) {
      if (!cachedIds.has(id)) setConversation(conv as any);
    }
  } catch (err) {
    console.error('[META/conversations] Erro Firestore:', err);
  }

  const result = Array.from(convMap.values())
    .sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}
