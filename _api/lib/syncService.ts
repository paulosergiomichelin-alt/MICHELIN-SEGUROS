import { EvolutionAPI } from './evolutionApi.js';
import { extractPhoneFromJid, isIgnoredJid, extractMessageContent, stripDDI } from './whatsappUtils.js';
import {
  setConversation, setMessage, updateConversation, getConversation, getConversations,
  getMessages, hasMessage, CachedConversation, CachedMessage,
} from './conversationCache.js';
import { emitToSession } from './socketRegistry.js';

export interface SyncResult {
  conversationsImported: number;
  messagesImported: number;
  cleaned: number;
  errors: string[];
}

function extractBody(message: any): string {
  if (!message) return '';
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.fileName ??
    '[mídia]'
  );
}

// Importa até `msgLimit` mensagens de uma conversa específica para o cache
export async function importConversationMessages(
  sessionName: string,
  phone: string,
  organizationId: string,
  msgLimit = 100,
  isGroup = false,
): Promise<{ imported: number; contactName: string }> {
  const conversationId = `${sessionName}_${phone}`;
  const remoteJid = isGroup ? `${phone}@g.us` : `${phone}@s.whatsapp.net`;

  const msgs = await EvolutionAPI.findMessages(sessionName, remoteJid, msgLimit);
  if (msgs.length === 0) return { imported: 0, contactName: phone };

  let imported = 0;
  let bestContactName = phone;

  for (const msg of msgs) {
    const key = msg.key ?? {};
    const msgId: string = key.id ?? '';
    if (!msgId) continue;

    const fromMe: boolean = Boolean(key.fromMe);
    const pushName: string = msg.pushName || '';
    if (!fromMe && pushName && bestContactName === phone) bestContactName = pushName;

    const storedId = `wamsg_${msgId}`;
    if (hasMessage(storedId)) continue;

    const timestampSec = Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000));
    const timestamp = new Date(timestampSec * 1000).toISOString();
    const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(msg);

    const doc: CachedMessage = {
      id: storedId,
      conversationId,
      sessionId: sessionName,
      direction: fromMe ? 'outbound' : 'inbound',
      messageType,
      body,
      phone,
      contactName: pushName || phone,
      timestamp,
      status: fromMe ? 'sent' : 'received',
      organizationId,
    };
    if (mediaUrl) doc.mediaUrl = mediaUrl;
    if (mimeType) doc.mimeType = mimeType;
    if (fileName) doc.fileName = fileName;

    setMessage(doc);
    imported++;
  }

  return { imported, contactName: bestContactName };
}

