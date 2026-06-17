import { EvolutionAPI } from '../lib/evolutionApi.js';
import { fsSet, fsUpdate, fsDelete, fsQuery } from '../lib/adminFirebase.js';

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
      if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
        return res.status(503).json({
          error: 'Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no .env',
        });
      }

      const { userId, sessionName, organizationId } = req.body ?? {};
      if (!userId || !organizationId) {
        return res.status(400).json({ error: 'userId e organizationId são obrigatórios' });
      }

      const instanceName: string =
        sessionName || `michelin_${organizationId}_${userId}`;

      const webhookUrl: string = process.env.EVOLUTION_WEBHOOK_URL || '';

      console.log(`[EVOLUTION/sessions] Criando instância: ${instanceName} webhook=${webhookUrl || '(none)'}`);

      const result = await EvolutionAPI.createInstance(instanceName, webhookUrl);
      console.log('[EVOLUTION/sessions] createInstance result:', JSON.stringify(result)?.slice(0, 500));
      if (!result) {
        return res.status(502).json({ error: 'Falha ao criar instância na Evolution API. Verifique se a URL e a chave estão corretas e se o serviço está acessível.' });
      }

      const qrInCreate = result?.qrcode ?? result?.hash?.qrcode;
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
        ...(qrInCreate?.base64 ? { qrBase64: qrInCreate.base64, qrCode: qrInCreate.code ?? null } : {}),
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
      await fsDelete('whatsapp_sessions', name);

      return res.status(200).json({ success: true, instanceName: name });
    } catch (err: any) {
      console.error('[EVOLUTION/sessions] DELETE error:', err);
      return res.status(500).json({ error: 'Erro ao encerrar sessão', detail: err?.message });
    }
  }

  // ── PUT: hard reset — delete + recreate instance so a fresh QR is generated ──
  if (req.method === 'PUT') {
    try {
      const { name, userId, organizationId } = req.body ?? {};
      if (!name) {
        return res.status(400).json({ error: 'Campo "name" é obrigatório no body' });
      }

      console.log(`[EVOLUTION/sessions] Reiniciando instância: ${name}`);
      await EvolutionAPI.logoutInstance(String(name));
      await EvolutionAPI.deleteInstance(String(name));
      await new Promise(r => setTimeout(r, 2000));

      const webhookUrl: string = process.env.EVOLUTION_WEBHOOK_URL || '';

      const result = await EvolutionAPI.createInstance(String(name), webhookUrl);
      console.log('[EVOLUTION/sessions] createInstance result:', JSON.stringify(result)?.slice(0, 500));
      if (!result) {
        return res.status(502).json({ error: 'Falha ao recriar instância na Evolution API' });
      }

      // Evolution API v2 may return QR code in the create response
      const qrInCreate = result?.qrcode ?? result?.hash?.qrcode;
      const now = new Date().toISOString();
      await fsUpdate('whatsapp_sessions', String(name), {
        status: 'qr',
        ...(qrInCreate?.base64 ? { qrBase64: qrInCreate.base64, qrCode: qrInCreate.code ?? null } : {}),
        updatedAt: now,
      });

      console.log(`[EVOLUTION/sessions] Instância reiniciada: ${name}`);
      return res.status(200).json({ instanceName: name, status: 'qr' });
    } catch (err: any) {
      console.error('[EVOLUTION/sessions] PUT error:', err);
      return res.status(500).json({ error: 'Erro ao reiniciar sessão', detail: err?.message });
    }
  }

  // ── PATCH: set/update webhook for an existing instance ──────────────────────
  if (req.method === 'PATCH') {
    try {
      const { name } = req.body ?? {};
      if (!name) return res.status(400).json({ error: 'Campo "name" é obrigatório no body' });

      const webhookUrl: string = process.env.EVOLUTION_WEBHOOK_URL || '';
      if (!webhookUrl) return res.status(400).json({ error: 'EVOLUTION_WEBHOOK_URL não definida no .env' });

      const ok = await EvolutionAPI.setWebhook(String(name), webhookUrl);
      if (!ok) return res.status(502).json({ error: 'Falha ao definir webhook na Evolution API' });

      return res.status(200).json({ success: true, instanceName: name, webhookUrl });
    } catch (err: any) {
      console.error('[EVOLUTION/sessions] PATCH error:', err);
      return res.status(500).json({ error: 'Erro ao definir webhook', detail: err?.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
