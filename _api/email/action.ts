import { fsGet } from '../lib/adminFirebase.js';
import { getEmail, updateEmail, removeEmail, setEmail } from '../lib/emailCache.js';
import { emitGlobal } from '../lib/socketRegistry.js';
import {
  modifyMessage as gmailModify,
  trashMessage as gmailTrash,
  untrashMessage as gmailUntrash,
  GmailAccount,
} from '../lib/gmailClient.js';
import {
  updateMessage as msUpdate,
  moveMessage as msMove,
  deleteMessage as msDelete,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';

type EmailAction =
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'archive'
  | 'trash'
  | 'spam'
  | 'restore'
  | 'delete';

const MS_FOLDER_IDS: Record<string, string> = {
  inbox: 'inbox',
  trash: 'deleteditems',
  spam: 'junkemail',
  archive: 'archive',
  sent: 'sentitems',
  drafts: 'drafts',
};

async function applyGmailAction(
  account: GmailAccount,
  messageId: string,
  action: EmailAction,
): Promise<void> {
  switch (action) {
    case 'read':
      await gmailModify(account, messageId, [], ['UNREAD']);
      break;
    case 'unread':
      await gmailModify(account, messageId, ['UNREAD'], []);
      break;
    case 'star':
      await gmailModify(account, messageId, ['STARRED'], []);
      break;
    case 'unstar':
      await gmailModify(account, messageId, [], ['STARRED']);
      break;
    case 'archive':
      // Remove from INBOX without adding TRASH
      await gmailModify(account, messageId, [], ['INBOX']);
      break;
    case 'trash':
      await gmailTrash(account, messageId);
      break;
    case 'spam':
      await gmailModify(account, messageId, ['SPAM'], ['INBOX']);
      break;
    case 'restore':
      await gmailUntrash(account, messageId);
      break;
    case 'delete':
      // Permanent delete: must already be in trash
      await gmailTrash(account, messageId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function applyMicrosoftAction(
  account: MicrosoftAccount,
  messageId: string,
  action: EmailAction,
): Promise<void> {
  switch (action) {
    case 'read':
      await msUpdate(account, messageId, { isRead: true });
      break;
    case 'unread':
      await msUpdate(account, messageId, { isRead: false });
      break;
    case 'star':
      await msUpdate(account, messageId, { flag: { flagStatus: 'flagged' } });
      break;
    case 'unstar':
      await msUpdate(account, messageId, { flag: { flagStatus: 'notFlagged' } });
      break;
    case 'archive':
      await msMove(account, messageId, MS_FOLDER_IDS.archive);
      break;
    case 'trash':
      await msMove(account, messageId, MS_FOLDER_IDS.trash);
      break;
    case 'spam':
      await msMove(account, messageId, MS_FOLDER_IDS.spam);
      break;
    case 'restore':
      await msMove(account, messageId, MS_FOLDER_IDS.inbox);
      break;
    case 'delete':
      await msDelete(account, messageId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function applyLocalCacheUpdate(
  accountId: string,
  messageId: string,
  action: EmailAction,
): void {
  const email = getEmail(accountId, messageId);
  if (!email) return;

  switch (action) {
    case 'read':
      updateEmail(accountId, messageId, { isRead: true });
      break;
    case 'unread':
      updateEmail(accountId, messageId, { isRead: false });
      break;
    case 'star':
      updateEmail(accountId, messageId, { isStarred: true });
      break;
    case 'unstar':
      updateEmail(accountId, messageId, { isStarred: false });
      break;
    case 'archive':
      updateEmail(accountId, messageId, { folder: 'archive' });
      break;
    case 'trash':
      updateEmail(accountId, messageId, { folder: 'trash' });
      break;
    case 'spam':
      updateEmail(accountId, messageId, { folder: 'spam' });
      break;
    case 'restore':
      updateEmail(accountId, messageId, { folder: 'inbox' });
      break;
    case 'delete':
      removeEmail(accountId, messageId);
      break;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId, messageId, action } = req.body ?? {};

    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
    if (!messageId) return res.status(400).json({ error: 'messageId é obrigatório' });
    if (!action) return res.status(400).json({ error: 'action é obrigatório' });

    const validActions: EmailAction[] = [
      'read', 'unread', 'star', 'unstar', 'archive', 'trash', 'spam', 'restore', 'delete',
    ];
    if (!validActions.includes(action as EmailAction)) {
      return res.status(400).json({ error: `action inválida: ${action}` });
    }

    const account = await fsGet('email_accounts', String(accountId));
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    if (account.provider === 'gmail') {
      await applyGmailAction(account as GmailAccount, String(messageId), action as EmailAction);
    } else if (account.provider === 'microsoft') {
      await applyMicrosoftAction(account as MicrosoftAccount, String(messageId), action as EmailAction);
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }

    // Update local cache
    applyLocalCacheUpdate(String(accountId), String(messageId), action as EmailAction);

    // Emit socket event
    emitGlobal('email:update', {
      type: 'action',
      userId: account.userId,
      accountId: String(accountId),
      messageId: String(messageId),
      action,
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[email/action] error:', err);
    return res.status(500).json({ error: 'Erro ao executar ação', detail: err?.message });
  }
}
