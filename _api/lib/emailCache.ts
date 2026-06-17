// In-memory cache for email accounts, messages and sync state.

export interface CachedEmail {
  id: string;
  accountId: string;
  provider: 'gmail' | 'microsoft';
  folder: string; // 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'
  threadId?: string;
  subject: string;
  from: { name?: string; email: string };
  to: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  date: string; // ISO
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  bodyHtml?: string;   // loaded on demand
  bodyText?: string;
  attachments?: { id?: string; filename: string; mimeType: string; size: number }[];
  fetchedAt: number;
}

export interface AccountSyncState {
  historyId?: string;  // Gmail incremental
  deltaLink?: string;  // Microsoft incremental
  lastSync: number;
  syncing: boolean;
}

interface AccountStore {
  messages: Map<string, CachedEmail>;
  folderIndex: Map<string, string[]>; // folder -> message ids
  syncState: AccountSyncState;
}

const accountStores = new Map<string, AccountStore>();

function getOrCreateStore(accountId: string): AccountStore {
  if (!accountStores.has(accountId)) {
    accountStores.set(accountId, {
      messages: new Map(),
      folderIndex: new Map(),
      syncState: { lastSync: 0, syncing: false },
    });
  }
  return accountStores.get(accountId)!;
}

export function setEmail(email: CachedEmail): void {
  const store = getOrCreateStore(email.accountId);

  // Remove from old folder index if folder changed
  const existing = store.messages.get(email.id);
  if (existing && existing.folder !== email.folder) {
    const oldIndex = store.folderIndex.get(existing.folder) ?? [];
    store.folderIndex.set(
      existing.folder,
      oldIndex.filter(id => id !== email.id),
    );
  }

  store.messages.set(email.id, email);

  // Update folder index
  const folderIds = store.folderIndex.get(email.folder) ?? [];
  if (!folderIds.includes(email.id)) {
    folderIds.push(email.id);
    store.folderIndex.set(email.folder, folderIds);
  }
}

export function getEmail(accountId: string, id: string): CachedEmail | undefined {
  return accountStores.get(accountId)?.messages.get(id);
}

export function updateEmail(accountId: string, id: string, patch: Partial<CachedEmail>): void {
  const store = accountStores.get(accountId);
  if (!store) return;
  const existing = store.messages.get(id);
  if (!existing) return;

  const updated = { ...existing, ...patch };

  // If folder changed, fix indexes
  if (patch.folder && patch.folder !== existing.folder) {
    const oldIds = store.folderIndex.get(existing.folder) ?? [];
    store.folderIndex.set(existing.folder, oldIds.filter(i => i !== id));
    const newIds = store.folderIndex.get(updated.folder) ?? [];
    if (!newIds.includes(id)) {
      newIds.push(id);
      store.folderIndex.set(updated.folder, newIds);
    }
  }

  store.messages.set(id, updated);
}

export function getEmailsByFolder(
  accountId: string,
  folder: string,
  page = 1,
  limit = 50,
): { emails: CachedEmail[]; total: number } {
  const store = accountStores.get(accountId);
  if (!store) return { emails: [], total: 0 };

  const ids = store.folderIndex.get(folder) ?? [];
  const all = ids
    .map(id => store.messages.get(id)!)
    .filter(Boolean)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const offset = (page - 1) * limit;
  return {
    emails: all.slice(offset, offset + limit),
    total: all.length,
  };
}

export function getAllEmailsByFolder(accountId: string, folder: string): CachedEmail[] {
  const store = accountStores.get(accountId);
  if (!store) return [];
  const ids = store.folderIndex.get(folder) ?? [];
  return ids
    .map(id => store.messages.get(id)!)
    .filter(Boolean)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function removeEmail(accountId: string, id: string): void {
  const store = accountStores.get(accountId);
  if (!store) return;
  const existing = store.messages.get(id);
  if (!existing) return;
  store.messages.delete(id);
  const folderIds = store.folderIndex.get(existing.folder) ?? [];
  store.folderIndex.set(existing.folder, folderIds.filter(i => i !== id));
}

export function setSyncState(accountId: string, state: Partial<AccountSyncState>): void {
  const store = getOrCreateStore(accountId);
  store.syncState = { ...store.syncState, ...state };
}

export function getSyncState(accountId: string): AccountSyncState {
  return getOrCreateStore(accountId).syncState;
}

export function clearAccount(accountId: string): void {
  accountStores.delete(accountId);
}

export function cacheStats() {
  const stats: Record<string, { messages: number; folders: string[] }> = {};
  for (const [accountId, store] of accountStores.entries()) {
    stats[accountId] = {
      messages: store.messages.size,
      folders: Array.from(store.folderIndex.keys()),
    };
  }
  return stats;
}

export function getAccountFolderCounts(accountId: string): Record<string, number> {
  const store = accountStores.get(accountId);
  if (!store) return {};
  const counts: Record<string, number> = {};
  for (const [folder, ids] of store.folderIndex.entries()) {
    counts[folder] = ids.length;
  }
  return counts;
}

export function getUnreadCount(accountId: string, folder: string): number {
  const store = accountStores.get(accountId);
  if (!store) return 0;
  const ids = store.folderIndex.get(folder) ?? [];
  return ids.filter(id => {
    const email = store.messages.get(id);
    return email && !email.isRead;
  }).length;
}