// Sincroniza todas as conversas de uma sessão para o cache
export async function syncSession(
  sessionName: string,
  organizationId: string,
  importMessages = false,
): Promise<SyncResult> {
  const result: SyncResult = { conversationsImported: 0, messagesImported: 0, cleaned: 0, errors: [] };

  const contacts = await EvolutionAPI.findContacts(sessionName).catch(() => [] as any[]);
  const contactNameMap = new Map<string, string>();
  const contactPictureMap = new Map<string, string>();

  // Gera variantes do número BR com e sem o 9 extra (DDD9xxxxxxxx ↔ DDDxxxxxxxx)
  function brVariants(phone: string): string[] {
    if (phone.startsWith('55') && phone.length === 13 && phone[4] === '9') {
      return [phone, phone.slice(0, 4) + phone.slice(5)]; // com e sem 9
    }
    if (phone.startsWith('55') && phone.length === 12) {
      return [phone, phone.slice(0, 4) + '9' + phone.slice(4)]; // sem e com 9
    }
    return [phone];
  }

  for (const c of contacts) {
    // Evolution API v2: campo é remoteJid (não id) e profilePicUrl (não profilePictureUrl)
    const jid: string = c.remoteJid ?? c.id ?? '';
    const name: string = c.pushName || c.notify || c.name || '';
    const picture: string = c.profilePicUrl ?? c.profilePictureUrl ?? '';
    if (jid && !jid.startsWith('cm')) { // ignorar IDs internos do banco (começam com cm...)
      const phone = jid.replace(/@s\.whatsapp\.net$|@c\.us$|@g\.us$/, '').replace(/:\d+$/, '');
      for (const v of brVariants(phone)) {
        if (name) contactNameMap.set(v, name);
        if (picture) contactPictureMap.set(v, picture);
      }
    }
  }
  process.stdout.write(`[SyncService] ${sessionName}: ${contacts.length} contatos carregados (${contactPictureMap.size} com foto)\n`);

  const chats = await EvolutionAPI.findChats(sessionName);
  process.stdout.write(`[SyncService] ${sessionName}: ${chats.length} chats encontrados\n`);

  for (const chat of chats) {
    const remoteJid: string = chat.remoteJid ?? '';
    if (!remoteJid || isIgnoredJid(remoteJid)) continue;

    const lastMsg = chat.lastMessage ?? null;
    const remoteJidAlt: string | undefined = lastMsg?.key?.remoteJidAlt;
    const phone = extractPhoneFromJid(remoteJid, remoteJidAlt);
    if (!phone) continue;

    const groupChat = remoteJid.endsWith('@g.us');
    // findChats tem profilePicUrl diretamente; findContacts tem mais (446 vs 64)
    const chatPic: string = chat.profilePicUrl ?? '';
    const contactPic: string = contactPictureMap.get(phone) ?? '';
    const resolvedPicture: string = chatPic || contactPic;

    // Nome: contacts table > chat.pushName (grupos: é o nome do grupo) > lastMsg.pushName (inbound)
    const isInbound = lastMsg?.key?.fromMe === false;
    const inboundPushName: string = isInbound ? (lastMsg?.pushName ?? '') : '';
    const contactName: string =
      contactNameMap.get(phone) ||
      chat.pushName ||
      inboundPushName ||
      chat.name ||
      phone;

    const groupName: string = chat.pushName || chat.name || '';
    const resolvedName = groupChat
      ? (groupName || `Grupo ${phone}`)
      : contactName;

    const convId = `${sessionName}_${phone}`;
    const lastMsgBody = lastMsg ? extractBody(lastMsg.message) : '';
    const lastMsgTs = lastMsg?.messageTimestamp
      ? new Date((lastMsg.messageTimestamp as number) * 1000).toISOString()
      : (chat.updatedAt as string | undefined) ?? new Date().toISOString();
    const lastMsgDir: 'inbound' | 'outbound' = lastMsg?.key?.fromMe ? 'outbound' : 'inbound';

    const conv: CachedConversation = {
      id: convId,
      sessionId: sessionName,
      sessionName,
      phone,
      contactName: resolvedName,
      contactPicture: resolvedPicture || undefined,
      isGroup: groupChat || undefined,
      lastMessage: lastMsgBody,
      lastMessageAt: lastMsgTs,
      lastMessageDirection: lastMsgDir,
      unreadCount: (chat.unreadMessages as number) ?? 0,
      organizationId,
      updatedAt: lastMsgTs,
    };
    setConversation(conv);
    result.conversationsImported++;

    // Store lastMessage from findChats as a CachedMessage — only source of history
    // since findMessages returns 0 results (messages not persisted in this Evolution deployment)
    if (lastMsg) {
      const key = lastMsg.key ?? {};
      const msgId: string = key.id ?? '';
      if (msgId) {
        const storedId = `wamsg_${msgId}`;
        if (!hasMessage(storedId)) {
          const fromMe: boolean = Boolean(key.fromMe);
          const timestampSec = Number(lastMsg.messageTimestamp ?? Math.floor(Date.now() / 1000));
          const timestamp = new Date(timestampSec * 1000).toISOString();
          const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(lastMsg);
          const pushName: string = lastMsg.pushName || '';

          const doc: CachedMessage = {
            id: storedId,
            conversationId: convId,
            sessionId: sessionName,
            direction: fromMe ? 'outbound' : 'inbound',
            messageType,
            body,
            phone,
            contactName: pushName || contactName,
            timestamp,
            status: fromMe ? 'sent' : 'received',
            organizationId,
          };
          if (mediaUrl) doc.mediaUrl = mediaUrl;
          if (mimeType) doc.mimeType = mimeType;
          if (fileName) doc.fileName = fileName;

          setMessage(doc);
          result.messagesImported++;
        }
      }
    }

    if (importMessages) {
      try {
        const { imported } = await importConversationMessages(sessionName, phone, organizationId, 50, groupChat);
        result.messagesImported += imported;
      } catch (err: any) {
        result.errors.push(`msgs ${convId}: ${err.message}`);
      }
    }
  }

  process.stdout.write(
    `[SyncService] ${sessionName}: ${result.conversationsImported} conversas, ${result.messagesImported} mensagens, ${result.cleaned} removidos\n`,
  );

  return result;
}

