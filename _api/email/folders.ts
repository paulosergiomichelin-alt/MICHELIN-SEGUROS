import { fsGet } from '../lib/pgData.js';
import {
  listFolders as msListFolders, createFolder as msCreateFolder, renameFolder as msRenameFolder,
  deleteFolder as msDeleteFolder, listAllMessageIds as msListAllMessageIds,
  updateMessage as msUpdateMessage, moveMessage as msMoveMessage, deleteMessage as msDeleteMessage,
  moveFolder as msMoveFolder,
  MicrosoftAccount,
} from '../lib/microsoftClient.js';
import {
  listLabels as gmailListLabels, createLabel as gmailCreateLabel, renameLabel as gmailRenameLabel,
  deleteLabel as gmailDeleteLabel, listAllMessageIds as gmailListAllMessageIds,
  modifyMessage as gmailModifyMessage, trashMessage as gmailTrashMessage,
  deleteMessagePermanently as gmailDeleteMessagePermanently, GmailAccount,
} from '../lib/gmailClient.js';
import {
  listFoldersTree as imapListFoldersTree, createFolder as imapCreateFolder,
  renameFolder as imapRenameFolder, deleteFolder as imapDeleteFolder,
  markAllRead as imapMarkAllRead, moveAllMessages as imapMoveAllMessages,
  deleteAllMessages as imapDeleteAllMessages, ImapAccount,
} from '../lib/imapClient.js';

// Formato comum devolvido pros 3 provedores — o frontend não precisa saber a
// particularidade de cada um (labels do Gmail, mailFolders do Graph, LIST do IMAP).
export interface EmailFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  unreadCount: number;
}

// O frontend usa a chave fixa 'archived', mas os 3 clients de provedor usam 'archive'
// internamente (FOLDER_LABEL_MAP/MS_FOLDER_IDS/FOLDER_KEYS) — sem normalizar aqui,
// "esvaziar Arquivados" seria tratado como uma pasta customizada inexistente.
const FOLDER_KEY_ALIASES: Record<string, string> = { archived: 'archive' };
function normalizeFolderId(id: string): string {
  return FOLDER_KEY_ALIASES[id] ?? id;
}

