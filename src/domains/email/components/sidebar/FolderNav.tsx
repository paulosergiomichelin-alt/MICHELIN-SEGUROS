import React, { useState, useMemo } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { UnreadBadge } from '../shared/UnreadBadge';
import { useEmailFolders } from '../../hooks/useEmailFolders';
import { FIXED_FOLDERS } from '../../constants/folders';
import type { EmailFolderNode } from '../../types/email.types';

const FIXED_KEY_ALIAS: Record<string, string> = { archive: 'archived' };

interface TreeNode extends EmailFolderNode {
  children: TreeNode[];
}

function buildTree(folders: EmailFolderNode[], parentId: string | null): TreeNode[] {
  return folders
    .filter(f => f.parentId === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.id) }));
}

interface ContextMenuState {
  folderId: string;
  folderLabel: string;
  isSystem: boolean;
  x: number;
  y: number;
}

interface Props {
  currentFolder: string;
  unreadByFolder: Record<string, number>;
  onChangeFolder: (f: string, label?: string) => void;
  accountId: string | null;
  onCreateFolder: (name: string, parentId: string | null) => Promise<boolean>;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>;
  onDeleteFolder: (folderId: string) => Promise<boolean>;
  onEmptyFolder: (folderId: string) => Promise<boolean>;
  onMarkFolderRead: (folderId: string) => Promise<boolean>;
  onMoveMessage: (messageId: string, targetFolderId: string) => void;
}

