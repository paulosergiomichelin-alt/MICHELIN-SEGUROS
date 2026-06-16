import { fsUpdate, fsQuery, fsGet, fsSet } from '../lib/adminFirebase.js';
import { extractPhone, stripDDI, isGroup, isIgnoredJid, extractMessageContent, extractPhoneFromJid } from '../lib/whatsappUtils.js';
import { getSentEntry, clearSentById } from '../lib/sentMessageIds.js';
import { syncSession } from '../lib/syncService.js';
import {
  setConversation, setMessage, updateConversation, updateMessage,
  getConversation, CachedConversation, CachedMessage,
} from '../lib/conversationCache.js';

// ── Monitoramento ─────────────────────────────────────────────────────────────

let lastWebhookAt: string | null = null;
let webhookCount = 0;
let messagesProcessed = 0;
let messagesFailed = 0;
let duplicatesIgnored = 0;

export function getWebhookStats() {
  return { lastWebhookAt, webhookCount, messagesProcessed, messagesFailed, duplicatesIgnored };
}

// ── Cache de orgId por sessão ─────────────────────────────────────────────────

const orgIdCache = new Map<string, string>();

async function resolveOrgId(sessionId: string): Promise<string> {
  if (orgIdCache.has(sessionId)) return orgIdCache.get(sessionId)!;
  try {
    const session = await fsGet('whatsapp_sessions', sessionId);
    const orgId = session?.organizationId ?? 'default';
    orgIdCache.set(sessionId, orgId);
    return orgId;
  } catch {
    return 'default';
  }
}

// ── Lead helpers ──────────────────────────────────────────────────────────────

