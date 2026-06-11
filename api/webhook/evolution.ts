import { fsSet, fsUpdate, fsQuery } from '../lib/adminFirebase.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function extractPhone(jid: string): string {
  return jid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@c\.us$/, '')
    .replace(/:\d+$/, '');
}

function isGroup(jid: string): boolean {
  return jid.endsWith('@g.us');
}

// ── event processors ─────────────────────────────────────────────────────────

async function handleMessagesUpsert(event: any) {
  const sessionId: string = event.instance ?? '';
  const data: any = event.data ?? {};
  const key: any = data.key ?? {};
  const remoteJid: string = key.remoteJid ?? '';

  if (!remoteJid) return;
  if (isGroup(remoteJid)) {
    console.log(`[EVOLUTION/webhook] Mensagem de grupo ignorada: ${remoteJid}`);
    return;
  }

  const phone = extractPhone(remoteJid);
  const fromMe: boolean = Boolean(key.fromMe);
  const msgId: string = key.id ?? `auto_${Date.now()}`;

  // Extract text body from various message types
  const body: string =
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    data.message?.imageMessage?.caption ||
    data.message?.videoMessage?.caption ||
    data.message?.documentMessage?.caption ||
    '';

  // Skip outbound messages without text (status updates, reactions, etc.)
  if (fromMe && !body) return;

  const timestampSec: number = Number(data.messageTimestamp ?? Math.floor(Date.now() / 1000));
  const timestamp = new Date(timestampSec * 1000).toISOString();
  const contactName: string = data.pushName || phone;
  const direction: 'inbound' | 'outbound' = fromMe ? 'outbound' : 'inbound';
  const conversationId = `${sessionId}_${phone}`;
  const storedMsgId = `wamsg_${msgId}`;

  console.log(
    `[EVOLUTION/webhook] MESSAGES_UPSERT session=${sessionId} phone=${phone} fromMe=${fromMe} body="${body.slice(0, 80)}"`,
  );

  // Save message (idempotent via fixed id)
  await fsSet('whatsapp_messages', storedMsgId, {
    id: storedMsgId,
    conversationId,
    sessionId,
    direction,
    messageType: 'text',
    body,
    contactName,
    phone,
    timestamp,
    status: 'received',
  });

  // Upsert conversation
  const convUpdate: Record<string, any> = {
    id: conversationId,
    sessionId,
    phone,
    contactName,
    lastMessage: body,
    lastMessageAt: timestamp,
    lastMessageDirection: direction,
    updatedAt: timestamp,
  };
  if (direction === 'inbound') {
    // We can't atomically increment with the REST API — do a read-modify-write
    // For simplicity we just mark unread flag; UI can compute count from messages
    convUpdate.hasUnread = true;
  }

  await fsSet('whatsapp_conversations', conversationId, convUpdate).catch((err: any) =>
    console.error('[EVOLUTION/webhook] fsSet whatsapp_conversations error:', err?.message),
  );

  // Find or create lead
  if (!fromMe) {
    await findOrCreateLead(phone, contactName, timestamp).catch((err: any) =>
      console.error('[EVOLUTION/webhook] findOrCreateLead error:', err?.message),
    );
  }
}

async function findOrCreateLead(phone: string, name: string, timestamp: string) {
  const existing = await fsQuery('leads', [{ field: 'phone', value: phone }]);
  if (existing.length > 0) {
    console.log(`[EVOLUTION/webhook] Lead existente: ${existing[0].id}`);
    return;
  }

  const id = `wa_${phone}_${Date.now()}`;
  await fsSet('leads', id, {
    id,
    phone,
    name: name || `WhatsApp ${phone}`,
    status: 'Novo Lead',
    origin: 'whatsapp_qr',
    organizationId: 'default',
    iaActive: true,
    responsibleAgentType: 'ia',
    source: 'whatsapp_qr',
    createdAt: timestamp,
    updatedAt: timestamp,
    ownerId: 'system',
  });

  console.log(`[EVOLUTION/webhook] Novo lead criado: ${id} (${phone})`);
}

