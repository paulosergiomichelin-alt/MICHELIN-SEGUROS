import { EvolutionAPI } from '../lib/evolutionApi.js';
import { fsUpdate } from '../lib/adminFirebase.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const name = String(req.query?.name ?? '');
  if (!name) {
    return res.status(400).json({ error: 'Query param "name" é obrigatório' });
  }

  try {
    // Always check connection state first — if already open, update Firestore and return
    const connState = await EvolutionAPI.getConnectionState(name);
    const state = (
      (connState as any)?.instance?.state ?? (connState as any)?.state ?? ''
    ).toLowerCase();

    if (state === 'open') {
      console.log(`[EVOLUTION/qr] ${name} está conectado (open) — atualizando Firestore`);
      await fsUpdate('whatsapp_sessions', name, {
        status: 'open',
        updatedAt: new Date().toISOString(),
      }).catch((err: any) =>
        console.error('[EVOLUTION/qr] fsUpdate open error:', err?.message),
      );
      return res.status(200).json({ status: 'open', base64: null, code: null });
    }

    const qr = await EvolutionAPI.getQRCode(name);
    console.log(`[EVOLUTION/qr] getQRCode(${name}) →`, JSON.stringify(qr)?.slice(0, 200));
    if (!qr) {
      return res.status(404).json({ error: 'QR Code não encontrado para a instância informada' });
    }
    return res.status(200).json({
      base64: qr.base64 ?? null,
      code: qr.code ?? null,
      status: 'qr',
    });
  } catch (err: any) {
    console.error('[EVOLUTION/qr] GET error:', err);
    return res.status(500).json({ error: 'Erro ao obter QR Code', detail: err?.message });
  }
}
