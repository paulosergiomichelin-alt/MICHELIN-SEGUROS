import { fsQueryFull, fsDelete, fsUpdate } from '../lib/adminFirebase.js';
import { clearAccount } from '../lib/emailCache.js';

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

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[email/accounts] error:', err);
    return res.status(500).json({ error: 'Erro interno', detail: err?.message });
  }
}
