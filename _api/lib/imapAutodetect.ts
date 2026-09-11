export interface ImapSmtpConfig {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

// Provedores conhecidos cujo host real diverge do padrão imap.<domínio>/smtp.<domínio>.
// Best-effort (igual Thunderbird) — sempre editável manualmente pelo usuário no formulário.
const KNOWN_PROVIDERS: Record<string, Pick<ImapSmtpConfig, 'imapHost' | 'smtpHost'>> = {
  'gmail.com': { imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' },
  'outlook.com': { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com' },
  'hotmail.com': { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com' },
  'live.com': { imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com' },
  'yahoo.com': { imapHost: 'imap.mail.yahoo.com', smtpHost: 'smtp.mail.yahoo.com' },
};

export function detectImapSmtpConfig(email: string): ImapSmtpConfig {
  const domain = (email.split('@')[1] ?? '').toLowerCase().trim();
  const known = KNOWN_PROVIDERS[domain];

  return {
    imapHost: known?.imapHost ?? `imap.${domain}`,
    imapPort: 993,
    imapSecure: true,
    smtpHost: known?.smtpHost ?? `smtp.${domain}`,
    smtpPort: 587,
    smtpSecure: false,
  };
}
