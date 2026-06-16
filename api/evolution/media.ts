import { EvolutionAPI } from '../lib/evolutionApi.js';

// Cache em memória: chave = "session:msgId" → base64 decodificado
const mediaCache = new Map<string, { data: Buffer; mime: string; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();

  const { session, msgId } = req.query ?? {};
  if (!session || !msgId) return res.status(400).json({ error: 'session e msgId obrigatórios' });

  const sessionName = String(session);
  const waId = String(msgId).replace(/^wamsg_/, ''); // strip prefix if present
  const cacheKey = `${sessionName}:${waId}`;

  // Servir do cache se disponível
  const cached = mediaCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.setHeader('Content-Type', cached.mime);
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.end(cached.data);
  }

  try {
    // 1. Buscar a mensagem completa (key + message) na Evolution API
    const msgs = await EvolutionAPI.findMessageById(sessionName, waId);
    if (!msgs || !msgs.key || !msgs.message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    // 2. Pedir base64 descriptografado
    const result = await EvolutionAPI.getMediaBase64(sessionName, msgs);
    if (!result?.base64) {
      return res.status(404).json({ error: 'Mídia não disponível' });
    }

    const mime = result.mimetype ?? 'application/octet-stream';
    const data = Buffer.from(result.base64, 'base64');

    mediaCache.set(cacheKey, { data, mime: mime, ts: Date.now() });

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.end(data);
  } catch (err: any) {
    console.error('[EVOLUTION/media] erro:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
}
