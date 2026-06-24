import { EvolutionAPI } from '../lib/evolutionApi.js';

// Serve um Buffer com suporte a HTTP Range Requests (necessário para <audio>/<video>)
function serveBuffer(req: any, res: any, data: Buffer, mime: string) {
  const total = data.length;
  const rangeHeader: string | undefined = req.headers['range'];

  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  if (!rangeHeader) {
    res.setHeader('Content-Length', total);
    res.status(200);
    return res.end(data);
  }

  // Parsear "bytes=start-end"
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    res.setHeader('Content-Range', `bytes */${total}`);
    return res.status(416).end();
  }

  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end   = match[2] ? parseInt(match[2], 10) : total - 1;

  if (start > end || start >= total || end >= total) {
    res.setHeader('Content-Range', `bytes */${total}`);
    return res.status(416).end();
  }

  const chunk = data.subarray(start, end + 1);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', chunk.length);
  res.status(206);
  return res.end(chunk);
}

// Cache em memória: chave = "session:msgId" → base64 decodificado
const mediaCache = new Map<string, { data: Buffer; mime: string; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos
const CACHE_MAX = 200; // máximo de entradas para evitar OOM

// Map de promises pendentes para deduplicar requests concorrentes para o mesmo arquivo
const inflight = new Map<string, Promise<{ data: Buffer; mime: string } | null>>();

// Evicta entradas mais antigas quando cache cheio
function evictOldestIfNeeded() {
  if (mediaCache.size < CACHE_MAX) return;
  let oldestKey = '';
  let oldestTs = Infinity;
  for (const [k, v] of mediaCache) {
    if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
  }
  if (oldestKey) mediaCache.delete(oldestKey);
}

// Limpeza periódica de entradas expiradas
setInterval(() => {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [k, v] of mediaCache) {
    if (v.ts < cutoff) mediaCache.delete(k);
  }
}, 5 * 60 * 1000);

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
    return serveBuffer(req, res, cached.data, cached.mime);
  }

  try {
    // Dedup: se já há um fetch em andamento para esta mídia, aguarda o mesmo
    let pending = inflight.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        // 1. Buscar a mensagem completa (key + message) na Evolution API
        const msgs = await EvolutionAPI.findMessageById(sessionName, waId);
        if (!msgs || !msgs.key || !msgs.message) return null;

        // 2. Pedir base64 descriptografado
        const result = await EvolutionAPI.getMediaBase64(sessionName, msgs);
        if (!result?.base64) return null;

        const mime = result.mimetype ?? 'application/octet-stream';
        const data = Buffer.from(result.base64, 'base64');

        evictOldestIfNeeded();
        mediaCache.set(cacheKey, { data, mime, ts: Date.now() });
        return { data, mime };
      })().finally(() => inflight.delete(cacheKey));
      inflight.set(cacheKey, pending);
    }

    const media = await pending;
    if (!media) return res.status(404).json({ error: 'Mídia não disponível' });

    return serveBuffer(req, res, media.data, media.mime);
  } catch (err: any) {
    console.error('[EVOLUTION/media] erro:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
}
