import { getAdminDb } from '../lib/adminFirebase';

export default function handler(req: any, res: any) {
  // ── GET: verificação de propriedade (chamado 1× ao cadastrar webhook) ──────
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

  // ── POST: recebe eventos do WhatsApp em tempo real ────────────────────────
  if (req.method === 'POST') {
    const body = req.body;
    if (body?.object === 'whatsapp_business_account') {
      // Responde 200 imediatamente (Meta exige em ≤20s)
      res.status(200).json({ status: 'ok' });
      processEvents(body).catch(err => console.error('[WEBHOOK] Erro ao processar evento:', err));
    } else {
      res.status(200).end();
    }
    return;
  }

  res.status(405).end();
}

// ── Processamento assíncrono após o ack ──────────────────────────────────────

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
  const from:      string = msg.from;                              // ex: "5567996748603"
  const text:      string = msg.text?.body ?? `[${msg.type}]`;
  const wamid:     string = msg.id;
  const timestamp: string = new Date(Number(msg.timestamp) * 1000).toISOString();

  console.log(`[WEBHOOK] Mensagem de ${from}: ${text}`);

  const db = getAdminDb();

  // 1. Busca lead existente pelo telefone
  const lead = await findOrCreateLead(db, from, timestamp, msg.profile?.name);

  // 2. Salva mensagem (com deduplicação via wamid)
  await saveMessage(db, lead.id, lead.organizationId, text, wamid, timestamp);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findOrCreateLead(
  db: FirebaseFirestore.Firestore,
  phone: string,
  timestamp: string,
  profileName?: string,
): Promise<{ id: string; organizationId: string }> {
  const orgId = 'default';

  // Procura lead existente
  const snap = await db.collection('leads')
    .where('phone', '==', phone)
    .where('organizationId', '==', orgId)
    .limit(1)
    .get();

  if (!snap.empty) {
    const existing = snap.docs[0];
    // Atualiza updatedAt
    await existing.ref.update({ updatedAt: timestamp });
    return { id: existing.id, organizationId: orgId };
  }

  // Cria novo lead
  const id   = `wa_${phone}_${Date.now()}`;
  const name = profileName || `WhatsApp ${phone}`;

  const lead = {
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
  };

  await db.collection('leads').doc(id).set(lead);
  console.log(`[WEBHOOK] Novo lead criado: ${id} (${phone})`);
  return { id, organizationId: orgId };
}

async function saveMessage(
  db: FirebaseFirestore.Firestore,
  leadId: string,
  organizationId: string,
  text: string,
  wamid: string,
  timestamp: string,
) {
  // Deduplicação: ignora se o wamid já existe
  const dup = await db.collection('messages')
    .where('wamid', '==', wamid)
    .limit(1)
    .get();

  if (!dup.empty) {
    console.log(`[WEBHOOK] Mensagem ${wamid} já salva, ignorando`);
    return;
  }

  const id = `msg_${wamid}`;
  await db.collection('messages').doc(id).set({
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
