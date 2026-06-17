import { fsGet, fsQueryFull, fsUpdate } from './adminFirebase.js';
import { decrypt } from './emailEncryption.js';
import {
  setEmail, setSyncState, getSyncState, cacheStats,
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

const SYNC_FOLDERS = ['inbox', 'sent', 'drafts'];
const MESSAGES_PER_FOLDER = 50;

// ── Decrypt account tokens ────────────────────────────────────────────────────

function decryptAccount(account: Record<string, any>): GmailAccount | MicrosoftAccount {
  return {
    ...account,
    accessToken: account.accessToken,   // keep encrypted — clients decrypt on demand
    refreshToken: account.refreshToken,
  } as any;
}

// ── Sync single Gmail account ─────────────────────────────────────────────────

async function syncGmailAccount(
  account: GmailAccount,
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];

  for (const folder of SYNC_FOLDERS) {
    try {
      const { messages } = await gmailListMessages(account, folder, MESSAGES_PER_FOLDER);
      for (const msgRef of messages) {
        try {
          const full = await gmailGetMessage(account, msgRef.id, 'full');
          const cached = parseGmailMessage(full, account.id);
          setEmail(cached);
          imported++;
        } catch (err: any) {
          errors.push(`gmail msg ${msgRef.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`gmail folder ${folder}: ${err.message}`);
    }
  }

  return { imported, errors };
}

// ── Sync single Microsoft account ────────────────────────────────────────────

async function syncMicrosoftAccount(
  account: MicrosoftAccount,
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];

  for (const folder of SYNC_FOLDERS) {
    try {
      const { messages } = await msListMessages(account, folder, MESSAGES_PER_FOLDER);
      for (const msg of messages) {
        try {
          const cached = parseMicrosoftMessage(msg, account.id, folder);
          setEmail(cached);
          imported++;
        } catch (err: any) {
          errors.push(`ms msg ${msg.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`ms folder ${folder}: ${err.message}`);
    }
  }

  return { imported, errors };
}

// ── Public: sync single account ───────────────────────────────────────────────

export async function syncAccount(
  accountId: string,
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

  setSyncState(accountId, { syncing: true });

  let result = { imported: 0, errors: [] as string[] };

  try {
    const account = decryptAccount(rawAccount);

    if (rawAccount.provider === 'gmail') {
      result = await syncGmailAccount(account as GmailAccount);
    } else if (rawAccount.provider === 'microsoft') {
      result = await syncMicrosoftAccount(account as MicrosoftAccount);
    } else {
      result.errors.push(`Unknown provider: ${rawAccount.provider}`);
    }

    const lastSync = Date.now();
    setSyncState(accountId, { lastSync, syncing: false });

    // Persist lastSync to Firestore
    await fsUpdate('email_accounts', accountId, { lastSync }).catch(() => {});

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
    await fsUpdate('email_accounts', accountId, { status: 'error', lastError: err.message }).catch(() => {});
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
