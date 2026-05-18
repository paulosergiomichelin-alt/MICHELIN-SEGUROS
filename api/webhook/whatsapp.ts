export default function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const mode      = req.query?.['hub.mode'];
    const token     = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];

    const expected = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!expected) {
      console.error('[WHATSAPP_WEBHOOK] WHATSAPP_VERIFY_TOKEN não definido nas env vars');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    if (mode === 'subscribe' && token === expected) {
      console.log('[WHATSAPP_WEBHOOK] Verificação OK');
      return res.status(200).send(challenge);
    }

    console.warn('[WHATSAPP_WEBHOOK] Token inválido. Recebido:', token, '| Esperado:', expected);
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'POST') {
    const body = req.body;

    if (body?.object === 'whatsapp_business_account') {
      res.status(200).json({ status: 'ok' });
      processEvents(body).catch(console.error);
    } else {
      res.status(200).end();
    }
    return;
  }

  res.status(405).end();
}

async function processEvents(body: any) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const { messages = [], statuses = [], metadata } = change.value ?? {};
      for (const msg of messages) {
        console.log(`[WHATSAPP] Mensagem de ${msg.from}: ${msg.text?.body ?? `[${msg.type}]`}`);
      }
      for (const status of statuses) {
        console.log(`[WHATSAPP] Status ${status.id} -> ${status.status}`);
      }
    }
  }
}
