import { fsSet, fsUpdate, fsQuery } from '../lib/adminFirebase.js';
import { MetaAPI } from '../lib/metaApi.js';

// ─── Verify (GET) ─────────────────────────────────────────────────────────────
export function handleVerify(req: any, res: any) {
  const mode      = req.query?.['hub.mode'];
  const token     = req.query?.['hub.verify_token'];
  const challenge = req.query?.['hub.challenge'];
  const expected  = process.env.META_VERIFY_TOKEN ?? process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) {
    console.error('[WEBHOOK/META] Verify token não definido');
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (mode === 'subscribe' && token === expected) {
    console.log('[WEBHOOK/META] Verificação OK ✓');
    return res.status(200).send(challenge);
  }
  console.warn(`[WEBHOOK/META] Token inválido. Esperado: ${expected}, recebido: ${token}`);
  return res.status(403).json({ error: 'Forbidden' });
}

// ─── Event (POST) ─────────────────────────────────────────────────────────────
export function handleEvent(req: any, res: any) {
  const body = req.body;
  if (body?.object === 'whatsapp_business_account') {
    res.status(200).json({ status: 'ok' });
    processWebhook(body).catch(err =>
      console.error('[WEBHOOK/META] Erro ao processar evento:', err)
    );
  } else {
    res.status(200).end();
  }
}

// ─── Default export (for app.all) ────────────────────────────────────────────
export default function handler(req: any, res: any) {
  if (req.method === 'GET')  return handleVerify(req, res);
  if (req.method === 'POST') return handleEvent(req, res);
  res.status(405).end();
}

// ─── Core processing ──────────────────────────────────────────────────────────
async function processWebhook(body: any) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      const val = change.value ?? {};
      const contacts: any[] = val.contacts ?? [];
      const messages: any[] = val.messages ?? [];
      const statuses: any[] = val.statuses ?? [];

      // Build profile name map from contacts array
      const profileMap: Record<string, string> = {};
      for (const c of contacts) {
        if (c.wa_id) profileMap[c.wa_id] = c.profile?.name ?? '';
      }

      for (const msg of messages) {
        await handleIncomingMessage(msg, profileMap[msg.from]).catch(err =>
          console.error('[WEBHOOK/META] handleIncomingMessage error:', err)
        );
      }

      for (const status of statuses) {
        await handleStatus(status).catch(err =>
          console.error('[WEBHOOK/META] handleStatus error:', err)
        );
      }
    }
  }
}

// ─── Incoming message ─────────────────────────────────────────────────────────
async function handleIncomingMessage(msg: any, profileName?: string) {
  const from:      string = msg.from; // phone without +
  const wamid:     string = msg.id;
  const ts:        string = new Date(Number(msg.timestamp) * 1000).toISOString();
  const msgType:   string = msg.type ?? 'unknown';

  const { text, mediaId, mimeType, fileName } = extractContent(msg);

  console.log(`[WEBHOOK/META] ← ${msgType} de ${from}: "${text.slice(0, 80)}"`);

  // Dedup
  const existing = await fsQuery('messages', [{ field: 'wamid', value: wamid }]);
  if (existing.length > 0) {
    console.log(`[WEBHOOK/META] Msg ${wamid} já existe, ignorando`);
    return;
  }

  const organizationId = process.env.META_ORG_ID ?? 'default';
  const lead = await findOrCreateLead(from, organizationId, ts, profileName);

  const conversationId = `meta_${from}`;
  const msgId = `meta_in_${wamid}`;

  let mediaUrl: string | null = null;
  if (mediaId) {
    const media = await MetaAPI.downloadMedia(mediaId).catch(() => null);
    mediaUrl = media?.url ?? null;
  }

  await fsSet('messages', msgId, {
    id: msgId,
    leadId: lead.id,
    organizationId,
    sender: 'lead',
    channel: 'whatsapp_meta',
    messageType: msgType,
    text,
    wamid,
    status: 'received',
    timestamp: ts,
    conversationId,
    direction: 'inbound',
    ...(mediaUrl  ? { mediaUrl }  : {}),
    ...(mimeType  ? { mimeType }  : {}),
    ...(fileName  ? { fileName }  : {}),
    createdAt: ts,
  });

  await fsUpdate('leads', lead.id, {
    lastMessage: text.slice(0, 200),
    lastMessageAt: ts,
    lastMessageDirection: 'inbound',
    lastInteractionAt: ts,
    unreadCount: (lead.unreadCount ?? 0) + 1,
    updatedAt: ts,
  });

  // Auto mark-as-read
  MetaAPI.markAsRead(wamid).catch(() => {});
}

