import { fsGet } from '../lib/adminFirebase.js';
import { setEmail, CachedEmail } from '../lib/emailCache.js';
import { emitGlobal } from '../lib/socketRegistry.js';
import {
  sendMessage as gmailSend,
  GmailAccount,
} from '../lib/gmailClient.js';
import {
  sendMessage as msSend,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';

interface Recipient {
  name?: string;
  email: string;
}

interface SendEmailBody {
  accountId: string;
  to: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  replyToId?: string;
  forwardId?: string;
  attachments?: { filename: string; mimeType: string; data: string }[]; // data = base64
}

// ── RFC 2822 builder ──────────────────────────────────────────────────────────

function encodeHeader(value: string): string {
  // Encode non-ASCII header values
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

function formatAddress(recipient: Recipient): string {
  if (recipient.name) {
    return `${encodeHeader(recipient.name)} <${recipient.email}>`;
  }
  return recipient.email;
}

function buildMimeMessage(params: SendEmailBody, fromEmail: string): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];

  lines.push(`From: ${fromEmail}`);
  lines.push(`To: ${params.to.map(formatAddress).join(', ')}`);

  if (params.cc && params.cc.length > 0) {
    lines.push(`Cc: ${params.cc.map(formatAddress).join(', ')}`);
  }
  if (params.bcc && params.bcc.length > 0) {
    lines.push(`Bcc: ${params.bcc.map(formatAddress).join(', ')}`);
  }

  lines.push(`Subject: ${encodeHeader(params.subject)}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push('');

  // Plain text part
  if (params.bodyText) {
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(params.bodyText);
    lines.push('');
  }

  // HTML part
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(params.bodyHtml, 'utf8').toString('base64'));
  lines.push('');

  lines.push(`--${boundary}--`);

  const rawMessage = lines.join('\r\n');
  // Encode as base64url
  return Buffer.from(rawMessage).toString('base64url');
}

function buildMicrosoftPayload(params: SendEmailBody): any {
  const toRecipients = params.to.map(r => ({
    emailAddress: { address: r.email, name: r.name ?? r.email },
  }));
  const ccRecipients = (params.cc ?? []).map(r => ({
    emailAddress: { address: r.email, name: r.name ?? r.email },
  }));
  const bccRecipients = (params.bcc ?? []).map(r => ({
    emailAddress: { address: r.email, name: r.name ?? r.email },
  }));

  const message: Record<string, any> = {
    subject: params.subject,
    body: {
      contentType: 'HTML',
      content: params.bodyHtml,
    },
    toRecipients,
    ccRecipients,
    bccRecipients,
  };

  return { message, saveToSentItems: true };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body: SendEmailBody = req.body ?? {};
    const { accountId, to, subject, bodyHtml } = body;

    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
    if (!to || !Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: 'to é obrigatório e deve ser um array' });
    }
    if (!subject) return res.status(400).json({ error: 'subject é obrigatório' });
    if (!bodyHtml) return res.status(400).json({ error: 'bodyHtml é obrigatório' });

    const account = await fsGet('email_accounts', accountId);
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    let sentMessageId: string | undefined;

    if (account.provider === 'gmail') {
      const rawMessage = buildMimeMessage(body, account.email);
      const result = await gmailSend(account as GmailAccount, rawMessage);
      sentMessageId = result?.id;
    } else if (account.provider === 'microsoft') {
      const payload = buildMicrosoftPayload(body);
      await msSend(account as MicrosoftAccount, payload);
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }

    // Add to cache as sent message
    const now = new Date().toISOString();
    const optimisticId = sentMessageId ?? `sent_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const cachedSent: CachedEmail = {
      id: optimisticId,
      accountId,
      provider: account.provider as 'gmail' | 'microsoft',
      folder: 'sent',
      subject,
      from: { email: account.email, name: account.displayName },
      to: to.map(r => ({ email: r.email, name: r.name })),
      cc: body.cc?.map(r => ({ email: r.email, name: r.name })),
      date: now,
      snippet: bodyHtml.replace(/<[^>]+>/g, '').slice(0, 200),
      isRead: true,
      isStarred: false,
      hasAttachments: Boolean(body.attachments?.length),
      bodyHtml,
      bodyText: body.bodyText,
      fetchedAt: Date.now(),
    };

    setEmail(cachedSent);

    // Emit socket event
    emitGlobal('email:update', {
      type: 'sent',
      userId: account.userId,
      accountId,
      messageId: optimisticId,
    });

    return res.status(200).json({ success: true, messageId: optimisticId });
  } catch (err: any) {
    console.error('[email/send] error:', err);
    return res.status(500).json({ error: 'Erro ao enviar e-mail', detail: err?.message });
  }
}
