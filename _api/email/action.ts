import { fsGet } from '../lib/pgData.js';
import { getEmail, updateEmail, removeEmail, setEmail } from '../lib/emailCache.js';
import { emitGlobal } from '../lib/socketRegistry.js';
import {
  modifyMessage as gmailModify,
  trashMessage as gmailTrash,
  untrashMessage as gmailUntrash,
  FOLDER_LABEL_MAP as GMAIL_FOLDER_LABEL_MAP,
  GmailAccount,
} from '../lib/gmailClient.js';
import {
  updateMessage as msUpdate,
  moveMessage as msMove,
  deleteMessage as msDelete,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';
import {
  modifyMessage as imapModify,
  moveMessage as imapMove,
  deleteMessage as imapDelete,
  imapUid,
  imapCacheFolder,
  ImapAccount,
} from '../lib/imapClient.js';

type EmailAction =
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'archive'
  | 'trash'
  | 'spam'
  | 'restore'
  | 'delete'
  | 'move'
  | 'notspam';

const MS_FOLDER_IDS: Record<string, string> = {
  inbox: 'inbox',
  trash: 'deleteditems',
  spam: 'junkemail',
  archive: 'archive',
  sent: 'sentitems',
  drafts: 'drafts',
};

// O frontend usa 'archived' como chave fixa, mas os clients de provedor usam 'archive'
// internamente (mesmo alias já usado em _api/email/folders.ts) — normaliza só o
// sourceFolderId recebido do frontend antes de consultar GMAIL_FOLDER_LABEL_MAP.
const FOLDER_KEY_ALIASES: Record<string, string> = { archived: 'archive' };
function normalizeFolderKey(id: string): string {
  return FOLDER_KEY_ALIASES[id] ?? id;
}

async function applyGmailAction(
  account: GmailAccount,
  messageId: string,
  action: EmailAction,
  opts: { targetFolderId?: string; sourceFolderId?: string } = {},
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
    case 'notspam':
      // Diferente de 'restore' (que só desfaz TRASH via untrash) — sair do Spam
      // precisa remover SPAM e adicionar INBOX explicitamente.
      await gmailModify(account, messageId, ['INBOX'], ['SPAM']);
      break;
    case 'move': {
      if (!opts.targetFolderId) throw new Error('targetFolderId é obrigatório pra action "move"');
      const source = opts.sourceFolderId ? normalizeFolderKey(opts.sourceFolderId) : undefined;
      const removeLabelIds = source ? (GMAIL_FOLDER_LABEL_MAP[source] ?? [source]) : [];
      await gmailModify(account, messageId, [opts.targetFolderId], removeLabelIds);
      break;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function applyMicrosoftAction(
  account: MicrosoftAccount,
  messageId: string,
  action: EmailAction,
  opts: { targetFolderId?: string } = {},
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
    case 'notspam':
      await msMove(account, messageId, MS_FOLDER_IDS.inbox);
      break;
    case 'delete':
      await msDelete(account, messageId);
      break;
    case 'move':
      if (!opts.targetFolderId) throw new Error('targetFolderId é obrigatório pra action "move"');
      await msMove(account, messageId, opts.targetFolderId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// Ações IMAP que movem a mensagem para outra pasta. O MOVE atribui um UID NOVO
// no destino, então a entrada de cache antiga (UID velho + pasta nova) passa a
// apontar para outra mensagem real — por isso ela é REMOVIDA do cache (I1) em
// vez de re-etiquetada, deixando o próximo sync reimportar com o UID correto.
const IMAP_MOVE_ACTIONS: ReadonlySet<EmailAction> = new Set<EmailAction>([
  'archive', 'trash', 'spam', 'restore', 'move', 'notspam',
]);

async function applyImapAction(
  account: ImapAccount,
  messageId: string,
  action: EmailAction,
  currentFolder: string,
  opts: { targetFolderId?: string } = {},
): Promise<void> {
  // `messageId` aqui é o cache id namespaceado (`${folder}:${uid}`); as funções
  // do imapClient recebem (account, folder, UID PURO).
  const uid = imapUid(messageId);

  switch (action) {
    case 'read':
      await imapModify(account, currentFolder, uid, ['\\Seen'], []);
      break;
    case 'unread':
      await imapModify(account, currentFolder, uid, [], ['\\Seen']);
      break;
    case 'star':
      await imapModify(account, currentFolder, uid, ['\\Flagged'], []);
      break;
    case 'unstar':
      await imapModify(account, currentFolder, uid, [], ['\\Flagged']);
      break;
    case 'archive':
      await imapMove(account, currentFolder, uid, 'archive');
      break;
    case 'trash':
      await imapMove(account, currentFolder, uid, 'trash');
      break;
    case 'spam':
      await imapMove(account, currentFolder, uid, 'spam');
      break;
    case 'restore':
    case 'notspam':
      await imapMove(account, currentFolder, uid, 'inbox');
      break;
    case 'delete':
      await imapDelete(account, currentFolder, uid);
      break;
    case 'move':
      if (!opts.targetFolderId) throw new Error('targetFolderId é obrigatório pra action "move"');
      await imapMove(account, currentFolder, uid, opts.targetFolderId);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function applyLocalCacheUpdate(
  accountId: string,
  messageId: string,
  action: EmailAction,
  provider: string,
  targetFolderId?: string,
): void {
  const email = getEmail(accountId, messageId);
  if (!email) return;

  // IMAP: o MOVE gera um UID novo no destino, logo manter a entrada viva com o
  // UID antigo faria a próxima ação bater em outra mensagem real. Remove e
  // deixa o sync reimportar. Gmail/Microsoft usam ids estáveis — inalterados.
  if (provider === 'imap' && IMAP_MOVE_ACTIONS.has(action)) {
    removeEmail(accountId, messageId);
    return;
  }

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
    case 'notspam':
      updateEmail(accountId, messageId, { folder: 'inbox' });
      break;
    case 'delete':
      removeEmail(accountId, messageId);
      break;
    case 'move':
      if (targetFolderId) updateEmail(accountId, messageId, { folder: targetFolderId });
      break;
  }
}

// Reaproveitado por emailSync.ts pra mover mensagens automaticamente segundo as
// regras (email_rules) logo após importar uma mensagem nova na inbox — mesma
// lógica por trás da action 'move' manual, só que chamada direto (sem passar
// pelo handler HTTP).
export async function applyMoveAction(
  account: Record<string, any>,
  messageId: string,
  targetFolderId: string,
  currentFolder: string,
): Promise<void> {
  if (account.provider === 'gmail') {
    await applyGmailAction(account as GmailAccount, messageId, 'move', { targetFolderId, sourceFolderId: currentFolder });
  } else if (account.provider === 'microsoft') {
    await applyMicrosoftAction(account as MicrosoftAccount, messageId, 'move', { targetFolderId });
  } else if (account.provider === 'imap') {
    await applyImapAction(account as ImapAccount, messageId, 'move', currentFolder, { targetFolderId });
  } else {
    throw new Error(`Provider desconhecido: ${account.provider}`);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId, messageId, action, targetFolderId, sourceFolderId } = req.body ?? {};

    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
    if (!messageId) return res.status(400).json({ error: 'messageId é obrigatório' });
    if (!action) return res.status(400).json({ error: 'action é obrigatório' });

    const validActions: EmailAction[] = [
      'read', 'unread', 'star', 'unstar', 'archive', 'trash', 'spam', 'restore', 'delete', 'move', 'notspam',
    ];
    if (!validActions.includes(action as EmailAction)) {
      return res.status(400).json({ error: `action inválida: ${action}` });
    }
    if (action === 'move' && !targetFolderId) {
      return res.status(400).json({ error: 'targetFolderId é obrigatório pra action "move"' });
    }

    const account = await fsGet('email_accounts', String(accountId));
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    const cachedForFolder = getEmail(String(accountId), String(messageId));
    // Para IMAP o próprio id já carrega a pasta (`${folder}:${uid}`), então a
    // ação continua indo para a pasta certa mesmo com cache miss (ex.: após
    // restart do servidor), em vez de cair silenciosamente em 'inbox'.
    const currentFolder =
      cachedForFolder?.folder ?? imapCacheFolder(String(messageId)) ?? 'inbox';

    if (account.provider === 'gmail') {
      await applyGmailAction(account as GmailAccount, String(messageId), action as EmailAction, {
        targetFolderId, sourceFolderId: sourceFolderId ?? currentFolder,
      });
    } else if (account.provider === 'microsoft') {
      await applyMicrosoftAction(account as MicrosoftAccount, String(messageId), action as EmailAction, { targetFolderId });
    } else if (account.provider === 'imap') {
      await applyImapAction(account as ImapAccount, String(messageId), action as EmailAction, currentFolder, { targetFolderId });
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }

    // Update local cache
    applyLocalCacheUpdate(
      String(accountId),
      String(messageId),
      action as EmailAction,
      String(account.provider),
      targetFolderId,
    );

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