// ─── Status update ────────────────────────────────────────────────────────────
async function handleStatus(status: any) {
  const wamid      = status.id;
  const newStatus  = status.status; // sent | delivered | read | failed
  const phone      = status.recipient_id;
  const ts         = new Date(Number(status.timestamp) * 1000).toISOString();

  console.log(`[WEBHOOK/META] Status ${wamid} → ${newStatus}`);

  // Update message status in Firestore
  const docs = await fsQuery('messages', [{ field: 'wamid', value: wamid }]);
  for (const doc of docs) {
    await fsUpdate('messages', doc.id, { status: newStatus, statusUpdatedAt: ts });
  }

  if (newStatus === 'failed') {
    const errors = status.errors ?? [];
    console.error(`[WEBHOOK/META] Entrega falhou para ${phone}:`, JSON.stringify(errors));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractContent(msg: any): {
  text: string;
  mediaId: string | null;
  mimeType: string | null;
  fileName: string | null;
} {
  const type = msg.type;

  if (type === 'text') {
    return { text: msg.text?.body ?? '', mediaId: null, mimeType: null, fileName: null };
  }

  if (type === 'image') {
    return {
      text: msg.image?.caption ?? '[imagem]',
      mediaId: msg.image?.id ?? null,
      mimeType: msg.image?.mime_type ?? 'image/jpeg',
      fileName: null,
    };
  }

  if (type === 'document') {
    return {
      text: msg.document?.caption ?? msg.document?.filename ?? '[documento]',
      mediaId: msg.document?.id ?? null,
      mimeType: msg.document?.mime_type ?? 'application/octet-stream',
      fileName: msg.document?.filename ?? 'arquivo',
    };
  }

  if (type === 'audio' || type === 'voice') {
    return {
      text: '[áudio]',
      mediaId: msg.audio?.id ?? msg.voice?.id ?? null,
      mimeType: msg.audio?.mime_type ?? msg.voice?.mime_type ?? 'audio/ogg',
      fileName: null,
    };
  }

  if (type === 'video') {
    return {
      text: msg.video?.caption ?? '[vídeo]',
      mediaId: msg.video?.id ?? null,
      mimeType: msg.video?.mime_type ?? 'video/mp4',
      fileName: null,
    };
  }

  if (type === 'sticker') {
    return {
      text: '[sticker]',
      mediaId: msg.sticker?.id ?? null,
      mimeType: msg.sticker?.mime_type ?? 'image/webp',
      fileName: null,
    };
  }

  if (type === 'location') {
    const { latitude, longitude, name, address } = msg.location ?? {};
    return {
      text: `[localização] ${name ?? ''} ${address ?? ''} (${latitude}, ${longitude})`.trim(),
      mediaId: null, mimeType: null, fileName: null,
    };
  }

  if (type === 'contacts') {
    const names = (msg.contacts ?? []).map((c: any) =>
      `${c.name?.formatted_name ?? ''}`.trim()
    ).join(', ');
    return { text: `[contato] ${names}`, mediaId: null, mimeType: null, fileName: null };
  }

  if (type === 'button') {
    return { text: msg.button?.text ?? '[botão]', mediaId: null, mimeType: null, fileName: null };
  }

  if (type === 'interactive') {
    const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
    return {
      text: reply?.title ?? msg.interactive?.type ?? '[interativo]',
      mediaId: null, mimeType: null, fileName: null,
    };
  }

  if (type === 'order') {
    return { text: '[pedido]', mediaId: null, mimeType: null, fileName: null };
  }

  if (type === 'system') {
    return { text: msg.system?.body ?? '[sistema]', mediaId: null, mimeType: null, fileName: null };
  }

  return { text: `[${type}]`, mediaId: null, mimeType: null, fileName: null };
}

interface LeadRecord {
  id: string;
  organizationId: string;
  unreadCount?: number;
}

async function findOrCreateLead(
  phone: string,
  organizationId: string,
  now: string,
  profileName?: string,
): Promise<LeadRecord> {
  const existing = await fsQuery('leads', [
    { field: 'phone',          value: phone },
    { field: 'organizationId', value: organizationId },
  ]);

  if (existing.length > 0) {
    return existing[0] as LeadRecord;
  }

  const id   = `wa_${phone}_${Date.now()}`;
  const name = profileName?.trim() || `WhatsApp ${phone}`;

  await fsSet('leads', id, {
    id, phone, name,
    status: 'Novo Lead',
    organizationId,
    iaActive: false,
    responsibleAgentType: 'human',
    source: 'whatsapp_meta',
    channel: 'whatsapp_meta',
    createdAt: now,
    updatedAt: now,
    ownerId: 'system',
    unreadCount: 0,
  });

  console.log(`[WEBHOOK/META] Novo lead criado: ${id} (${phone})`);
  return { id, organizationId, unreadCount: 0 };
}