// Reconcilia mensagens recentes de uma sessão (busca mensagens faltando no cache)
export async function reconcileSession(
  sessionName: string,
  organizationId: string,
  lookbackMinutes = 60,
): Promise<{ checked: number; imported: number }> {
  const cutoff = Date.now() - lookbackMinutes * 60 * 1000;

  const conversations = getConversations(sessionName).filter(c => {
    const ts = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
    return ts > cutoff;
  });

  let checked = 0;
  let imported = 0;

  for (const conv of conversations.slice(0, 30)) {
    const phone: string = conv.phone ?? '';
    if (!phone) continue;

    const msgs = await EvolutionAPI.findMessages(sessionName, `${phone}@s.whatsapp.net`, 20).catch(() => [] as any[]);
    const conversationId = `${sessionName}_${phone}`;

    for (const msg of msgs) {
      const key = msg.key ?? {};
      const msgId: string = key.id ?? '';
      if (!msgId) continue;

      checked++;
      const storedId = `wamsg_${msgId}`;
      if (hasMessage(storedId)) continue;

      const fromMe: boolean = Boolean(key.fromMe);
      const timestampSec = Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000));
      const timestamp = new Date(timestampSec * 1000).toISOString();
      const { body, messageType, mediaUrl, mimeType, fileName } = extractMessageContent(msg);

      const doc: CachedMessage = {
        id: storedId,
        conversationId,
        sessionId: sessionName,
        direction: fromMe ? 'outbound' : 'inbound',
        messageType,
        body,
        phone,
        contactName: msg.pushName || conv.contactName || phone,
        timestamp,
        status: fromMe ? 'sent' : 'received',
        organizationId,
      };
      if (mediaUrl) doc.mediaUrl = mediaUrl;
      if (mimeType) doc.mimeType = mimeType;
      if (fileName) doc.fileName = fileName;

      setMessage(doc);
      imported++;

      // Push novo msg para o frontend (websocket)
      emitToSession(sessionName, 'wa:message_upsert', doc);

      // Atualiza lastMessage da conversa se esta msg é mais recente
      const existingConv = getConversation(conversationId);
      if (existingConv && (!existingConv.lastMessageAt || new Date(doc.timestamp) > new Date(existingConv.lastMessageAt))) {
        const patch = {
          lastMessage: doc.body || `[${doc.messageType}]`,
          lastMessageAt: doc.timestamp,
          lastMessageDirection: doc.direction,
          updatedAt: doc.timestamp,
          unreadCount: doc.direction === 'inbound' ? (existingConv.unreadCount ?? 0) + 1 : (existingConv.unreadCount ?? 0),
        };
        updateConversation(conversationId, patch);
        emitToSession(sessionName, 'wa:chat_upsert', { ...existingConv, ...patch });
      }
    }
  }

  process.stdout.write(`[SyncService] reconcile ${sessionName}: ${checked} verificados, ${imported} importados\n`);
  return { checked, imported };
}
