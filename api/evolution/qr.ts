import { EvolutionAPI } from '../lib/evolutionApi.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const name = String(req.query?.name ?? '');
  if (!name) {
    return res.status(400).json({ error: 'Query param "name" é obrigatório' });
  }

  try {
    const qr = await EvolutionAPI.getQRCode(name);
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
