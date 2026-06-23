import { fsUpdate, fsQuery, fsGet, fsSet } from '../lib/adminFirebase.js';
import { extractPhone, stripDDI, isGroup, isIgnoredJid, extractMessageContent, extractPhoneFromJid, mediaLabel } from '../lib/whatsappUtils.js';
import { getSentEntry, clearSentById, trackForStatusUpdates, getOptimisticId } from '../lib/sentMessageIds.js';
import { syncSession } from '../lib/syncService.js';
import { emitToSession } from '../lib/socketRegistry.js';
import {
  setConversation, updateConversation, updateMessage, deleteMessage,
  getConversation, findConversationsByPhone,
  CachedConversation, CachedMessage, setMessage,
} from '../lib/conversationCache.js';
import { createLogger, errCtx } from '../lib/logger.js';

const log = createLogger('evolution/webhook');

// ── Monitoramento ─────────────────────────────────────────────────────────────

let lastWebhookAt: string | null = null;
let webhookCount = 0;
let messagesProcessed = 0;
let messagesFailed = 0;
let duplicatesIgnored = 0;

export function getWebhookStats() {
  return { lastWebhookAt, webhookCount, messagesProcessed, messagesFailed, duplicatesIgnored };
}

// ── Sessões ativas (sem Firestore) ────────────────────────────────────────────

// Map<sessionName, orgId> — populado via CONNECTION_UPDATE
const activeSessions = new Map<string, string>();

export function getActiveSessions(): Map<string, string> {
  return activeSessions;
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
  } catch (err) {
    log.warn('resolveOrgId falhou, usando default', { sessionId, ...errCtx(err) });
    return 'default';
  }
}

// ── Lead helpers ──────────────────────────────────────────────────────────────

