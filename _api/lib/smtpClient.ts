import nodemailer from 'nodemailer';
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

export async function sendMessage(account: SmtpAccount, raw: string): Promise<{ id: string }> {
  const transporter = buildTransport(account);
  const info = await transporter.sendMail({ raw: Buffer.from(raw, 'utf8') });
  return { id: info.messageId };
}
