// Proxy pra baixar documentos do Firebase Storage no backend.
// O navegador não consegue dar fetch() direto na URL pública do Storage
// (CORS não configurado no bucket), então esse endpoint baixa o arquivo
// server-side — sem restrição de CORS entre servidores — e devolve os bytes.
const ALLOWED_HOSTS = ['firebasestorage.googleapis.com'];

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.query?.url;
  const url = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  if (!url) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório' });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'URL inválida' });
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    return res.status(400).json({ error: 'Host não permitido para este proxy' });
  }

  try {
    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Falha ao baixar documento (${upstream.status})` });
    }
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[documents/fetch] error:', err);
    return res.status(502).json({ error: 'Erro ao baixar documento', detail: err?.message });
  }
}