// Apenas vincula conversa a lead existente — criação é sempre manual
async function findExistingLead(phone: string, timestamp: string): Promise<string | null> {
  const phoneLocal = stripDDI(phone);

  let existing = await fsQuery('leads', [{ field: 'phone', value: phoneLocal }]);
  if (existing.length === 0 && phoneLocal !== phone) {
    existing = await fsQuery('leads', [{ field: 'phone', value: phone }]);
  }

  if (existing.length > 0) {
    const leadId = existing[0].id;
    await fsUpdate('leads', leadId, { lastInteraction: timestamp, updatedAt: timestamp }).catch(() => {});
    return leadId;
  }

  return null;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleMessagesUpsert(event: any) {
  const sessionId: string = event.instance ?? '';
  const data: any = event.data ?? {};
  const key: any = data.key ?? {};
  const remoteJid: string = key.remoteJid ?? '';

  if (!remoteJid || isIgnoredJid(remoteJid)) return;

  const remoteJidAlt: string | undefined = key.remoteJidAlt;
  const phone = extractPhoneFromJid(remoteJid, remoteJidAlt) ?? extractPhone(remoteJid);
  if (!phone || phone.endsWith('@lid')) return;

  const groupChat = remoteJid.endsWith('@g.us');
  const fromMe: boolean = Boolean(key.fromMe);
  const msgId: string = key.id ?? `auto_${Date.now()}`;

  // Dedup: echo de mensagem enviada pelo CRM
  if (fromMe && msgId) {
    const sentEntry = getSentEntry(msgId);
    if (sentEntry) {
      clearSentById(msgId);
      // Guarda mapeamento para DELIVERY_ACK/READ que chegam depois do eco
      trackForStatusUpdates(msgId, sentEntry.optimisticDocId);
      updateMessage(sentEntry.optimisticDocId, { evolutionId: msgId, status: 'sent' });
      emitToSession(sessionId, 'wa:message_update', {
        id: sentEntry.optimisticDocId,
        patch: { evolutionId: msgId, status: 'sent' },
      });
      duplicatesIgnored++;
      return;
    }
  }

  const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(data);

  if (messageType !== 'text') {
    log.info('MEDIA_MSG recebido', {
      topType: data.messageType ?? '—',
      resolved: messageType,
      msgKeys: Object.keys(data.message ?? {}).join(','),
      session: sessionId,
    });
  }

  if (fromMe && messageType === 'text' && !body) return; // protocolo/reação sem conteúdo

  const timestampSec = Number(data.messageTimestamp ?? Math.floor(Date.now() / 1000));
  const timestamp = new Date(timestampSec * 1000).toISOString();
  // Em grupos: pushName = nome do remetente dentro do grupo
  const senderName: string = data.pushName || extractPhone(key.participant ?? '') || phone;
  const direction: 'inbound' | 'outbound' = fromMe ? 'outbound' : 'inbound';
  const conversationId = `${sessionId}_${phone}`;
  const storedMsgId = `wamsg_${msgId}`;
  const organizationId = await resolveOrgId(sessionId);

  log.info('MESSAGES_UPSERT', {
    session: sessionId, phone, group: groupChat, fromMe, type: messageType,
    body: body.slice(0, 80),
  });

  const msgDoc: CachedMessage = {
    id: storedMsgId,
    conversationId,
    sessionId,
    direction,
    messageType,
    body,
    contactName: senderName,
    phone,
    timestamp,
    status: fromMe ? 'sent' : 'received',
    organizationId,
  };
  if (mediaUrl) msgDoc.mediaUrl = mediaUrl;
  if (mimeType) msgDoc.mimeType = mimeType;
  if (fileName) msgDoc.fileName = fileName;

  setMessage(msgDoc);
  emitToSession(sessionId, 'wa:message_upsert', msgDoc);

  const existing = getConversation(conversationId);
  const convDoc: CachedConversation = {
    id: conversationId,
    sessionId,
    sessionName: sessionId,
    phone,
    contactName: existing?.contactName || (groupChat ? `Grupo ${phone}` : senderName),
    contactPicture: existing?.contactPicture,
    isGroup: groupChat || undefined,
    lastMessage: body || mediaLabel(messageType),
    lastMessageAt: timestamp,
    lastMessageDirection: direction,
    updatedAt: timestamp,
    unreadCount: direction === 'inbound' ? (existing?.unreadCount ?? 0) + 1 : (existing?.unreadCount ?? 0),
    organizationId,
    leadId: existing?.leadId,
    clienteId: existing?.clienteId,
  };
  setConversation(convDoc);
  emitToSession(sessionId, 'wa:chat_upsert', convDoc);

  // Vincular a lead existente se houver — nunca criar automaticamente
  if (!fromMe && !groupChat && !existing?.leadId) {
    const leadId = await findExistingLead(phone, timestamp).catch(() => null);
    if (leadId) {
      updateConversation(conversationId, { leadId });
      emitToSession(sessionId, 'wa:chat_update', { id: conversationId, patch: { leadId } });
    }
  }

  messagesProcessed++;
}

async function handleMessagesUpdate(event: any) {
  const updates: any[] = Array.isArray(event.data) ? event.data : [event.data];
  const sessionId: string = event.instance ?? '';

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

    // Tenta resolver o ID otimista (mensagens enviadas pelo CRM)
    const optimisticId = getOptimisticId(msgId);
    const emitId = optimisticId ?? `wamsg_${msgId}`;

    log.info('MESSAGES_UPDATE', { session: sessionId, msgId, rawStatus, status, resolvedId: emitId });

    updateMessage(emitId, { status });
    emitToSession(sessionId, 'wa:message_update', { id: emitId, patch: { status } });
  }
}

async function handleMessagesDelete(event: any) {
  const sessionId: string = event.instance ?? '';
  const messages: any[] = Array.isArray(event.data) ? event.data : [event.data];

  for (const msg of messages) {
    const key = msg?.key ?? msg ?? {};
    const msgId: string = key.id ?? '';
    if (!msgId) continue;

    const storedId = `wamsg_${msgId}`;
    deleteMessage(storedId);
    emitToSession(sessionId, 'wa:message_delete', { id: storedId });
    log.info('MESSAGES_DELETE', { session: sessionId, msgId });
  }
}

