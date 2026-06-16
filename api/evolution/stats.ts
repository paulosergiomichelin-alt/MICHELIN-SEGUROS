import { fsQueryFull } from '../lib/adminFirebase.js';
import { getQueueStatus } from '../lib/messageQueue.js';
import { getWebhookStats } from '../webhook/evolution.js';
import { getReconcileStats } from './reconcile.js';
import { getSentCount } from '../lib/sentMessageIds.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionName } = req.query ?? {};

  try {
    const sessionFilter = sessionName
      ? [{ field: 'sessionId', value: String(sessionName) }]
      : [];

    // Conversas
    const conversations = await fsQueryFull(
      'whatsapp_conversations',
      sessionFilter,
      500,
    ).catch(() => [] as any[]);

    // Mensagens nas últimas 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allMessages = await fsQueryFull(
      'whatsapp_messages',
      sessionFilter,
      1000,
    ).catch(() => [] as any[]);

    const msgsToday = allMessages.filter(m => (m.timestamp ?? '') >= since24h);
    const inbound = msgsToday.filter(m => m.direction === 'inbound').length;
    const outbound = msgsToday.filter(m => m.direction === 'outbound').length;
    const failed = allMessages.filter(m => m.status === 'failed').length;

    // Sessões
    const sessions = await fsQueryFull('whatsapp_sessions', [], 50).catch(() => [] as any[]);
    const activeSessions = sessions.filter(s => s.status === 'open');

    return res.status(200).json({
      sessions: {
        total: sessions.length,
        active: activeSessions.length,
        list: activeSessions.map(s => ({
          name: s.id,
          phone: s.phoneNumber,
          profileName: s.profileName,
          connectedAt: s.connectedAt,
          status: s.status,
        })),
      },
      conversations: {
        total: conversations.length,
        withUnread: conversations.filter(c => (c.unreadCount ?? 0) > 0).length,
        withLead: conversations.filter(c => !!c.leadId).length,
      },
      messages: {
        totalToday: msgsToday.length,
        inboundToday: inbound,
        outboundToday: outbound,
        failedTotal: failed,
      },
      queue: getQueueStatus(),
      webhook: getWebhookStats(),
      reconcile: getReconcileStats(),
      dedup: {
        pendingInMemory: getSentCount(),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[EVOLUTION/stats] error:', err);
    return res.status(500).json({ error: 'Erro ao gerar stats', detail: err?.message });
  }
}
