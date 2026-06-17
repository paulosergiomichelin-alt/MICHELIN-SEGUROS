import { fsGet } from '../lib/adminFirebase.js';
import {
  getAllEmailsByFolder, setEmail, removeEmail, CachedEmail,
} from '../lib/emailCache.js';
import {
  createDraft as gmailCreateDraft,
  updateDraft as gmailUpdateDraft,
  deleteDraft as gmailDeleteDraft,
  GmailAccount,
} from '../lib/gmailClient.js';
import {
  createDraft as msCreateDraft,
  updateDraft as msUpdateDraft,
  deleteDraft as msDeleteDraft,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';

interface Recipient {
  name?: string;
  email: string;
}

interface DraftBody {
  accountId: string;
  to?: Recipient[];
  cc?: Recipient[];
  subject?: string;
  bodyHtml?: string;
  draftId?: string; // if provided, update existing draft
}

// ── Build Gmail RFC 2822 raw message ─────────────────────────────────────────

function buildGmailDraftRaw(params: DraftBody, fromEmail: string): string {
  const lines: string[] = [];
  lines.push(`From: ${fromEmail}`);
  if (params.to?.length) lines.push(`To: ${params.to.map(r => r.email).join(', ')}`);
  if (params.cc?.length) lines.push(`Cc: ${params.cc.map(r => r.email).join(', ')}`);
  lines.push(`Subject: ${params.subject ?? '(sem assunto)'}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(params.bodyHtml ?? '', 'utf8').toString('base64'));

  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

// ── Build Microsoft Graph payload ─────────────────────────────────────────────

function buildMsDraftPayload(params: DraftBody): any {
  return {
    subject: params.subject ?? '(sem assunto)',
    body: { contentType: 'HTML', content: params.bodyHtml ?? '' },
    toRecipients: (params.to ?? []).map(r => ({
      emailAddress: { address: r.email, name: r.name ?? r.email },
    })),
    ccRecipients: (params.cc ?? []).map(r => ({
      emailAddress: { address: r.email, name: r.name ?? r.email },
    })),
    isDraft: true,
  };
}

export default async function handler(req: any, res: any) {
  try {
    const url: string = req.url ?? '';
    const query = req.query ?? {};

    // ── GET /api/email/drafts?accountId= ───────────────────────────────────
    if (req.method === 'GET') {
      const { accountId } = query;
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const drafts = getAllEmailsByFolder(String(accountId), 'drafts');
      return res.status(200).json({ drafts });
    }

    // ── POST /api/email/draft ─────────────────────────────────────────────
    if (req.method === 'POST') {
      const body: DraftBody = req.body ?? {};
      const { accountId, draftId } = body;

      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const account = await fsGet('email_accounts', String(accountId));
      if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

      let resultId: string;

      if (account.provider === 'gmail') {
        const raw = buildGmailDraftRaw(body, account.email);

        if (draftId) {
          const result = await gmailUpdateDraft(account as GmailAccount, draftId, raw);
          resultId = result?.id ?? draftId;
        } else {
          const result = await gmailCreateDraft(account as GmailAccount, raw);
          resultId = result?.id ?? `draft_${Date.now()}`;
        }
      } else if (account.provider === 'microsoft') {
        const payload = buildMsDraftPayload(body);

        if (draftId) {
          const result = await msUpdateDraft(account as MicrosoftAccount, draftId, payload);
          resultId = result?.id ?? draftId;
        } else {
          const result = await msCreateDraft(account as MicrosoftAccount, payload);
          resultId = result?.id ?? `draft_${Date.now()}`;
        }
      } else {
        return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
      }

      // Update cache
      const now = new Date().toISOString();
      const cachedDraft: CachedEmail = {
        id: resultId,
        accountId: String(accountId),
        provider: account.provider as 'gmail' | 'microsoft',
        folder: 'drafts',
        subject: body.subject ?? '(sem assunto)',
        from: { email: account.email, name: account.displayName },
        to: body.to ?? [],
        cc: body.cc,
        date: now,
        snippet: (body.bodyHtml ?? '').replace(/<[^>]+>/g, '').slice(0, 200),
        isRead: true,
        isStarred: false,
        hasAttachments: false,
        bodyHtml: body.bodyHtml,
        fetchedAt: Date.now(),
      };
      setEmail(cachedDraft);

      return res.status(200).json({ success: true, draftId: resultId });
    }

    // ── DELETE /api/email/draft/:id?accountId= ────────────────────────────
    if (req.method === 'DELETE') {
      const { accountId } = query;
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      // Extract draft ID from path
      const pathParts = url.split('?')[0].split('/').filter(Boolean);
      const draftId = pathParts[pathParts.length - 1];

      if (!draftId || draftId === 'draft') {
        return res.status(400).json({ error: 'draftId é obrigatório na URL' });
      }

      const account = await fsGet('email_accounts', String(accountId));
      if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

      if (account.provider === 'gmail') {
        await gmailDeleteDraft(account as GmailAccount, draftId);
      } else if (account.provider === 'microsoft') {
        await msDeleteDraft(account as MicrosoftAccount, draftId);
      } else {
        return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
      }

      removeEmail(String(accountId), draftId);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[email/draft] error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err?.message });
  }
}
