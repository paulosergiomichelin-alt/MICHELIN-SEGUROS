import { EvolutionAPI } from '../lib/evolutionApi.js';
import { fsSet, fsUpdate, fsQuery } from '../lib/adminFirebase.js';

export default async function handler(req: any, res: any) {
  // ── GET: list sessions ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { organizationId } = req.query ?? {};
      const filters: Array<{ field: string; value: string }> = [];
      if (organizationId) {
        filters.push({ field: 'organizationId', value: String(organizationId) });
      }
      const sessions = filters.length > 0
        ? await fsQuery('whatsapp_sessions', filters)
        : [];
      return res.status(200).json({ sessions });
    } catch (err: any) {
      console.error('[EVOLUTION/sessions] GET error:', err);
      return res.status(500).json({ error: 'Erro ao listar sessões', detail: err?.message });
    }
  }

  // ── POST: create new session ────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const { userId, sessionName, organizationId } = req.body ?? {};
      if (!userId || !organizationId) {
        return res.status(400).json({ error: 'userId e organizationId são obrigatórios' });
      }

      const instanceName: string =
        sessionName || `michelin_${organizationId}_${userId}`;

      const webhookUrl: string =
        process.env.EVOLUTION_WEBHOOK_URL ||
        `https://${req.headers.host}/api/webhook/evolution`;

      console.log(`[EVOLUTION/sessions] Criando instância: ${instanceName} webhook=${webhookUrl}`);

      const result = await EvolutionAPI.createInstance(instanceName, webhookUrl);
      if (!result) {
        return res.status(502).json({ error: 'Falha ao criar instância na Evolution API' });
      }

      const now = new Date().toISOString();
      await fsSet('whatsapp_sessions', instanceName, {
        id: instanceName,
        userId,
        sessionName: instanceName,
        phoneNumber: null,
        profileName: null,
        profilePicture: null,
        status: 'qr',
        organizationId,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`[EVOLUTION/sessions] Sessão criada: ${instanceName}`);
      return res.status(201).json({ instanceName, status: 'qr' });
    } catch (err: any) {
      console.error('[EVOLUTION/sessions] POST error:', err);
      return res.status(500).json({ error: 'Erro ao criar sessão', detail: err?.message });
    }
  }

  // ── DELETE: disconnect and delete session ───────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const name = String(req.query?.name ?? '');
      if (!name) {
        return res.status(400).json({ error: 'Query param "name" é obrigatório' });
      }

      console.log(`[EVOLUTION/sessions] Encerrando instância: ${name}`);
      await EvolutionAPI.logoutInstance(name);
      await EvolutionAPI.deleteInstance(name);

      await fsUpdate('whatsapp_sessions', name, {
        status: 'close',
        updatedAt: new Date().toISOString(),
      });

      return res.status(200).json({ success: true, instanceName: name });
    } catch (err: any) {
      console.error('[EVOLUTION/sessions] DELETE error:', err);
      return res.status(500).json({ error: 'Erro ao encerrar sessão', detail: err?.message });
    }
  }

  // ── PUT: refresh/restart — return current connection state ──────────────────
  if (req.method === 'PUT') {
    try {
      const { name } = req.body ?? {};
      if (!name) {
        return res.status(400).json({ error: 'Campo "name" é obrigatório no body' });
      }

      const state = await EvolutionAPI.getConnectionState(String(name));
      if (!state) {
        return res.status(502).json({ error: 'Não foi possível obter estado da instância' });
      }

      return res.status(200).json(state);
    } catch (err: any) {
      console.error('[EVOLUTION/sessions] PUT error:', err);
      return res.status(500).json({ error: 'Erro ao atualizar sessão', detail: err?.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
