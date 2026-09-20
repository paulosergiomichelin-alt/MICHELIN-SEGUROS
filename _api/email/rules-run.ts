import { runRulesNow } from '../lib/emailSync.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId } = req.body ?? {};
    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

    const result = await runRulesNow(String(accountId));
    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error('[email/rules-run] error:', err);
    return res.status(500).json({ error: 'Erro ao executar regras', detail: err?.message });
  }
}
