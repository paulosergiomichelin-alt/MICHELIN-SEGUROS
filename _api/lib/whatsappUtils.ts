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
    jid.endsWith('@broadcast') ||
    jid === 'status@broadcast' ||
    jid.endsWith('@newsletter')
    // @lid = "Linked ID" — contatos reais com remoteJidAlt; tratados em extractPhoneFromJid
    // @g.us = grupos — permitidos
  );
}

// Unwrapa formatos aninhados que o Evolution API / Baileys às vezes envia
function unwrapMessage(m: any): any {
  if (!m) return {};
  // viewOnceMessage / viewOnceMessageV2 / ephemeralMessage contêm outro .message
  const inner =
    m.viewOnceMessage?.message ??
    m.viewOnceMessageV2?.message ??
    m.viewOnceMessageV2Extension?.message ??
    m.ephemeralMessage?.message ??
    m.documentWithCaptionMessage?.message ??
    m.templateMessage?.hydratedFourRowTemplate?.hydratedContentText;
  return inner ? unwrapMessage(inner) : m;
}

export function extractMessageContent(msg: any): ExtractedMessage {
  const raw = msg?.message ?? {};
  const m = unwrapMessage(raw);
  // Evolution API v2 coloca o tipo também em data.messageType (top-level)
  const topType: string = (msg?.messageType ?? '').toLowerCase();

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
      mimeType: audio.mimetype ?? 'audio/ogg; codecs=opus',
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

  // Fallback: usar data.messageType do Evolution API v2 quando message object não resolve
  if (topType.includes('audio') || topType.includes('ptt')) {
    return { body: '', messageType: 'audio', mimeType: 'audio/ogg; codecs=opus' };
  }
  if (topType.includes('image')) return { body: '', messageType: 'image' };
  if (topType.includes('video')) return { body: '', messageType: 'video' };
  if (topType.includes('document')) return { body: '', messageType: 'document' };
  if (topType.includes('sticker')) return { body: '', messageType: 'sticker' };

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

const MEDIA_LABELS: Record<string, string> = {
  audio: '🎤 Áudio',
  video: '🎬 Vídeo',
  image: '📷 Imagem',
  document: '📄 Documento',
  sticker: '🗳️ Figurinha',
};

export function mediaLabel(messageType: string): string {
  return MEDIA_LABELS[messageType] ?? `[${messageType}]`;
}
