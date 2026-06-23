import { EvolutionAPI } from '../lib/evolutionApi.js';
import { createLogger, errCtx } from '../lib/logger.js';

const log = createLogger('evolution/avatar');

type CacheEntry =
  | { type: 'hit'; buf: Buffer; mime: string; ts: number }
  | { type: 'miss'; ts: number };

const cache = new Map<string, CacheEntry>();
const TTL = 2 * 60 * 60 * 1000; // 2h
const MISS_TTL = 30 * 60 * 1000; // 30min — não tenta de novo tão cedo

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();
  const { session, phone } = req.query ?? {};
  if (!session || !phone) return res.status(400).end();

  const key = `${session}:${phone}`;
  const hit = cache.get(key);

  if (hit) {
    const age = Date.now() - hit.ts;
    if (hit.type === 'miss' && age < MISS_TTL) {
      return res.status(404).end();
    }
    if (hit.type === 'hit' && age < TTL) {
      res.setHeader('Content-Type', hit.mime);
      res.setHeader('Cache-Control', 'public, max-age=7200');
      return res.end(hit.buf);
    }
  }

  try {
    const url = await EvolutionAPI.fetchProfilePicture(String(session), String(phone));
    if (!url) {
      log.debug('Avatar não encontrado na Evolution API', { session, phone });
      cache.set(key, { type: 'miss', ts: Date.now() });
      return res.status(404).end();
    }

    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      log.debug('CDN retornou erro ao buscar avatar', { session, phone, status: r.status, url: url.slice(0, 80) });
      cache.set(key, { type: 'miss', ts: Date.now() });
      return res.status(404).end();
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get('content-type') || 'image/jpeg';

    cache.set(key, { type: 'hit', buf, mime, ts: Date.now() });

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=7200');
    return res.end(buf);
  } catch (err: any) {
    log.warn('Erro ao buscar avatar', { session, phone, ...errCtx(err) });
    cache.set(key, { type: 'miss', ts: Date.now() });
    return res.status(404).end();
  }
}