async function handleConnectionUpdate(event: any) {
  const instanceName: string = event.instance ?? '';
  if (!instanceName) return;

  const rawState: string = (event.data?.state ?? '').toLowerCase();
  // Map Evolution states to our status
  const statusMap: Record<string, string> = {
    open: 'open',
    close: 'close',
    closed: 'close',
    connecting: 'connecting',
    qr: 'qr',
  };
  const status = statusMap[rawState] ?? rawState;

  console.log(`[EVOLUTION/webhook] CONNECTION_UPDATE instance=${instanceName} state=${rawState} → status=${status}`);

  const update: Record<string, any> = {
    status,
    updatedAt: new Date().toISOString(),
  };

  // If connected, pull profile info if available
  if (rawState === 'open') {
    const instanceData = event.data?.instance ?? {};
    if (instanceData.profileName) update.profileName = instanceData.profileName;
    if (instanceData.profilePictureUrl) update.profilePicture = instanceData.profilePictureUrl;
    if (instanceData.wuid || instanceData.phone) {
      update.phoneNumber = instanceData.wuid ?? instanceData.phone;
    }
  }

  await fsUpdate('whatsapp_sessions', instanceName, update).catch((err: any) =>
    console.error('[EVOLUTION/webhook] fsUpdate whatsapp_sessions (CONNECTION_UPDATE) error:', err?.message),
  );
}

async function handleQrcodeUpdated(event: any) {
  const instanceName: string = event.instance ?? '';
  if (!instanceName) return;

  const qrcode = event.data?.qrcode ?? {};
  console.log(`[EVOLUTION/webhook] QRCODE_UPDATED instance=${instanceName}`);

  await fsUpdate('whatsapp_sessions', instanceName, {
    status: 'qr',
    qrBase64: qrcode.base64 ?? null,
    qrCode: qrcode.code ?? null,
    updatedAt: new Date().toISOString(),
  }).catch((err: any) =>
    console.error('[EVOLUTION/webhook] fsUpdate whatsapp_sessions (QRCODE_UPDATED) error:', err?.message),
  );
}

async function handleContactsUpdate(event: any) {
  const contacts: any[] = Array.isArray(event.data) ? event.data : [];
  for (const contact of contacts) {
    const jid: string = contact.id ?? '';
    if (!jid || isGroup(jid)) continue;

    const phone = extractPhone(jid);
    const name: string = contact.pushName || contact.notify || '';

    if (!phone || !name) continue;

    const existing = await fsQuery('leads', [{ field: 'phone', value: phone }]).catch(() => [] as any[]);
    if (existing.length === 0) continue;

    const leadId: string = existing[0].id;
    const update: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (name) update.name = name;
    if (contact.profilePictureUrl) update.profilePicture = contact.profilePictureUrl;

    await fsUpdate('leads', leadId, update).catch((err: any) =>
      console.error(`[EVOLUTION/webhook] fsUpdate leads (CONTACTS_UPDATE) ${leadId}:`, err?.message),
    );

    console.log(`[EVOLUTION/webhook] Lead ${leadId} atualizado via CONTACTS_UPDATE`);
  }
}

// ── main async processor ─────────────────────────────────────────────────────

async function processEvent(event: any) {
  const eventType: string = (event.event ?? '').toUpperCase();

  switch (eventType) {
    case 'MESSAGES_UPSERT':
      await handleMessagesUpsert(event);
      break;
    case 'CONNECTION_UPDATE':
      await handleConnectionUpdate(event);
      break;
    case 'QRCODE_UPDATED':
      await handleQrcodeUpdated(event);
      break;
    case 'CONTACTS_UPDATE':
      await handleContactsUpdate(event);
      break;
    default:
      console.log(`[EVOLUTION/webhook] Evento não tratado: ${eventType}`);
  }
}

// ── Vercel handler ────────────────────────────────────────────────────────────

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Respond immediately — Evolution API expects a fast 200
  res.status(200).json({ status: 'ok' });

  const body = req.body;
  if (!body) return;

  // Evolution API sends either a single event object or an array
  const events: any[] = Array.isArray(body) ? body : [body];

  Promise.all(
    events.map(event =>
      processEvent(event).catch(err =>
        console.error('[EVOLUTION/webhook] processEvent error:', err),
      ),
    ),
  ).catch(err => console.error('[EVOLUTION/webhook] Unhandled error:', err));
}