async function findOrCreateLead(
  phone: string,
  name: string,
  timestamp: string,
  sessionId: string,
  organizationId: string,
): Promise<string | null> {
  const phoneLocal = stripDDI(phone);

  let existing = await fsQuery('leads', [{ field: 'phone', value: phoneLocal }]);
  if (existing.length === 0 && phoneLocal !== phone) {
    existing = await fsQuery('leads', [{ field: 'phone', value: phone }]);
  }

  if (existing.length > 0) {
    const leadId = existing[0].id;
    await fsUpdate('leads', leadId, { lastInteraction: timestamp, updatedAt: timestamp }).catch(() => {});
    console.log(`[EVOLUTION/webhook] Lead existente: ${leadId}`);
    return leadId;
  }

  const id = `wa_${phoneLocal}_${Date.now()}`;
  await fsSet('leads', id, {
    id,
    phone: phoneLocal,
    name: name || `WhatsApp ${phoneLocal}`,
    status: 'Novo Lead',
    origin: 'whatsapp_qr',
    organizationId,
    iaActive: true,
    responsibleAgentType: 'ia',
    source: 'whatsapp_qr',
    cpf: '', birthDate: '', civilStatus: '', plate: '', chassis: '',
    zipCodeOvernight: '', isDifferentResidenceZip: false,
    fiduciaryAlienation: false, serviceUsage: false,
    youngDriverHousehold: false, isOwnerDriver: true,
    hasInsurance: false, documents: {},
    lastInteraction: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    ownerId: 'system',
  });

  console.log(`[EVOLUTION/webhook] Novo lead: ${id} (${phone}) via ${sessionId}`);
  return id;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleMessagesUpsert(event: any) {
  const sessionId: string = event.instance ?? '';
  const data: any = event.data ?? {};
  const key: any = data.key ?? {};
  const remoteJid: string = key.remoteJid ?? '';

  if (!remoteJid || isIgnoredJid(remoteJid)) {
    if (remoteJid) console.log(`[EVOLUTION/webhook] JID ignorado: ${remoteJid}`);
    return;
  }

  // @lid JIDs usam remoteJidAlt para o número de telefone real
  const remoteJidAlt: string | undefined = key.remoteJidAlt;
  const phone = extractPhoneFromJid(remoteJid, remoteJidAlt) ?? extractPhone(remoteJid);
  if (!phone || phone.endsWith('@lid')) {
    console.log(`[EVOLUTION/webhook] Sem phone para JID: ${remoteJid}`);
    return;
  }
  const fromMe: boolean = Boolean(key.fromMe);
  const msgId: string = key.id ?? `auto_${Date.now()}`;

  // ── Deduplicação: mensagem enviada pelo CRM ──────────────────────────────
  if (fromMe && msgId) {
    const sentEntry = getSentEntry(msgId);
    if (sentEntry) {
      clearSentById(msgId);
      updateMessage(sentEntry.optimisticDocId, {
        evolutionId: msgId,
        status: 'sent',
      });
      duplicatesIgnored++;
      console.log(`[EVOLUTION/webhook] Echo CRM ignorado: ${msgId} (doc: ${sentEntry.optimisticDocId})`);
      return;
    }
  }

  const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(data);

  if (fromMe && !body && !mediaUrl) return; // protocolo/reação sem conteúdo

  const timestampSec = Number(data.messageTimestamp ?? Math.floor(Date.now() / 1000));
  const timestamp = new Date(timestampSec * 1000).toISOString();
  const contactName: string = data.pushName || phone;
  const direction: 'inbound' | 'outbound' = fromMe ? 'outbound' : 'inbound';
  const conversationId = `${sessionId}_${phone}`;
  const storedMsgId = `wamsg_${msgId}`;
  const organizationId = await resolveOrgId(sessionId);

  console.log(
    `[EVOLUTION/webhook] MESSAGES_UPSERT session=${sessionId} phone=${phone} fromMe=${fromMe} type=${messageType} body="${body.slice(0, 60)}"`,
  );

  const msgDoc: CachedMessage = {
    id: storedMsgId,
    conversationId,
    sessionId,
    direction,
    messageType,
    body,
    contactName,
    phone,
    timestamp,
    status: fromMe ? 'sent' : 'received',
    organizationId,
  };
  if (mediaUrl) msgDoc.mediaUrl = mediaUrl;
  if (mimeType) msgDoc.mimeType = mimeType;
  if (fileName) msgDoc.fileName = fileName;

  setMessage(msgDoc);

  const existing = getConversation(conversationId);
  const convDoc: CachedConversation = {
    id: conversationId,
    sessionId,
    sessionName: sessionId,
    phone,
    contactName,
    lastMessage: body || `[${messageType}]`,
    lastMessageAt: timestamp,
    lastMessageDirection: direction,
    updatedAt: timestamp,
    unreadCount: direction === 'inbound' ? (existing?.unreadCount ?? 0) + 1 : (existing?.unreadCount ?? 0),
    organizationId,
    leadId: existing?.leadId,
    clienteId: existing?.clienteId,
  };
  setConversation(convDoc);

  if (!fromMe) {
    const leadId = await findOrCreateLead(phone, contactName, timestamp, sessionId, organizationId).catch((err: any) => {
      console.error('[EVOLUTION/webhook] findOrCreateLead error:', err?.message);
      return null;
    });
    if (leadId) {
      updateConversation(conversationId, { leadId });
    }
  }

  messagesProcessed++;
}

async function handleMessagesUpdate(event: any) {
  const updates: any[] = Array.isArray(event.data) ? event.data : [event.data];

  for (const update of updates) {
    const key = update?.key ?? {};
    const msgId: string = key.id ?? '';
    if (!msgId) continue;

    const rawStatus: string = String(update?.update?.status ?? '').toUpperCase();
    const statusMap: Record<string, string> = {
      PENDING: 'pending', SERVER_ACK: 'sent', DELIVERY_ACK: 'delivered',
      READ: 'read', PLAYED: 'read',
      '1': 'pending', '2': 'sent', '3': 'delivered', '4': 'read', '5': 'read',
    };
    const status = statusMap[rawStatus] ?? rawStatus.toLowerCase();
    if (!status) continue;

    updateMessage(`wamsg_${msgId}`, { status });
    console.log(`[EVOLUTION/webhook] MESSAGES_UPDATE msgId=${msgId} status=${status}`);
  }
}

async function handleConnectionUpdate(event: any) {
  const instanceName: string = event.instance ?? '';
  if (!instanceName) return;

  const rawState: string = (event.data?.state ?? '').toLowerCase();
  const statusMap: Record<string, string> = {
    open: 'open', close: 'close', closed: 'close', connecting: 'connecting', qr: 'qr',
  };
  const status = statusMap[rawState] ?? rawState;

  console.log(`[EVOLUTION/webhook] CONNECTION_UPDATE instance=${instanceName} state=${rawState} → ${status}`);

  const update: Record<string, any> = { status, updatedAt: new Date().toISOString() };

  if (rawState === 'open') {
    const instanceData = event.data?.instance ?? {};
    if (instanceData.profileName) update.profileName = instanceData.profileName;
    if (instanceData.profilePictureUrl) update.profilePicture = instanceData.profilePictureUrl;
    if (instanceData.wuid || instanceData.phone) {
      update.phoneNumber = instanceData.wuid ?? instanceData.phone;
    }
    update.connectedAt = new Date().toISOString();
  }

  if (rawState === 'close' || rawState === 'closed') {
    update.phoneNumber = null;
    update.profileName = null;
    update.profilePicture = null;
    update.qrBase64 = null;
    update.qrCode = null;
  }

  await fsUpdate('whatsapp_sessions', instanceName, update).catch((err: any) =>
    console.error('[EVOLUTION/webhook] fsUpdate sessions (CONNECTION_UPDATE) error:', err?.message),
  );

  // Auto-sync histórico quando a sessão conecta
  if (rawState === 'open') {
    console.log(`[EVOLUTION/webhook] Sessão conectada — iniciando sync automático: ${instanceName}`);
    const orgId = await resolveOrgId(instanceName);

    // Fire-and-forget: não bloqueia resposta do webhook
    syncSession(instanceName, orgId, true).then(result => {
      console.log(
        `[EVOLUTION/webhook] Auto-sync concluído: ${instanceName} — ${result.conversationsImported} conversas, ${result.messagesImported} mensagens`,
      );
    }).catch(err => {
      console.error(`[EVOLUTION/webhook] Auto-sync falhou: ${instanceName}`, err?.message);
    });
  }
}

async function handleQrcodeUpdated(event: any) {
  const instanceName: string = event.instance ?? '';
  if (!instanceName) return;

  const qrcode = event.data?.qrcode ?? {};
  console.log(`[EVOLUTION/webhook] QRCODE_UPDATED instance=${instanceName} base64 len=${qrcode.base64?.length ?? 0}`);

  await fsUpdate('whatsapp_sessions', instanceName, {
    status: 'qr',
    qrBase64: qrcode.base64 ?? null,
    qrCode: qrcode.code ?? null,
    updatedAt: new Date().toISOString(),
  }).catch((err: any) =>
    console.error('[EVOLUTION/webhook] fsUpdate sessions (QRCODE_UPDATED) error:', err?.message),
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
    const upd: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (name) upd.name = name;
    if (contact.profilePictureUrl) upd.profilePicture = contact.profilePictureUrl;

    await fsUpdate('leads', leadId, upd).catch((err: any) =>
      console.error(`[EVOLUTION/webhook] CONTACTS_UPDATE lead ${leadId}:`, err?.message),
    );
  }
}

async function handleChatsUpdate(event: any) {
  const sessionId: string = event.instance ?? '';
  if (!sessionId) return;

  const chats: any[] = Array.isArray(event.data) ? event.data : [event.data];

  for (const chat of chats) {
    const remoteJid: string = chat.remoteJid ?? chat.id ?? '';
    if (!remoteJid || isIgnoredJid(remoteJid)) continue;

    const remoteJidAlt: string | undefined = chat.remoteJidAlt ?? chat.lastMessage?.key?.remoteJidAlt;
    const phone = extractPhoneFromJid(remoteJid, remoteJidAlt) ?? extractPhone(remoteJid);
    if (!phone || phone.endsWith('@lid')) continue;

    const conversationId = `${sessionId}_${phone}`;
    const patch: Partial<CachedConversation> = { updatedAt: new Date().toISOString() };
    const unreadCount = typeof chat.unreadCount === 'number' ? chat.unreadCount : (chat.unreadMessages ?? undefined);
    if (unreadCount !== undefined) patch.unreadCount = unreadCount;
    if (chat.name || chat.pushName) patch.contactName = chat.name || chat.pushName;

    updateConversation(conversationId, patch);
  }

  console.log(`[EVOLUTION/webhook] CHATS_UPDATE session=${sessionId} chats=${chats.length}`);
}

// ── Main processor ────────────────────────────────────────────────────────────

async function processEvent(event: any) {
  lastWebhookAt = new Date().toISOString();
  webhookCount++;

  const eventType: string = (event.event ?? '').toUpperCase().replace(/\./g, '_');

  switch (eventType) {
    case 'MESSAGES_UPSERT':
      await handleMessagesUpsert(event);
      break;
    case 'MESSAGES_UPDATE':
      await handleMessagesUpdate(event);
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
    case 'CHATS_UPDATE':
    case 'CHATS_UPSERT':
      await handleChatsUpdate(event);
      break;
    default:
      console.log(`[EVOLUTION/webhook] Evento não tratado: ${eventType}`);
  }
}

// ── Express handler ───────────────────────────────────────────────────────────

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(200).json({ status: 'ok' });

  const body = req.body;
  if (!body) return;

  const events: any[] = Array.isArray(body) ? body : [body];

  Promise.all(
    events.map(event =>
      processEvent(event).catch(err => {
        messagesFailed++;
        console.error('[EVOLUTION/webhook] processEvent error:', err);
      }),
    ),
  ).catch(err => console.error('[EVOLUTION/webhook] Unhandled error:', err));
}
