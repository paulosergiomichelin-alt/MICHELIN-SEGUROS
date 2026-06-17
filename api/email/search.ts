import { fsGet } from '../lib/adminFirebase.js';
import { getAllEmailsByFolder, CachedEmail } from '../lib/emailCache.js';
import {
  getMessage as gmailGetMessage,
  parseGmailMessage,
  gmailRequest,
  GmailAccount,
} from '../lib/gmailClient.js';
import {
  graphRequest,
  parseMicrosoftMessage,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';

const MAX_RESULTS = 20;

async function searchGmail(
  account: GmailAccount,
  q: string,
  folder?: string,
): Promise<CachedEmail[]> {
  const params = new URLSearchParams({
    maxResults: String(MAX_RESULTS),
    q,
  });
  if (folder && folder !== 'all') {
    const labelMap: Record<string, string> = {
      inbox: 'INBOX',
      sent: 'SENT',
      drafts: 'DRAFT',
      trash: 'TRASH',
      spam: 'SPAM',
    };
    const label = labelMap[folder];
    if (label) params.append('labelIds', label);
  }

  const data = await gmailRequest(account, `/users/me/messages?${params}`);

  const messages: CachedEmail[] = [];
  const msgRefs: Array<{ id: string }> = data?.messages ?? [];

  for (const ref of msgRefs.slice(0, MAX_RESULTS)) {
    try {
      const full = await gmailGetMessage(account, ref.id, 'metadata');
      const parsed = parseGmailMessage(full, account.id);
      messages.push(parsed);
    } catch {
      // skip individual failures
    }
  }

  return messages;
}

async function searchMicrosoft(
  account: MicrosoftAccount,
  q: string,
  folder?: string,
): Promise<CachedEmail[]> {
  const folderMap: Record<string, string> = {
    inbox: 'inbox',
    sent: 'sentitems',
    drafts: 'drafts',
    trash: 'deleteditems',
    spam: 'junkemail',
    archive: 'archive',
  };

  const folderPath = folder && folder !== 'all' ? (folderMap[folder] ?? 'inbox') : 'inbox';

  const params = new URLSearchParams({
    $search: `"${q}"`,
    $top: String(MAX_RESULTS),
    $select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,flag,hasAttachments,conversationId',
  });

  let data: any;
  try {
    data = await graphRequest(
      account,
      `me/mailFolders/${folderPath}/messages?${params}`,
      { headers: { ConsistencyLevel: 'eventual' } },
    );
  } catch {
    // Fallback without $search
    const fallbackParams = new URLSearchParams({
      $filter: `contains(subject,'${q.replace(/'/g, "''")}')`,
      $top: String(MAX_RESULTS),
      $select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,flag,hasAttachments,conversationId',
    });
    data = await graphRequest(account, `me/mailFolders/${folderPath}/messages?${fallbackParams}`);
  }

  const msgs = data?.value ?? [];
  return msgs.map((msg: any) => parseMicrosoftMessage(msg, account.id, folderPath));
}

function searchCache(
  accountId: string,
  q: string,
  folder?: string,
): CachedEmail[] {
  const folders = folder && folder !== 'all'
    ? [folder]
    : ['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive'];

  const lowerQ = q.toLowerCase();
  const results: CachedEmail[] = [];

  for (const f of folders) {
    const emails = getAllEmailsByFolder(accountId, f);
    for (const email of emails) {
      if (
        email.subject.toLowerCase().includes(lowerQ) ||
        email.from.email.toLowerCase().includes(lowerQ) ||
        (email.from.name?.toLowerCase().includes(lowerQ)) ||
        email.snippet.toLowerCase().includes(lowerQ) ||
        email.to.some(r =>
          r.email.toLowerCase().includes(lowerQ) ||
          r.name?.toLowerCase().includes(lowerQ),
        )
      ) {
        results.push(email);
        if (results.length >= MAX_RESULTS) break;
      }
    }
    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId, q, folder } = req.query ?? {};

    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
    if (!q) return res.status(400).json({ error: 'q (query) é obrigatório' });

    const account = await fsGet('email_accounts', String(accountId));
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    // First search cache for quick results
    const cachedResults = searchCache(String(accountId), String(q), folder ? String(folder) : undefined);

    // If cache has enough results, return immediately
    if (cachedResults.length >= MAX_RESULTS) {
      return res.status(200).json({ messages: cachedResults.slice(0, MAX_RESULTS) });
    }

    // Otherwise search via API
    let apiResults: CachedEmail[] = [];
    try {
      if (account.provider === 'gmail') {
        apiResults = await searchGmail(
          account as GmailAccount,
          String(q),
          folder ? String(folder) : undefined,
        );
      } else if (account.provider === 'microsoft') {
        apiResults = await searchMicrosoft(
          account as MicrosoftAccount,
          String(q),
          folder ? String(folder) : undefined,
        );
      }
    } catch (err: any) {
      console.error('[email/search] API search failed, returning cache results:', err.message);
    }

    // Merge: prefer API results, supplement with cache
    const merged = new Map<string, CachedEmail>();
    for (const e of apiResults) merged.set(e.id, e);
    for (const e of cachedResults) {
      if (!merged.has(e.id)) merged.set(e.id, e);
    }

    const results = Array.from(merged.values()).slice(0, MAX_RESULTS);

    return res.status(200).json({ messages: results });
  } catch (err: any) {
    console.error('[email/search] error:', err);
    return res.status(500).json({ error: 'Erro na busca', detail: err?.message });
  }
}
