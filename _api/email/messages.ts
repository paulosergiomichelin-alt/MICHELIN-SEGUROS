import { fsGet } from '../lib/adminFirebase.js';
import {
  getEmailsByFolder, getEmail, setEmail, updateEmail, getSyncState,
} from '../lib/emailCache.js';
import { syncAccount } from '../lib/emailSync.js';
import {
  getMessage as gmailGetMessage,
  parseGmailMessage,
  modifyMessage as gmailModifyMessage,
  GmailAccount,
} from '../lib/gmailClient.js';
import {
  getMessage as msGetMessage,
  parseMicrosoftMessage,
  updateMessage as msUpdateMessage,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadAccount(accountId: string): Promise<Record<string, any>> {
  const account = await fsGet('email_accounts', accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  return account;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url: string = req.url ?? '';
    const query = req.query ?? {};

    // ── GET /api/email/messages/:id ─────────────────────────────────────────
    // Detect if there is an ID in path params or query
    const pathParts = url.split('?')[0].split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    const messageId = query.id ?? (lastPart !== 'messages' ? lastPart : undefined);

    if (messageId && messageId !== 'messages') {
      const { accountId } = query;
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const account = await loadAccount(String(accountId));
      const cached = getEmail(String(accountId), String(messageId));

      // Return from cache if body already loaded
      if (cached?.bodyHtml !== undefined || cached?.bodyText !== undefined) {
        // Mark as read if not already
        if (!cached.isRead) {
          if (account.provider === 'gmail') {
            await gmailModifyMessage(account as GmailAccount, String(messageId), [], ['UNREAD'])
              .catch(() => {});
          } else {
            await msUpdateMessage(account as MicrosoftAccount, String(messageId), { isRead: true })
              .catch(() => {});
          }
          updateEmail(String(accountId), String(messageId), { isRead: true });
        }
        return res.status(200).json({ message: { ...cached, isRead: true } });
      }

      // Fetch full message
      let fullEmail;
      if (account.provider === 'gmail') {
        const full = await gmailGetMessage(account as GmailAccount, String(messageId), 'full');
        fullEmail = parseGmailMessage(full, String(accountId));

        // Mark as read
        await gmailModifyMessage(account as GmailAccount, String(messageId), [], ['UNREAD'])
          .catch(() => {});
        fullEmail.isRead = true;
      } else {
        const full = await msGetMessage(account as MicrosoftAccount, String(messageId));
        const folder = cached?.folder ?? 'inbox';
        fullEmail = parseMicrosoftMessage(full, String(accountId), folder);

        await msUpdateMessage(account as MicrosoftAccount, String(messageId), { isRead: true })
          .catch(() => {});
        fullEmail.isRead = true;
      }

      setEmail(fullEmail);
      return res.status(200).json({ message: fullEmail });
    }

    // ── GET /api/email/messages (list) ──────────────────────────────────────
    const { accountId, folder = 'inbox', page = '1', limit = '50', threadId } = query;

    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));

    const account = await loadAccount(String(accountId));
    if (account.status === 'error' || account.status === 'disconnected') {
      return res.status(400).json({ error: `Account status: ${account.status}` });
    }

    // Check cache freshness
    const syncState = getSyncState(String(accountId));
    const cacheAge = Date.now() - (syncState.lastSync ?? 0);
    const { emails: cachedEmails, total } = getEmailsByFolder(
      String(accountId),
      String(folder),
      pageNum,
      limitNum,
    );

    if (total === 0 || cacheAge > CACHE_TTL_MS) {
      // Trigger async sync but don't wait if we have cached data
      if (total === 0) {
        // No cache — wait for sync
        await syncAccount(String(accountId)).catch(() => {});
      } else {
        // Stale cache — refresh in background
        syncAccount(String(accountId)).catch(() => {});
      }
    }

    const { emails: freshEmails } = getEmailsByFolder(
      String(accountId),
      String(folder),
      pageNum,
      limitNum,
    );

    // Filter by threadId if provided
    let result = freshEmails;
    if (threadId) {
      result = freshEmails.filter(e => e.threadId === String(threadId));
    }

    const totalCount = total > 0 ? total : freshEmails.length;

    return res.status(200).json({
      messages: result,
      total: totalCount,
      page: pageNum,
      hasMore: pageNum * limitNum < totalCount,
    });
  } catch (err: any) {
    console.error('[email/messages] error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err?.message });
  }
}
