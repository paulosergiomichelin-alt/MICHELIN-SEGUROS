import { useState, useEffect, useCallback } from 'react';
import { EmailService, EmailFolderNode } from '../../../services/EmailService';

/**
 * Busca a árvore de pastas reais de uma conta (Gmail labels / Microsoft mailFolders /
 * IMAP LIST) — extraído de FolderNav.tsx pra ser reaproveitado também pelo menu
 * "Mover para" nos itens da lista de mensagens (EmailListItem).
 */
export function useEmailFolders(accountId: string | null): { folders: EmailFolderNode[]; refetch: () => void } {
  const [folders, setFolders] = useState<EmailFolderNode[]>([]);

  const fetchFolders = useCallback(() => {
    if (!accountId) { setFolders([]); return; }
    EmailService.getFolders(accountId).then(setFolders).catch(() => setFolders([]));
  }, [accountId]);

  useEffect(() => {
    if (!accountId) { setFolders([]); return; }
    let cancelled = false;
    EmailService.getFolders(accountId)
      .then(f => { if (!cancelled) setFolders(f); })
      .catch(() => { if (!cancelled) setFolders([]); });
    return () => { cancelled = true; };
  }, [accountId]);

  return { folders, refetch: fetchFolders };
}
