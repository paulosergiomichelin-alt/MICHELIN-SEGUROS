import type { IncomingMessage, ServerResponse } from 'http';

export default function handler(req: IncomingMessage & { query?: any; body?: any }, res: ServerResponse) {
  if (req.method === 'GET') {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('[WHATSAPP_WEBHOOK] Verificação OK');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.warn('[WHATSAPP_WEBHOOK] Token inválido');
      res.writeHead(403);
      res.end();
    }
    return;
  }

  if (req.method === 'POST') {
    let rawBody = '';
    req.on('data', (chunk) => { rawBody += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(rawBody);

        if (body?.object === 'whatsapp_business_account') {
          // Responde imediatamente — Meta exige 200 em até 20s
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));

          // Processa de forma assíncrona depois do ack
          processEvents(body).catch(console.error);
        } else {
          res.writeHead(200);
          res.end();
        }
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  res.writeHead(405);
  res.end();
}

async function processEvents(body: any) {
  const entries: any[] = body.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      const { messages = [], statuses = [], metadata } = change.value ?? {};
      const phoneNumberId: string = metadata?.phone_number_id ?? '';

      for (const msg of messages) {
        const from: string  = msg.from;
        const text: string  = msg.text?.body ?? `[${msg.type}]`;
        const wamid: string = msg.id;
        console.log(`[WHATSAPP_WEBHOOK] Mensagem de ${from}: ${text} (wamid=${wamid}, phone_id=${phoneNumberId})`);
        // TODO: criar/atualizar lead no Firestore via Firebase Admin SDK
      }

      for (const status of statuses) {
        console.log(`[WHATSAPP_WEBHOOK] Status ${status.id} -> ${status.status}`);
      }
    }
  }
}
