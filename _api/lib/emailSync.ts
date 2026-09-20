import { fsGet, fsQueryFull, fsUpdate } from './pgData.js';
import { decrypt } from './emailEncryption.js';
import {
  setEmail, setSyncState, getSyncState, cacheStats, CachedEmail,
} from './emailCache.js';
import { emitGlobal } from './socketRegistry.js';
import {
  listMessages as gmailListMessages,
  getMessage as gmailGetMessage,
  parseGmailMessage,
  GmailAccount,
} from './gmailClient.js';
import {
  listMessages as msListMessages,
  parseMicrosoftMessage,
  MicrosoftAccount,
} from './microsoftClient.js';
import {
  fetchRecentMessages as imapFetchRecentMessages,
  parseImapMessage,
  ImapAccount,
} from './imapClient.js';

const SYNC_FOLDERS = ['inbox', 'sent', 'drafts'];
const MESSAGES_PER_FOLDER = 50;

// O sync periódico só cobre as 3 pastas padrão — navegar numa pasta descoberta via
// listFolders/listLabels/listFoldersTree (subpasta real, label customizado etc.) nunca
// seria populada por ele. `extraFolder` permite que messages.ts peça, sob demanda, que
// essa chamada específica de sync também busque a pasta que o usuário está olhando.
function foldersToSync(extraFolder?: string): string[] {
  if (!extraFolder || SYNC_FOLDERS.includes(extraFolder)) return SYNC_FOLDERS;
  return [...SYNC_FOLDERS, extraFolder];
}

// ── Decrypt account tokens ────────────────────────────────────────────────────

function decryptAccount(account: Record<string, any>): GmailAccount | MicrosoftAccount | ImapAccount {
  return {
    ...account,
    accessToken: account.accessToken,   // keep encrypted — clients decrypt on demand
    refreshToken: account.refreshToken,
  } as any;
}

// ── Sync single Gmail account ─────────────────────────────────────────────────