export const FolderNav: React.FC<Props> = ({
  currentFolder, unreadByFolder, onChangeFolder, accountId,
  onCreateFolder, onRenameFolder, onDeleteFolder, onEmptyFolder, onMarkFolderRead, onMoveMessage,
}) => {
  const { folders: realFolders, refetch } = useEmailFolders(accountId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const rootCustomFolders = useMemo(() => buildTree(realFolders, null), [realFolders]);
  const childrenByFixedKey = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const folder of FIXED_FOLDERS) {
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

  const openContextMenu = (e: React.MouseEvent, folderId: string, folderLabel: string, isSystem: boolean) => {
    e.preventDefault();
    setContextMenu({ folderId, folderLabel, isSystem, x: e.clientX, y: e.clientY });
  };

  const handleDrop = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const messageId = e.dataTransfer.getData('text/plain');
    if (messageId) onMoveMessage(messageId, folderId);
  };

  const handleContextAction = async (kind: 'new' | 'rename' | 'delete' | 'empty' | 'readall') => {
    if (!contextMenu) return;
    const { folderId, folderLabel } = contextMenu;
    setContextMenu(null);

    if (kind === 'new') {
      const name = window.prompt('Nome da nova subpasta:');
      if (!name || !name.trim()) return;
      const ok = await onCreateFolder(name.trim(), folderId);
      if (ok) refetch(); else window.alert('Não foi possível criar a pasta.');
    } else if (kind === 'rename') {
      const name = window.prompt('Novo nome da pasta:', folderLabel);
      if (!name || !name.trim() || name.trim() === folderLabel) return;
      const ok = await onRenameFolder(folderId, name.trim());
      if (ok) refetch(); else window.alert('Não foi possível renomear a pasta.');
    } else if (kind === 'delete') {
      if (!window.confirm(`Excluir a pasta "${folderLabel}"? As mensagens dela também são excluídas no provedor.`)) return;
      const ok = await onDeleteFolder(folderId);
      if (ok) refetch(); else window.alert('Não foi possível excluir a pasta.');
    } else if (kind === 'empty') {
      const permanent = folderId === 'trash' || folderId === 'spam';
      const msg = permanent
        ? `Esvaziar "${folderLabel}"? As mensagens serão excluídas definitivamente.`
        : `Esvaziar "${folderLabel}"? As mensagens serão movidas para a Lixeira.`;
      if (!window.confirm(msg)) return;
      const ok = await onEmptyFolder(folderId);
      if (!ok) window.alert('Não foi possível esvaziar a pasta.');
    } else if (kind === 'readall') {
      await onMarkFolderRead(folderId);
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number) => {
    const isActive = currentFolder === node.id;
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <button
          onClick={() => onChangeFolder(node.id, node.name)}
          onContextMenu={e => openContextMenu(e, node.id, node.name, false)}
          onDragOver={e => { e.preventDefault(); setDragOverId(node.id); }}
          onDragLeave={() => setDragOverId(prev => (prev === node.id ? null : prev))}
          onDrop={e => handleDrop(e, node.id)}
          className={cn(
            'w-full flex items-center gap-1.5 py-1.5 rounded-lg text-sm transition-all group',
            isActive ? 'bg-[#1B4D8F]/10 text-[#1B4D8F] font-medium' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            dragOverId === node.id && 'ring-1 ring-[#1B4D8F]/50 bg-[#1B4D8F]/8',
          )}
          style={{ paddingLeft: 10 + depth * 16, paddingRight: 10 }}
        >
          {hasChildren ? (
            <span role="button" onClick={e => { e.stopPropagation(); toggleExpanded(node.id); }} className="shrink-0 -ml-1">
              <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90')} />
            </span>
          ) : (
            <span className="w-3.5 h-3.5 shrink-0" />
          )}
          <Folder className={cn('w-4 h-4 shrink-0', isActive ? 'text-[#1B4D8F]' : 'text-slate-400 group-hover:text-slate-600')} />
          <span className="flex-1 text-left truncate">{node.name}</span>
          <UnreadBadge count={node.unreadCount} active={isActive} />
        </button>
        {hasChildren && isExpanded && node.children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
      {FIXED_FOLDERS.map(folder => {
        const Icon = folder.icon;
        const unread = unreadByFolder[folder.id] ?? 0;
        const isActive = currentFolder === folder.id;
        const children = childrenByFixedKey.get(folder.id) ?? [];
        const hasChildren = children.length > 0;
        const isExpanded = expanded.has(folder.id);
        return (
          <div key={folder.id}>
            <button
              onClick={() => onChangeFolder(folder.id, folder.label)}
              onContextMenu={e => openContextMenu(e, folder.id, folder.label, true)}
              onDragOver={e => { e.preventDefault(); setDragOverId(folder.id); }}
              onDragLeave={() => setDragOverId(prev => (prev === folder.id ? null : prev))}
              onDrop={e => handleDrop(e, folder.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all group',
                isActive
                  ? 'bg-[#1B4D8F]/10 text-[#1B4D8F] font-medium'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                dragOverId === folder.id && 'ring-1 ring-[#1B4D8F]/50 bg-[#1B4D8F]/8',
              )}
            >
              {hasChildren ? (
                <span role="button" onClick={e => { e.stopPropagation(); toggleExpanded(folder.id); }} className="shrink-0 -ml-1">
                  <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90')} />
                </span>
              ) : (
                <span className="w-3.5 h-3.5 shrink-0" />
              )}
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-[#1B4D8F]' : 'group-hover:text-slate-700')} />
              <span className="flex-1 text-left truncate">{folder.label}</span>
              <UnreadBadge count={unread} active={isActive} />
            </button>
            {hasChildren && isExpanded && children.map(child => renderTreeNode(child, 1))}
          </div>
        );
      })}

      {rootCustomFolders.length > 0 && (
        <div className="pt-2 mt-2 border-t border-slate-200">
          {rootCustomFolders.map(node => renderTreeNode(node, 0))}
        </div>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleContextAction('new')}
              className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              Nova subpasta
            </button>
            {!contextMenu.isSystem && (
              <>
                <button
                  onClick={() => handleContextAction('rename')}
                  className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  Renomear
                </button>
                <button
                  onClick={() => handleContextAction('delete')}
                  className="w-full text-left px-3 py-2 text-xs text-[#C0392B]/80 hover:bg-slate-50 hover:text-[#C0392B] transition-colors"
                >
                  Excluir
                </button>
              </>
            )}
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={() => handleContextAction('empty')}
              className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              Esvaziar pasta
            </button>
            <button
              onClick={() => handleContextAction('readall')}
              className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              Marcar tudo como lido
            </button>
          </div>
        </>
      )}
    </nav>
  );
};