async function handlePresenceUpdate(event: any) {
  const sessionId: string = event.instance ?? '';
  const presences: any[] = Array.isArray(event.data) ? event.data : [event.data];

  for (const p of presences) {
    const jid: string = p.id ?? p.remoteJid ?? '';
    if (!jid || isGroup(jid)) continue;

    const phone = extractPhone(jid);
    if (!phone) continue;

    const convId = `${sessionId}_${phone}`;

    // presences[jid].lastKnownPresence: "available" | "unavailable" | "composing" | "recording" | "paused"
    const presenceStatus: string =
      p.presences?.[jid]?.lastKnownPresence ??
      p.lastKnownPresence ??
      'available';

    updateConversation(convId, { presence: presenceStatus as any });
    emitToSession(sessionId, 'wa:presence_update', { id: convId, presence: presenceStatus });
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

  log.info('CONNECTION_UPDATE', { instance: instanceName, state: rawState, mapped: status });

  const update: Record<string, any> = { status, updatedAt: new Date().toISOString() };

  if (rawState === 'open') {
    const instanceData = event.data?.instance ?? {};
    if (instanceData.profileName) update.profileName = instanceData.profileName;
    if (instanceData.profilePictureUrl) update.profilePicture = instanceData.profilePictureUrl;
    if (instanceData.wuid || instanceData.phone) {
      update.phoneNumber = instanceData.wuid ?? instanceData.phone;
    }
    update.connectedAt = new Date().toISOString();

    const orgId = await resolveOrgId(instanceName);
    activeSessions.set(instanceName, orgId);
  }

  if (rawState === 'close' || rawState === 'closed') {
    update.phoneNumber = null;
    update.profileName = null;
    update.profilePicture = null;
    update.qrBase64 = null;
    update.qrCode = null;
    activeSessions.delete(instanceName);
  }

  await fsUpdate('whatsapp_sessions', instanceName, update).catch((err: any) =>
    log.error('fsUpdate sessions falhou (CONNECTION_UPDATE)', { instance: instanceName, ...errCtx(err) }),
  );

  // Emite para o frontend atualizar o status da sessão
  emitToSession(instanceName, 'wa:connection_update', { instanceName, status: rawState });

  if (rawState === 'open') {
    log.info('Sessão conectada — iniciando sync automático', { instance: instanceName });
    const orgId = await resolveOrgId(instanceName);

    syncSession(instanceName, orgId, false).then(result => {
      log.info('Auto-sync concluído', { instance: instanceName, conversas: result.conversationsImported });
      emitToSession(instanceName, 'wa:sync_complete', {
        instanceName,
        conversationsImported: result.conversationsImported,
      });
    }).catch(err => {
      log.error('Auto-sync falhou', { instance: instanceName, ...errCtx(err) });
    });
  }
}

async function handleQrcodeUpdated(event: any) {
  const instanceName: string = event.instance ?? '';
  if (!instanceName) return;

  const qrcode = event.data?.qrcode ?? {};
  log.info('QRCODE_UPDATED', { instance: instanceName });

  await fsUpdate('whatsapp_sessions', instanceName, {
    status: 'qr',
    qrBase64: qrcode.base64 ?? null,
    qrCode: qrcode.code ?? null,
    updatedAt: new Date().toISOString(),
  }).catch((err: any) =>
    log.error('fsUpdate sessions falhou (QRCODE_UPDATED)', { instance: instanceName, ...errCtx(err) }),
  );
}

async function handleContactsUpdate(event: any) {
  const sessionId: string = event.instance ?? '';
  const contacts: any[] = Array.isArray(event.data) ? event.data : [];

  for (const contact of contacts) {
    const jid: string = contact.id ?? '';
    if (!jid || isGroup(jid)) continue;

    const phone = extractPhone(jid);
    const name: string = contact.pushName || contact.notify || contact.name || '';
    const picture: string | undefined = contact.profilePicUrl ?? contact.profilePictureUrl;

    if (!phone) continue;

    // Atualiza o cache de conversas para este contato
    const convs = findConversationsByPhone(phone);
    for (const conv of convs) {
      const patch: Partial<import('../lib/conversationCache.js').CachedConversation> = {};
      if (name) patch.contactName = name;
      if (picture) patch.contactPicture = picture;
      if (Object.keys(patch).length > 0) {
        updateConversation(conv.id, patch);
        emitToSession(conv.sessionId, 'wa:chat_update', { id: conv.id, patch });
      }
    }

    // Atualiza lead no Firestore se existir
    if (name || picture) {
      const existingLeads = await fsQuery('leads', [{ field: 'phone', value: phone }]).catch(() => [] as any[]);
      if (existingLeads.length > 0) {
        const leadId: string = existingLeads[0].id;
        const upd: Record<string, any> = { updatedAt: new Date().toISOString() };
        if (name) upd.name = name;
        if (picture) upd.profilePicture = picture;
        await fsUpdate('leads', leadId, upd).catch(() => {});
      }
    }
  }

  log.info('CONTACTS_UPDATE', { session: sessionId, count: contacts.length });
}

async function handleChatsUpdate(event: any, isUpsert = false) {
  const sessionId: string = event.instance ?? '';
  if (!sessionId) return;

  const chats: any[] = Array.isArray(event.data) ? event.data : [event.data];
  const organizationId = await resolveOrgId(sessionId);

  for (const chat of chats) {
    const remoteJid: string = chat.remoteJid ?? chat.id ?? '';
    if (!remoteJid || isIgnoredJid(remoteJid)) continue;

    const remoteJidAlt: string | undefined = chat.remoteJidAlt ?? chat.lastMessage?.key?.remoteJidAlt;
    const phone = extractPhoneFromJid(remoteJid, remoteJidAlt) ?? extractPhone(remoteJid);
    if (!phone || phone.endsWith('@lid')) continue;

    const conversationId = `${sessionId}_${phone}`;
    const existing = getConversation(conversationId);

    if (existing) {
      // Atualiza campos presentes no evento
      const patch: Partial<CachedConversation> = { updatedAt: new Date().toISOString() };
      const unreadCount = typeof chat.unreadCount === 'number' ? chat.unreadCount
                        : (chat.unreadMessages !== undefined ? chat.unreadMessages : undefined);
      if (unreadCount !== undefined) patch.unreadCount = unreadCount;
      if (chat.name || chat.pushName) patch.contactName = chat.name || chat.pushName;
      if (chat.profilePicUrl && !existing.contactPicture) patch.contactPicture = chat.profilePicUrl;

      updateConversation(conversationId, patch);
      emitToSession(sessionId, 'wa:chat_update', { id: conversationId, patch });
    } else if (isUpsert) {
      // CHATS_UPSERT: novo chat que ainda não está no cache
      const lastMsg = chat.lastMessage ?? null;
      const lastMsgBody = lastMsg?.message?.conversation
        ?? lastMsg?.message?.extendedTextMessage?.text
        ?? (lastMsg ? '[mídia]' : '');
      const lastMsgTs = lastMsg?.messageTimestamp
        ? new Date((lastMsg.messageTimestamp as number) * 1000).toISOString()
        : new Date().toISOString();

      const groupChat = remoteJid.endsWith('@g.us');
      const newConv: CachedConversation = {
        id: conversationId,
        sessionId,
        sessionName: sessionId,
        phone,
        contactName: chat.name || chat.pushName || phone,
        contactPicture: chat.profilePicUrl || undefined,
        isGroup: groupChat || undefined,
        lastMessage: lastMsgBody,
        lastMessageAt: lastMsgTs,
        lastMessageDirection: lastMsg?.key?.fromMe ? 'outbound' : 'inbound',
        unreadCount: chat.unreadMessages ?? 0,
        organizationId,
        updatedAt: lastMsgTs,
      };
      setConversation(newConv);
      emitToSession(sessionId, 'wa:chat_upsert', newConv);
    }
  }

  log.info(`CHATS_${isUpsert ? 'UPSERT' : 'UPDATE'}`, { session: sessionId, count: chats.length });
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
    case 'MESSAGES_DELETE':
      await handleMessagesDelete(event);
      break;
    case 'PRESENCE_UPDATE':
      await handlePresenceUpdate(event);
      break;
    case 'CONNECTION_UPDATE':
      await handleConnectionUpdate(event);
      break;
    case 'QRCODE_UPDATED':
      await handleQrcodeUpdated(event);
      break;
    case 'CONTACTS_UPDATE':
    case 'CONTACTS_UPSERT':
      await handleContactsUpdate(event);
      break;
    case 'CHATS_UPDATE':
      await handleChatsUpdate(event, false);
      break;
    case 'CHATS_UPSERT':
      await handleChatsUpdate(event, true);
      break;
    default:
      log.debug('Evento não tratado', { eventType, instance: event.instance });
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

  // byEvents:true envia para /api/webhook/evolution/{event-slug}
  // Extrair event type do path como fallback quando body.event não existe
  const pathSlug = req.path?.split('/').pop() ?? '';
  const pathEvent = pathSlug
    ? pathSlug.replace(/-([a-z])/g, (_: string, c: string) => `_${c}`).toUpperCase()
    : '';

  const events: any[] = Array.isArray(body) ? body : [body];
  // Injetar event type do path em cada evento se não vier no body
  if (pathEvent) {
    events.forEach(e => { if (!e.event) e.event = pathEvent; });
  }

  Promise.all(
    events.map(event =>
      processEvent(event).catch(err => {
        messagesFailed++;
        const eventType = (event.event ?? '').toUpperCase();
        const sessionId = event.instance ?? '?';
        log.error('processEvent falhou', { eventType, session: sessionId, ...errCtx(err) });
      }),
    ),
  ).catch(err => log.error('Promise.all webhook falhou', errCtx(err)));
}
