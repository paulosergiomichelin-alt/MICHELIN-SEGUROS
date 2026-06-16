import { fsGet } from '../lib/adminFirebase.js';
import { syncSession } from '../lib/syncService.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionName, organizationId: bodyOrgId, importMessages = false } = req.body ?? {};
  if (!sessionName) {
    return res.status(400).json({ error: 'sessionName é obrigatório' });
  }

  try {
    let organizationId: string = bodyOrgId || 'default';
    if (!bodyOrgId) {
      const sessionDoc = await fsGet('whatsapp_sessions', sessionName).catch(() => null);
      if (sessionDoc?.organizationId) organizationId = sessionDoc.organizationId;
    }

    const result = await syncSession(sessionName, organizationId, Boolean(importMessages));
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[EVOLUTION/sync] error:', err);
    return res.status(500).json({ error: 'Erro ao sincronizar conversas', detail: err?.message });
  }
}
