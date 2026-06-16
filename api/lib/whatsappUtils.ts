// Utilitários compartilhados entre webhook, sync e messages

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface ExtractedMessage {
  body: string;
  messageType: 'text' | MediaType;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
}

export function extractPhone(jid: string): string {
  return jid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@c\.us$/, '')
    .replace(/@g\.us$/, '')
    .replace(/:\d+$/, '');
}

export function stripDDI(phone: string): string {
  if (phone.startsWith('55') && phone.length >= 12) return phone.slice(2);
  return phone;
}

export function isGroup(jid: string): boolean {
  return jid.endsWith('@g.us');
}

export function isIgnoredJid(jid: string): boolean {
  return (
    jid.endsWith('@g.us') ||
    jid.endsWith('@broadcast') ||
    jid === 'status@broadcast' ||
    jid.endsWith('@newsletter')
    // @lid = "Linked ID" — contatos reais com remoteJidAlt; tratados em extractPhoneFromJid
  );
}

export function extractMessageContent(msg: any): ExtractedMessage {
  const m = msg?.message ?? {};

  if (m.conversation) return { body: m.conversation, messageType: 'text' };
  if (m.extendedTextMessage?.text) return { body: m.extendedTextMessage.text, messageType: 'text' };

  if (m.imageMessage) return {
    body: m.imageMessage.caption ?? '',
    messageType: 'image',
    mediaUrl: m.imageMessage.url ?? m.imageMessage.directPath ?? '',
    mimeType: m.imageMessage.mimetype,
  };

  if (m.videoMessage) return {
    body: m.videoMessage.caption ?? '',
    messageType: 'video',
    mediaUrl: m.videoMessage.url ?? m.videoMessage.directPath ?? '',
    mimeType: m.videoMessage.mimetype,
  };

  if (m.audioMessage || m.pttMessage) {
    const audio = m.audioMessage ?? m.pttMessage;
    return {
      body: '',
      messageType: 'audio',
      mediaUrl: audio.url ?? audio.directPath ?? '',
      mimeType: audio.mimetype,
    };
  }

  if (m.documentMessage) return {
    body: m.documentMessage.caption ?? m.documentMessage.fileName ?? '',
    messageType: 'document',
    mediaUrl: m.documentMessage.url ?? m.documentMessage.directPath ?? '',
    mimeType: m.documentMessage.mimetype,
    fileName: m.documentMessage.fileName,
  };

  if (m.stickerMessage) return {
    body: '',
    messageType: 'sticker',
    mediaUrl: m.stickerMessage.url ?? '',
    mimeType: m.stickerMessage.mimetype,
  };

  return { body: '', messageType: 'text' };
}

// Extrai phone de JID incluindo fallback para @lid
export function extractPhoneFromJid(jid: string, remoteJidAlt?: string): string | null {
  if (jid.endsWith('@lid')) {
    if (!remoteJidAlt) return null;
    return remoteJidAlt.replace(/@s\.whatsapp\.net$|@c\.us$/, '').replace(/:\d+$/, '');
  }
  if (isIgnoredJid(jid) && !jid.endsWith('@g.us')) return null;
  return extractPhone(jid);
}
