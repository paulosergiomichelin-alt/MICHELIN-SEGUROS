import { loadOwnedEmailAccount, handleOwnershipError } from '../lib/emailOwnership.js';
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
import {
  sendMessage as smtpSend,
  SmtpAccount,
  SmtpSendPayload,
} from '../lib/smtpClient.js';
import { appendToSent as imapAppendToSent, ImapAccount } from '../lib/imapClient.js';

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

// Quebra em linhas de 76 chars — RFC 2045 exige isso para Content-Transfer-Encoding: base64.
function wrapBase64(b64: string): string {
  return b64.replace(/.{76}/g, '$&\r\n');
}

function buildMimeMessage(params: SendEmailBody, fromEmail: string): string {
  const altBoundary = `boundary_alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const mixedBoundary = `boundary_mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = Boolean(params.attachments?.length);
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
  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push('');
    lines.push(`--${mixedBoundary}`);
  }
  lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  lines.push('');

  // Plain text part
  if (params.bodyText) {
    lines.push(`--${altBoundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(params.bodyText);
    lines.push('');
  }

  // HTML part
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(wrapBase64(Buffer.from(params.bodyHtml, 'utf8').toString('base64')));
  lines.push('');

  lines.push(`--${altBoundary}--`);

  if (hasAttachments) {
    for (const att of params.attachments!) {
      lines.push('');
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${att.mimeType || 'application/octet-stream'}; name="${att.filename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      lines.push('');
      lines.push(wrapBase64(att.data));
    }
    lines.push('');
    lines.push(`--${mixedBoundary}--`);
  }

  const rawMessage = lines.join('\r\n');
  // Encode as base64url
  return Buffer.from(rawMessage).toString('base64url');
}

// ── Payload estruturado para SMTP (nodemailer compõe o MIME) ─────────────────
// NÃO reusa buildMimeMessage: no caminho SMTP o nodemailer precisa do payload
// estruturado para derivar o envelope (MAIL FROM / RCPT TO). Com `{ raw }` o
// envelope sai vazio (`{from: false, to: []}`) e todo servidor SMTP real
// rejeita com "No recipients defined" — além de transmitir o header `Bcc:`
// literal (vazamento de BCC) e não gerar `Date:`/`Message-ID:`.
function buildSmtpPayload(params: SendEmailBody, fromEmail: string, fromName?: string): SmtpSendPayload {
  const payload: SmtpSendPayload = {
    // accounts.ts grava displayName = displayName || email, então evita produzir
    // um From redundante do tipo "x@y.com <x@y.com>".
    from: { name: fromName && fromName !== fromEmail ? fromName : undefined, email: fromEmail },
    to: params.to.map(r => ({ name: r.name, email: r.email })),
    subject: params.subject,
    html: params.bodyHtml,
  };

  if (params.cc && params.cc.length > 0) {
    payload.cc = params.cc.map(r => ({ name: r.name, email: r.email }));
  }
  if (params.bcc && params.bcc.length > 0) {
    payload.bcc = params.bcc.map(r => ({ name: r.name, email: r.email }));
  }
  if (params.bodyText) payload.text = params.bodyText;
  if (params.attachments && params.attachments.length > 0) {
    payload.attachments = params.attachments.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.data, 'base64'),
      contentType: att.mimeType || 'application/octet-stream',
    }));
  }

  return payload;
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

  if (params.attachments && params.attachments.length > 0) {
    message.attachments = params.attachments.map(att => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.filename,
      contentType: att.mimeType || 'application/octet-stream',
      contentBytes: att.data,
    }));
  }

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

    const account = await loadOwnedEmailAccount(String(accountId), req.userId);

    let sentMessageId: string | undefined;

    if (account.provider === 'gmail') {
      const rawMessage = buildMimeMessage(body, account.email);
      const result = await gmailSend(account as GmailAccount, rawMessage);
      sentMessageId = result?.id;
    } else if (account.provider === 'microsoft') {
      const payload = buildMicrosoftPayload(body);
      await msSend(account as MicrosoftAccount, payload);
    } else if (account.provider === 'imap') {
      const smtpPayload = buildSmtpPayload(body, account.email, account.displayName);
      const result = await smtpSend(account as SmtpAccount, smtpPayload);

      // `sentMessageId` fica undefined de propósito (igual ao branch Microsoft):
      // o Message-ID SMTP não é um identificador de mensagem IMAP, então o
      // fallback `optimisticId` abaixo é quem nomeia a entrada de cache local.
      // A entrada real (com o UID correto da pasta Sent) chega no próximo sync.

      // SMTP puro não grava cópia em "Enviados" (Gmail/Graph gravam sozinhos) —
      // o APPEND abaixo faz isso. Falha aqui não invalida o envio, que já ocorreu.
      await imapAppendToSent(account as ImapAccount, result.raw).catch((err: any) => {
        console.error('[email/send] APPEND na pasta Enviados falhou:', err?.message);
      });
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }

    // Add to cache as sent message
    const now = new Date().toISOString();
    const optimisticId = sentMessageId ?? `sent_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const cachedSent: CachedEmail = {
      id: optimisticId,
      accountId,
      provider: account.provider as 'gmail' | 'microsoft' | 'imap',
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
    if (handleOwnershipError(err, res)) return;
    console.error('[email/send] error:', err);
    return res.status(500).json({ error: 'Erro ao enviar e-mail', detail: err?.message });
  }
}
