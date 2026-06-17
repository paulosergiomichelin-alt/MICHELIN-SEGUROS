import { fsQueryFull } from '../lib/adminFirebase.js';
import {
  getAccountFolderCounts, getUnreadCount, cacheStats,
} from '../lib/emailCache.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query ?? {};
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

    // Load all accounts for user
    const accounts = await fsQueryFull('email_accounts', [
      { field: 'userId', value: String(userId) },
    ]);

    // Aggregate from cache across all accounts
    const totals = {
      inbox: 0,
      unread: 0,
      sent: 0,
      drafts: 0,
      archived: 0,
      spam: 0,
      trash: 0,
    };

    for (const account of accounts) {
      if (!account.id) continue;
      if (account.status === 'error' || account.status === 'disconnected') continue;

      const counts = getAccountFolderCounts(account.id);
      totals.inbox += counts['inbox'] ?? 0;
      totals.sent += counts['sent'] ?? 0;
      totals.drafts += counts['drafts'] ?? 0;
      totals.archived += counts['archive'] ?? 0;
      totals.spam += counts['spam'] ?? 0;
      totals.trash += counts['trash'] ?? 0;
      totals.unread += getUnreadCount(account.id, 'inbox');
    }

    return res.status(200).json({
      stats: totals,
      accounts: accounts.length,
      cacheStats: cacheStats(),
    });
  } catch (err: any) {
    console.error('[email/stats] error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err?.message });
  }
}
