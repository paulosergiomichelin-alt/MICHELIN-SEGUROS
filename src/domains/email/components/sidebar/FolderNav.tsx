import React from 'react';
import { Inbox, Send, Archive, Trash2, AlertCircle, FileText } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { UnreadBadge } from '../shared/UnreadBadge';

const FOLDERS = [
  { id: 'inbox', label: 'Caixa de Entrada', icon: Inbox },
  { id: 'sent', label: 'Enviados', icon: Send },
  { id: 'drafts', label: 'Rascunhos', icon: FileText },
  { id: 'archived', label: 'Arquivados', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertCircle },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
];

interface Props {
  currentFolder: string;
  unreadByFolder: Record<string, number>;
  onChangeFolder: (f: string) => void;
}

export const FolderNav: React.FC<Props> = ({ currentFolder, unreadByFolder, onChangeFolder }) => {
  return (
    <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
      {FOLDERS.map(folder => {
        const Icon = folder.icon;
        const unread = unreadByFolder[folder.id] ?? 0;
        const isActive = currentFolder === folder.id;
        return (
          <button
            key={folder.id}
            onClick={() => onChangeFolder(folder.id)}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all group',
              isActive
                ? 'bg-blue-600/20 text-blue-300 font-medium'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80',
            )}
          >
            <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-blue-400' : 'group-hover:text-white/70')} />
            <span className="flex-1 text-left truncate">{folder.label}</span>
            <UnreadBadge count={unread} active={isActive} />
          </button>
        );
      })}
    </nav>
  );
};