async function syncGmailAccount(
  account: GmailAccount,
  extraFolder?: string,
): Promise<{ imported: number; errors: string[]; newInboxMessages: CachedEmail[] }> {
  let imported = 0;
  const errors: string[] = [];
  const newInboxMessages: CachedEmail[] = [];

  for (const folder of foldersToSync(extraFolder)) {
    try {
      const { messages } = await gmailListMessages(account, folder, MESSAGES_PER_FOLDER);
      for (const msgRef of messages) {
        try {
          const full = await gmailGetMessage(account, msgRef.id, 'full');
          const cached = parseGmailMessage(full, account.id);
          const isNew = setEmail(cached);
          imported++;
          if (isNew && cached.folder === 'inbox') newInboxMessages.push(cached);
        } catch (err: any) {
          errors.push(`gmail msg ${msgRef.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`gmail folder ${folder}: ${err.message}`);
    }
  }

  return { imported, errors, newInboxMessages };
}

// ── Sync single Microsoft account ────────────────────────────────────────────

async function syncMicrosoftAccount(
  account: MicrosoftAccount,
  extraFolder?: string,
): Promise<{ imported: number; errors: string[]; newInboxMessages: CachedEmail[] }> {
  let imported = 0;
  const errors: string[] = [];
  const newInboxMessages: CachedEmail[] = [];

  for (const folder of foldersToSync(extraFolder)) {
    try {
      const { messages } = await msListMessages(account, folder, MESSAGES_PER_FOLDER);
      for (const msg of messages) {
        try {
          const cached = parseMicrosoftMessage(msg, account.id, folder);
          const isNew = setEmail(cached);
          imported++;
          if (isNew && cached.folder === 'inbox') newInboxMessages.push(cached);
        } catch (err: any) {
          errors.push(`ms msg ${msg.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`ms folder ${folder}: ${err.message}`);
    }
  }

  return { imported, errors, newInboxMessages };
}

// ── Sync single IMAP account ────────────────────────────────────────────────

async function syncImapAccount(
  account: ImapAccount,
  extraFolder?: string,
): Promise<{ imported: number; errors: string[]; newInboxMessages: CachedEmail[] }> {
  let imported = 0;
  const errors: string[] = [];
  const newInboxMessages: CachedEmail[] = [];

  // Uma conexão IMAP por PASTA (3 ou 4 por ciclo), não uma por mensagem: o padrão
  // anterior (listMessages + getMessage por uid) abria ~150 conexões completas a
  // cada sync de 5 min por conta — risco real de throttling/ban em provedores
  // reais. fetchRecentMessages faz um único fetch em lote com {source: true}.
  for (const folder of foldersToSync(extraFolder)) {
    try {
      const fetched = await imapFetchRecentMessages(account, folder, MESSAGES_PER_FOLDER);
      for (const item of fetched) {
        if (!item.parsed) {
          errors.push(`imap msg ${item.uid} em ${folder}: ${item.error ?? 'falha ao ler mensagem'}`);
          continue;
        }
        try {
          const cached = parseImapMessage(item.parsed, account.id, folder);
          const isNew = setEmail(cached);
          imported++;
          if (isNew && cached.folder === 'inbox') newInboxMessages.push(cached);
        } catch (err: any) {
          errors.push(`imap msg ${item.uid} em ${folder}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`imap folder ${folder}: ${err.message}`);
    }
  }

  return { imported, errors, newInboxMessages };
}

// ── Public: sync single account ───────────────────────────────────────────────

export async function syncAccount(
  accountId: string,
  extraFolder?: string,
): Promise<{ imported: number; errors: string[] }> {
  // Load account from Firestore
  const rawAccount = await fsGet('email_accounts', accountId);

  if (!rawAccount) throw new Error(`Account ${accountId} not found`);
  rawAccount.id = accountId; // fsGet strips the document id
  if (rawAccount.status === 'error' || rawAccount.status === 'disconnected') {
    return { imported: 0, errors: [`Account ${accountId} has status ${rawAccount.status}, skipping`] };
  }

  const syncState = getSyncState(accountId);
  if (syncState.syncing) {
    return { imported: 0, errors: [`Account ${accountId} already syncing`] };
  }
  // Na primeira sincronização da conta (logo após conectar), TODAS as mensagens
  // da inbox entram como "novas" no cache vazio — sem essa checagem, conectar uma
  // conta cheia dispararia dezenas de toasts de e-mails antigos de uma vez.
  const isFirstSync = syncState.lastSync === 0;

  setSyncState(accountId, { syncing: true });

  let result: { imported: number; errors: string[]; newInboxMessages?: CachedEmail[] } = { imported: 0, errors: [] };

  try {
    const account = decryptAccount(rawAccount);

    if (rawAccount.provider === 'gmail') {
      result = await syncGmailAccount(account as GmailAccount, extraFolder);
    } else if (rawAccount.provider === 'microsoft') {
      result = await syncMicrosoftAccount(account as MicrosoftAccount, extraFolder);
    } else if (rawAccount.provider === 'imap') {
      result = await syncImapAccount(account as ImapAccount, extraFolder);
    } else {
      result.errors.push(`Unknown provider: ${rawAccount.provider}`);
    }

    const lastSync = Date.now();
    setSyncState(accountId, { lastSync, syncing: false });

    // Persist lastSync to Firestore
    await fsUpdate('email_accounts', accountId, { lastSync }).catch(() => {});

    // Um evento 'new' por mensagem nova que caiu na inbox — é o que o frontend
    // usa pra atualizar a lista em tempo real e mostrar o toast de notificação
    // (ver EmailContext.tsx). Sem isso, o sync periódico rodava a cada 5 min só
    // por baixo dos panos e nada aparecia pro usuário sem um clique manual em
    // "Sincronizar".
    if (!isFirstSync) {
      for (const message of result.newInboxMessages ?? []) {
        emitGlobal('email:update', {
          type: 'new',
          userId: rawAccount.userId,
          accountId,
          message,
          folder: 'inbox',
        });
      }
    }

    // Emit sync complete event (frontend filters by userId in payload)
    emitGlobal('email:update', {
      type: 'sync_complete',
      userId: rawAccount.userId,
      accountId,
      imported: result.imported,
      errors: result.errors,
      lastSync,
    });
  } catch (err: any) {
    setSyncState(accountId, { syncing: false });
    result.errors.push(`syncAccount failed: ${err.message}`);

    // Update account status to error
    // `syncError` é o nome real da coluna (schema/campaigns-email.ts:51) —
    // escrever `lastError` virava no-op silencioso (engolido pelo .catch()).
    await fsUpdate('email_accounts', accountId, { status: 'error', syncError: err.message }).catch(() => {});
  }

  return result;
}

// ── Public: sync all active accounts ─────────────────────────────────────────

export async function syncAllAccounts(): Promise<{
  accounts: number;
  imported: number;
  errors: string[];
}> {
  let totalImported = 0;
  const allErrors: string[] = [];

  let accounts: Array<Record<string, any>> = [];
  try {
    // We need all accounts; no filter returns all docs. Use a broad query instead.
    accounts = await fsQueryFull('email_accounts', [{ field: 'status', value: 'active' }]);
  } catch (err: any) {
    allErrors.push(`Failed to load accounts: ${err.message}`);
    return { accounts: 0, imported: 0, errors: allErrors };
  }

  for (const account of accounts) {
    if (!account.id) continue;
    if (account.status === 'error' || account.status === 'disconnected') continue;

    try {
      const result = await syncAccount(account.id);
      totalImported += result.imported;
      allErrors.push(...result.errors);
    } catch (err: any) {
      allErrors.push(`Account ${account.id}: ${err.message}`);
    }
  }

  return { accounts: accounts.length, imported: totalImported, errors: allErrors };
}

// ── Polling scheduler ─────────────────────────────────────────────────────────

let _syncTimer: ReturnType<typeof setInterval> | null = null;

export function scheduleEmailSync(intervalMs = 5 * 60 * 1000): void {
  if (_syncTimer) clearInterval(_syncTimer);

  _syncTimer = setInterval(async () => {
    process.stdout.write('[EmailSync] Running scheduled sync...\n');
    try {
      const result = await syncAllAccounts();
      process.stdout.write(
        `[EmailSync] Synced ${result.accounts} accounts, ${result.imported} messages. Errors: ${result.errors.length}\n`,
      );
    } catch (err: any) {
      process.stdout.write(`[EmailSync] Scheduler error: ${err.message}\n`);
    }
  }, intervalMs);

  process.stdout.write(`[EmailSync] Scheduler started (every ${intervalMs / 1000}s)\n`);
}

export function stopEmailSync(): void {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}
