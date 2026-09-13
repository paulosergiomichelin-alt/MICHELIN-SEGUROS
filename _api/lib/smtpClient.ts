import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { randomUUID } from 'node:crypto';
import { decrypt } from './emailEncryption.js';

export interface SmtpAccount {
  id: string;
  userId: string;
  email: string;
  provider: 'imap';
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  passwordEncrypted: string;
  [key: string]: any;
}

export interface SmtpRecipient {
  name?: string;
  email: string;
}

export interface SmtpAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/**
 * Payload estruturado que o nodemailer compõe sozinho (MailComposer).
 *
 * NÃO usar `transporter.sendMail({ raw })`: no modo raw o nodemailer não deriva
 * o envelope SMTP (MAIL FROM / RCPT TO) do MIME — ele fica literalmente
 * `{from: false, to: []}` e todo servidor SMTP real responde
 * "No recipients defined". Além disso o modo raw não gera `Date:`/`Message-ID:`
 * e não remove o header `Bcc:` (vazamento de BCC). Passando o payload
 * estruturado, o MailComposer do próprio nodemailer resolve envelope, `Date:`,
 * `Message-ID:`, transfer-encoding e a remoção do `Bcc:` corretamente.
 */
export interface SmtpSendPayload {
  from: SmtpRecipient;
  to: SmtpRecipient[];
  cc?: SmtpRecipient[];
  bcc?: SmtpRecipient[];
  subject: string;
  html: string;
  text?: string;
  attachments?: SmtpAttachment[];
}

function buildTransport(account: SmtpAccount) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: { user: account.username, pass: decrypt(account.passwordEncrypted) },
  });
}

export async function testSmtpConnection(account: SmtpAccount): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = buildTransport(account);
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

function toAddress(recipient: SmtpRecipient): string | { name: string; address: string } {
  return recipient.name ? { name: recipient.name, address: recipient.email } : recipient.email;
}

/**
 * Monta as opções do nodemailer. `messageId` e `date` são fixados aqui (em vez de
 * deixar o nodemailer gerar em cada composição) porque a mesma mensagem é
 * composta duas vezes: uma para o envio SMTP e outra para o APPEND na pasta
 * Sent via IMAP — assim as duas cópias carregam exatamente o mesmo
 * `Message-ID:`/`Date:`.
 */
function buildMailOptions(payload: SmtpSendPayload): Record<string, any> {
  const domain = payload.from.email.split('@')[1] || 'localhost';
  const options: Record<string, any> = {
    from: toAddress(payload.from),
    to: payload.to.map(toAddress),
    subject: payload.subject,
    html: payload.html,
    date: new Date(),
    messageId: `<${randomUUID()}@${domain}>`,
  };

  if (payload.cc && payload.cc.length > 0) options.cc = payload.cc.map(toAddress);
  if (payload.bcc && payload.bcc.length > 0) options.bcc = payload.bcc.map(toAddress);
  if (payload.text) options.text = payload.text;
  if (payload.attachments && payload.attachments.length > 0) {
    options.attachments = payload.attachments.map(att => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType || 'application/octet-stream',
    }));
  }

  return options;
}

/**
 * Compõe o MIME da mensagem sem enviar — usado para o APPEND na pasta Sent
 * (SMTP puro, diferente das APIs Gmail/Graph, não grava cópia em Enviados).
 * O MailComposer remove o header `Bcc:` por padrão (keepBcc=false no MimeNode).
 */
export async function buildRawMessage(options: Record<string, any>): Promise<Buffer> {
  return new MailComposer(options as any).compile().build();
}

export async function sendMessage(
  account: SmtpAccount,
  payload: SmtpSendPayload,
): Promise<{ id: string; raw: Buffer }> {
  const transporter = buildTransport(account);
  const options = buildMailOptions(payload);

  // Compõe o raw ANTES de enviar: `sendMail` normaliza/enriquece o objeto de
  // opções internamente, então compor depois poderia divergir do que foi enviado.
  const raw = await buildRawMessage(options);

  await transporter.sendMail(options);

  return { id: String(options.messageId), raw };
}