// Pastas de sistema nunca podem ser renomeadas/excluídas — só esvaziadas/marcadas como lidas.
const SYSTEM_FOLDER_KEYS = new Set(['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'archived']);

// Esvaziar Lixeira/Spam exclui definitivamente; qualquer outra pasta move tudo pra Lixeira.
const PERMANENT_EMPTY_FOLDERS = new Set(['trash', 'spam']);

async function loadAccount(accountId: string): Promise<Record<string, any>> {
  const account = await fsGet('email_accounts', accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  return account;
}

async function listFoldersForAccount(account: Record<string, any>): Promise<EmailFolderNode[]> {
  if (account.provider === 'gmail') {
    const labels = await gmailListLabels(account as GmailAccount);
    return labels.map(l => ({ id: l.id, name: l.name, parentId: l.parentId, unreadCount: l.unreadCount }));
  }
  if (account.provider === 'microsoft') {
    const folders = await msListFolders(account as MicrosoftAccount);
    return folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, unreadCount: f.unreadCount }));
  }
  if (account.provider === 'imap') {
    const folders = await imapListFoldersTree(account as ImapAccount);
    return folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, unreadCount: f.unreadCount }));
  }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function createFolderForAccount(
  account: Record<string, any>,
  name: string,
  parentId: string | null,
): Promise<{ id: string; name: string }> {
  // Gmail não tem conceito de "subpasta de Inbox/Enviados/etc" — as 6 pastas fixas não
  // são labels reais nesse provedor. Um pai fixo vira label raiz em vez de tentar
  // buscar um label inexistente com esse id.
  const normalizedParentId = account.provider === 'gmail' && parentId && SYSTEM_FOLDER_KEYS.has(parentId)
    ? null
    : parentId;

  if (account.provider === 'gmail') return gmailCreateLabel(account as GmailAccount, name, normalizedParentId);
  if (account.provider === 'microsoft') return msCreateFolder(account as MicrosoftAccount, name, normalizedParentId);
  if (account.provider === 'imap') return imapCreateFolder(account as ImapAccount, name, normalizedParentId);
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function renameFolderForAccount(account: Record<string, any>, folderId: string, name: string): Promise<void> {
  if (SYSTEM_FOLDER_KEYS.has(folderId)) throw new Error('Pastas de sistema não podem ser renomeadas');
  if (account.provider === 'gmail') { await gmailRenameLabel(account as GmailAccount, folderId, name); return; }
  if (account.provider === 'microsoft') { await msRenameFolder(account as MicrosoftAccount, folderId, name); return; }
  if (account.provider === 'imap') { await imapRenameFolder(account as ImapAccount, folderId, name); return; }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function deleteFolderForAccount(account: Record<string, any>, folderId: string): Promise<void> {
  if (SYSTEM_FOLDER_KEYS.has(folderId)) throw new Error('Pastas de sistema não podem ser excluídas');
  if (account.provider === 'gmail') { await gmailDeleteLabel(account as GmailAccount, folderId); return; }
  if (account.provider === 'microsoft') { await msDeleteFolder(account as MicrosoftAccount, folderId); return; }
  if (account.provider === 'imap') { await imapDeleteFolder(account as ImapAccount, folderId); return; }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

// Relocaliza uma pasta customizada já existente pra debaixo de outra (ex.: uma pasta
// de seguradora criada solta na raiz antes do padrão virar "sempre subpasta da Inbox").
// Gmail não tem esse conceito (labels não têm hierarquia real sob Inbox) e IMAP ainda
// não tem essa operação implementada — só Microsoft por enquanto.
async function moveFolderForAccount(account: Record<string, any>, folderId: string, destinationId: string): Promise<void> {
  if (SYSTEM_FOLDER_KEYS.has(folderId)) throw new Error('Pastas de sistema não podem ser movidas');
  if (account.provider === 'microsoft') { await msMoveFolder(account as MicrosoftAccount, folderId, destinationId); return; }
  throw new Error(`Mover pasta ainda não é suportado para o provedor "${account.provider}"`);
}

async function emptyFolderForAccount(account: Record<string, any>, folderId: string): Promise<void> {
  const permanent = PERMANENT_EMPTY_FOLDERS.has(folderId);

  if (account.provider === 'gmail') {
    const ids = await gmailListAllMessageIds(account as GmailAccount, folderId);
    for (const id of ids) {
      if (permanent) await gmailDeleteMessagePermanently(account as GmailAccount, id);
      else await gmailTrashMessage(account as GmailAccount, id);
    }
    return;
  }
  if (account.provider === 'microsoft') {
    const ids = await msListAllMessageIds(account as MicrosoftAccount, folderId);
    for (const id of ids) {
      if (permanent) await msDeleteMessage(account as MicrosoftAccount, id);
      else await msMoveMessage(account as MicrosoftAccount, id, 'deleteditems');
    }
    return;
  }
  if (account.provider === 'imap') {
    if (permanent) await imapDeleteAllMessages(account as ImapAccount, folderId);
    else await imapMoveAllMessages(account as ImapAccount, folderId, 'trash');
    return;
  }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

async function markFolderReadForAccount(account: Record<string, any>, folderId: string): Promise<void> {
  if (account.provider === 'gmail') {
    const ids = await gmailListAllMessageIds(account as GmailAccount, folderId);
    for (const id of ids) await gmailModifyMessage(account as GmailAccount, id, [], ['UNREAD']);
    return;
  }
  if (account.provider === 'microsoft') {
    const ids = await msListAllMessageIds(account as MicrosoftAccount, folderId);
    for (const id of ids) await msUpdateMessage(account as MicrosoftAccount, id, { isRead: true });
    return;
  }
  if (account.provider === 'imap') { await imapMarkAllRead(account as ImapAccount, folderId); return; }
  throw new Error(`Provider desconhecido: ${account.provider}`);
}

export default async function handler(req: any, res: any) {
  try {
    const url: string = req.url ?? '';
    const pathParts = url.split('?')[0].split('/').filter(Boolean);
    const idIndex = pathParts.indexOf('folders') + 1;
    const rawId = req.params?.id ?? (pathParts.length > idIndex ? pathParts[idIndex] : undefined);
    const folderId = rawId ? normalizeFolderId(decodeURIComponent(rawId)) : undefined;
    const subAction = pathParts.length > idIndex + 1 ? pathParts[idIndex + 1] : undefined;

    if (req.method === 'GET') {
      const { accountId } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      const folders = await listFoldersForAccount(account);
      return res.status(200).json({ folders });
    }

    if (req.method === 'POST' && !folderId) {
      const { accountId, name, parentId } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'name é obrigatório' });
      const account = await loadAccount(String(accountId));
      const created = await createFolderForAccount(account, String(name).trim(), parentId ? String(parentId) : null);
      return res.status(200).json({ folder: created });
    }

    if (req.method === 'POST' && folderId && subAction === 'empty') {
      const { accountId } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      await emptyFolderForAccount(account, folderId);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && folderId && subAction === 'move-folder') {
      const { accountId, destinationId } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      if (!destinationId) return res.status(400).json({ error: 'destinationId é obrigatório' });
      const account = await loadAccount(String(accountId));
      await moveFolderForAccount(account, folderId, normalizeFolderId(String(destinationId)));
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && folderId && subAction === 'read-all') {
      const { accountId } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      await markFolderReadForAccount(account, folderId);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PATCH' && folderId) {
      const { accountId, name } = req.body ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      if (!name || !String(name).trim()) return res.status(400).json({ error: 'name é obrigatório' });
      const account = await loadAccount(String(accountId));
      await renameFolderForAccount(account, folderId, String(name).trim());
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE' && folderId) {
      const { accountId } = req.query ?? {};
      if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });
      const account = await loadAccount(String(accountId));
      await deleteFolderForAccount(account, folderId);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[email/folders] error:', err);
    return res.status(500).json({ error: 'Erro na operação de pasta', detail: err?.message });
  }
}
