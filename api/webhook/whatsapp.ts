import { fsSet, fsUpdate, fsQuery } from '../lib/adminFirebase';

export default function handler(req: any, res: any) {
  // ── GET: verificação de propriedade ──────────────────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query?.['hub.mode'];
    const token     = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    const expected  = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!expected) {
      console.error('[WEBHOOK] WHATSAPP_VERIFY_TOKEN não definida');
      return res.status(500).json({ error: 'Server misconfigured' });
    }
    if (mode === 'subscribe' && token === expected) {
      console.log('[WEBHOOK] Verificação OK');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── POST: recebe eventos do WhatsApp ──────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body;
    if (body?.object === 'whatsapp_business_account') {
      res.status(200).json({ status: 'ok' });
      processEvents(body).catch(err => console.error('[WEBHOOK] Erro ao processar evento:', err));
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

      const { messages = [], statuses = [] } = change.value ?? {};

      for (const msg of messages) {
        await handleIncomingMessage(msg).catch(e =>
          console.error('[WEBHOOK] handleIncomingMessage error:', e)
        );
      }

      for (const status of statuses) {
        console.log(`[WEBHOOK] Status ${status.id} → ${status.status}`);
      }
    }
  }
}

async function handleIncomingMessage(msg: any) {
  const from:      string = msg.from;
  const text:      string = msg.text?.body ?? `[${msg.type}]`;
  const wamid:     string = msg.id;
  const timestamp: string = new Date(Number(msg.timestamp) * 1000).toISOString();

  console.log(`[WEBHOOK] Mensagem de ${from}: ${text}`);

  const lead = await findOrCreateLead(from, timestamp, msg.profile?.name);
  await saveMessage(lead.id, lead.organizationId, text, wamid, timestamp);
}

async function findOrCreateLead(
  phone: string,
  timestamp: string,
  profileName?: string,
): Promise<{ id: string; organizationId: string }> {
  const orgId = 'default';

  const existing = await fsQuery('leads', [
    { field: 'phone',          value: phone  },
    { field: 'organizationId', value: orgId  },
  ]);

  if (existing.length > 0) {
    await fsUpdate('leads', existing[0].id, { updatedAt: timestamp });
    return { id: existing[0].id, organizationId: orgId };
  }

  const id   = `wa_${phone}_${Date.now()}`;
  const name = profileName || `WhatsApp ${phone}`;

  await fsSet('leads', id, {
    id,
    phone,
    name,
    status:               'Novo Lead',
    organizationId:       orgId,
    iaActive:             true,
    responsibleAgentType: 'ia',
    source:               'whatsapp_webhook',
    createdAt:            timestamp,
    updatedAt:            timestamp,
    ownerId:              'system',
  });

  console.log(`[WEBHOOK] Novo lead criado: ${id} (${phone})`);
  return { id, organizationId: orgId };
}

async function saveMessage(
  leadId: string,
  organizationId: string,
  text: string,
  wamid: string,
  timestamp: string,
) {
  const dup = await fsQuery('messages', [{ field: 'wamid', value: wamid }]);
  if (dup.length > 0) {
    console.log(`[WEBHOOK] Mensagem ${wamid} já salva, ignorando`);
    return;
  }

  const id = `msg_${wamid}`;
  await fsSet('messages', id, {
    id,
    leadId,
    organizationId,
    sender:    'lead',
    text,
    timestamp,
    wamid,
    channel:   'whatsapp',
    createdAt: timestamp,
  });

  console.log(`[WEBHOOK] Mensagem salva: ${id} → lead ${leadId}`);
}
