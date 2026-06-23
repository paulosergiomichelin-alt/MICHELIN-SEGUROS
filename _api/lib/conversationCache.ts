// In-memory cache for WhatsApp conversations and messages.
// Avoids Firestore writes entirely for chat data (prevents quota exhaustion).

export interface CachedConversation {
  id: string;
  sessionId: string;
  sessionName: string;
  phone: string;
  contactName: string;
  contactPicture?: string;
  isGroup?: boolean;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageDirection: 'inbound' | 'outbound';
  unreadCount: number;
  presence?: 'available' | 'composing' | 'recording' | 'paused' | 'unavailable';
  organizationId: string;
  updatedAt: string;
  leadId?: string;
  clienteId?: string;
}

export interface CachedMessage {
  id: string;
  conversationId: string;
  sessionId: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  body: string;
  phone: string;
  contactName: string;
  timestamp: string;
  status: string;
  organizationId: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  evolutionId?: string;
}

const convStore = new Map<string, CachedConversation>();
const msgStore = new Map<string, CachedMessage>();
const msgByConv = new Map<string, Set<string>>();

export function setConversation(conv: CachedConversation): void {
  convStore.set(conv.id, conv);
}

export function updateConversation(id: string, patch: Partial<CachedConversation>): void {
  const existing = convStore.get(id);
  if (existing) convStore.set(id, { ...existing, ...patch });
}

export function getConversation(id: string): CachedConversation | undefined {
  return convStore.get(id);
}

export function getConversations(sessionId: string): CachedConversation[] {
  const result: CachedConversation[] = [];
  for (const conv of convStore.values()) {
    if (conv.sessionId === sessionId) result.push(conv);
  }
  return result.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

// Find all conversations matching a phone number (across all sessions)
export function findConversationsByPhone(phone: string): CachedConversation[] {
  const result: CachedConversation[] = [];
  for (const conv of convStore.values()) {
    if (conv.phone === phone) result.push(conv);
  }
  return result;
}

export function setMessage(msg: CachedMessage): void {
  msgStore.set(msg.id, msg);
  if (!msgByConv.has(msg.conversationId)) msgByConv.set(msg.conversationId, new Set());
  msgByConv.get(msg.conversationId)!.add(msg.id);
}

export function updateMessage(id: string, patch: Partial<CachedMessage>): void {
  const existing = msgStore.get(id);
  if (existing) msgStore.set(id, { ...existing, ...patch });
}

export function deleteMessage(id: string): void {
  const msg = msgStore.get(id);
  if (!msg) return;
  msgStore.delete(id);
  msgByConv.get(msg.conversationId)?.delete(id);
}

export function getMessages(conversationId: string): CachedMessage[] {
  const ids = msgByConv.get(conversationId);
  if (!ids) return [];
  return Array.from(ids)
    .map(id => msgStore.get(id)!)
    .filter(Boolean)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function hasMessage(id: string): boolean {
  return msgStore.has(id);
}

export function clearMessages(conversationId: string): number {
  const ids = msgByConv.get(conversationId);
  if (!ids) return 0;
  const count = ids.size;
  for (const id of ids) msgStore.delete(id);
  msgByConv.delete(conversationId);
  return count;
}

export function cacheStats() {
  return { conversations: convStore.size, messages: msgStore.size };
}
