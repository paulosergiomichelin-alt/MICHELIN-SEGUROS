import React, { useState, useEffect, useMemo } from 'react';
import { Inbox, Send, Archive, Trash2, AlertCircle, FileText, Folder, ChevronRight } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { UnreadBadge } from '../shared/UnreadBadge';
import { EmailService } from '../../../../services/EmailService';
import type { EmailFolderNode } from '../../types/email.types';

const FOLDERS = [
  { id: 'inbox', label: 'Caixa de Entrada', icon: Inbox },
  { id: 'sent', label: 'Enviados', icon: Send },
  { id: 'drafts', label: 'Rascunhos', icon: FileText },
  { id: 'archived', label: 'Arquivados', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertCircle },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
];

// "archived" é a chave usada na navegação fixa hoje, mas os provedores/backend usam
// "archive" pra essa mesma pasta — mapeamento só pra casar o parentId vindo da API.
const FIXED_KEY_ALIAS: Record<string, string> = { archive: 'archived' };

interface TreeNode extends EmailFolderNode {
  children: TreeNode[];
}

function buildTree(folders: EmailFolderNode[], parentId: string | null): TreeNode[] {
  return folders
    .filter(f => f.parentId === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.id) }));
}

interface Props {
  currentFolder: string;
  unreadByFolder: Record<string, number>;
  onChangeFolder: (f: string) => void;
  accountId: string | null;
}

export const FolderNav: React.FC<Props> = ({ currentFolder, unreadByFolder, onChangeFolder, accountId }) => {
  const [realFolders, setRealFolders] = useState<EmailFolderNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!accountId) { setRealFolders([]); return; }
    let cancelled = false;
    EmailService.getFolders(accountId)
      .then(folders => { if (!cancelled) setRealFolders(folders); })
      .catch(() => { if (!cancelled) setRealFolders([]); });
    return () => { cancelled = true; };
  }, [accountId]);

  const rootCustomFolders = useMemo(() => buildTree(realFolders, null), [realFolders]);
  const childrenByFixedKey = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const folder of FOLDERS) {
      // FOLDERS usa "archived" mas os provedores/backend usam "archive" como chave —
      // acha a chave real do provedor pra essa linha fixa antes de casar o parentId.
      const providerKey = Object.entries(FIXED_KEY_ALIAS).find(([, alias]) => alias === folder.id)?.[0] ?? folder.id;
      map.set(folder.id, buildTree(realFolders, providerKey));
    }
    return map;
  }, [realFolders]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderTreeNode = (node: TreeNode, depth: number) => {
    const isActive = currentFolder === node.id;
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <button
          onClick={() => onChangeFolder(node.id)}
          className={cn(
            'w-full flex items-center gap-1.5 py-1.5 rounded-lg text-xs transition-all group',
            isActive ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-white/45 hover:bg-white/5 hover:text-white/75',
          )}
          style={{ paddingLeft: 10 + depth * 16, paddingRight: 10 }}
        >
          {hasChildren ? (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); toggleExpanded(node.id); }}
              className="shrink-0 -ml-1"
            >
              <ChevronRight className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-90')} />
            </span>
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          <Folder className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-blue-400' : 'text-white/30 group-hover:text-white/60')} />
          <span className="flex-1 text-left truncate">{node.name}</span>
          <UnreadBadge count={node.unreadCount} active={isActive} />
        </button>
        {hasChildren && isExpanded && node.children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
      {FOLDERS.map(folder => {
        const Icon = folder.icon;
        const unread = unreadByFolder[folder.id] ?? 0;
        const isActive = currentFolder === folder.id;
        const children = childrenByFixedKey.get(folder.id) ?? [];
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(folder.id);
        return (
          <div key={folder.id}>
            <button
              onClick={() => onChangeFolder(folder.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all group',
                isActive
                  ? 'bg-blue-600/20 text-blue-300 font-medium'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80',
              )}
            >
              {hasChildren ? (
                <span
                  role="button"
                  onClick={e => { e.stopPropagation(); toggleExpanded(folder.id); }}
                  className="shrink-0 -ml-1"
                >
                  <ChevronRight className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-90')} />
                </span>
              ) : (
                <span className="w-3 h-3 shrink-0" />
              )}
              <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-blue-400' : 'group-hover:text-white/70')} />
              <span className="flex-1 text-left truncate">{folder.label}</span>
              <UnreadBadge count={unread} active={isActive} />
            </button>
            {hasChildren && isExpanded && children.map(child => renderTreeNode(child, 1))}
          </div>
        );
      })}

      {rootCustomFolders.length > 0 && (
        <div className="pt-2 mt-2 border-t border-white/5">
          {rootCustomFolders.map(node => renderTreeNode(node, 0))}
        </div>
      )}
    </nav>
  );
};
