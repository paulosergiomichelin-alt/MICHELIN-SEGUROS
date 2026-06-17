import { syncAccount } from '../lib/emailSync.js';
import { getSyncState } from '../lib/emailCache.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId } = req.query ?? {};
    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

    const result = await syncAccount(String(accountId));
    const syncState = getSyncState(String(accountId));

    return res.status(200).json({
      success: true,
      imported: result.imported,
      errors: result.errors,
      lastSync: syncState.lastSync,
    });
  } catch (err: any) {
    console.error('[email/sync] error:', err);
    return res.status(500).json({ error: 'Erro ao sincronizar', detail: err?.message });
  }
}
