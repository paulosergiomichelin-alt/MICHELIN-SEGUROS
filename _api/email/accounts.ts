import { fsQueryFull, fsDelete, fsUpdate, fsSet } from '../lib/pgData.js';
import { clearAccount } from '../lib/emailCache.js';
import { encrypt } from '../lib/emailEncryption.js';
import { detectImapSmtpConfig } from '../lib/imapAutodetect.js';
import { testImapConnection, ImapAccount } from '../lib/imapClient.js';
import { testSmtpConnection, SmtpAccount } from '../lib/smtpClient.js';

function generateId(): string {
  return `imap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function stripTokens(account: Record<string, any>): Record<string, any> {
  const { accessToken, refreshToken, ...safe } = account;
  return safe;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const { userId } = req.query ?? {};
      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

      const accounts = await fsQueryFull('email_accounts', [
        { field: 'userId', value: String(userId) },
      ]);

      return res.status(200).json({
        accounts: accounts.map(stripTokens),
      });
    }

    if (req.method === 'DELETE') {
      const { accountId } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      await fsDelete('email_accounts', String(accountId));
      clearAccount(String(accountId));

      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      const { accountId, isDefault, displayName } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

      const patch: Record<string, any> = {};
      if (isDefault !== undefined) patch.isDefault = Boolean(isDefault);
      if (displayName !== undefined) patch.displayName = String(displayName);

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      await fsUpdate('email_accounts', String(accountId), patch);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST') {
      const { userId, email, username, password, displayName } = req.body ?? {};
      if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
      if (!email) return res.status(400).json({ error: 'email é obrigatório' });
      if (!password) return res.status(400).json({ error: 'password é obrigatório' });

      const detected = detectImapSmtpConfig(String(email));
      // Guarda contra e-mail sem domínio válido (ex.: "notanemail", sem "@"):
      // detectImapSmtpConfig monta o host como `imap.${domain}`/`smtp.${domain}` sem validar
      // o domínio, então domain==='' produz literalmente "imap."/"smtp." (host termina em
      // ponto). Checar apenas `.includes('.')` NÃO pega esse caso — "imap." já contém um
      // ponto. `.endsWith('.')` é o teste correto para "domínio vazio".
      if (detected.imapHost.endsWith('.') || detected.smtpHost.endsWith('.')) {
        return res.status(400).json({ error: 'E-mail inválido: não foi possível determinar o domínio' });
      }

      const imapHost = req.body.imapHost || detected.imapHost;
      const imapPort = Number(req.body.imapPort || detected.imapPort);
      const imapSecure = req.body.imapSecure ?? detected.imapSecure;
      const smtpHost = req.body.smtpHost || detected.smtpHost;
      const smtpPort = Number(req.body.smtpPort || detected.smtpPort);
      const smtpSecure = req.body.smtpSecure ?? detected.smtpSecure;
      const finalUsername = username || email;

      const passwordEncrypted = encrypt(String(password));

      const testAccount = {
        id: 'pending', userId: String(userId), email: String(email), provider: 'imap' as const,
        imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure,
        username: finalUsername, passwordEncrypted,
      };

      const imapResult = await testImapConnection(testAccount as ImapAccount);
      if (!imapResult.ok) {
        return res.status(400).json({ error: `Falha ao conectar via IMAP: ${imapResult.error}` });
      }
      const smtpResult = await testSmtpConnection(testAccount as SmtpAccount);
      if (!smtpResult.ok) {
        return res.status(400).json({ error: `Falha ao conectar via SMTP: ${smtpResult.error}` });
      }

      const accountId = generateId();
      await fsSet('email_accounts', accountId, {
        userId: String(userId),
        email: String(email),
        displayName: displayName || email,
        provider: 'imap',
        imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure,
        username: finalUsername,
        passwordEncrypted,
        status: 'active',
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      import('../lib/emailSync.js').then(({ syncAccount }) => syncAccount(accountId)).catch(() => {});

      return res.status(200).json({ success: true, accountId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[email/accounts] error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err?.message });
  }
}
