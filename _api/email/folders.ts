import { fsGet } from '../lib/pgData.js';
import { listFolders as msListFolders, MicrosoftAccount } from '../lib/microsoftClient.js';
import { listLabels as gmailListLabels, GmailAccount } from '../lib/gmailClient.js';
import { listFoldersTree as imapListFoldersTree, ImapAccount } from '../lib/imapClient.js';

// Formato comum devolvido pros 3 provedores — o frontend não precisa saber a
// particularidade de cada um (labels do Gmail, mailFolders do Graph, LIST do IMAP).
export interface EmailFolderNode {
  id: string;
  name: string;
  parentId: string | null; // chave fixa ('inbox'|'sent'|'drafts'|'trash'|'spam'|'archive') ou id/path real de outra pasta
  unreadCount: number;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId } = req.query ?? {};
    if (!accountId) return res.status(400).json({ error: 'accountId é obrigatório' });

    const account = await fsGet('email_accounts', String(accountId));
    if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

    let folders: EmailFolderNode[] = [];

    if (account.provider === 'gmail') {
      const labels = await gmailListLabels(account as GmailAccount);
      folders = labels.map(l => ({ id: l.id, name: l.name, parentId: l.parentId, unreadCount: l.unreadCount }));
    } else if (account.provider === 'microsoft') {
      const msFolders = await msListFolders(account as MicrosoftAccount);
      folders = msFolders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, unreadCount: f.unreadCount }));
    } else if (account.provider === 'imap') {
      const imapFolders = await imapListFoldersTree(account as ImapAccount);
      folders = imapFolders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, unreadCount: f.unreadCount }));
    } else {
      return res.status(400).json({ error: `Provider desconhecido: ${account.provider}` });
    }

    return res.status(200).json({ folders });
  } catch (err: any) {
    console.error('[email/folders] error:', err);
    return res.status(500).json({ error: 'Erro ao buscar pastas', detail: err?.message });
  }
}
