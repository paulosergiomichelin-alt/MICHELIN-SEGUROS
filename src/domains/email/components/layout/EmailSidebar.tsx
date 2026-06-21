import React from 'react';
import { Plus, RefreshCw, Cog } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { useEmail } from '../../../../contexts/EmailContext';
import { FolderNav } from '../sidebar/FolderNav';
import { AccountSelector } from '../sidebar/AccountSelector';

interface Props {
  onOpenSettings: () => void;
}

export const EmailSidebar: React.FC<Props> = ({ onOpenSettings }) => {
  const { state, changeFolder, selectAccount, triggerSync, openComposer } = useEmail();
  const { currentFolder, accounts, selectedAccountId, syncing, unreadByFolder } = state;

  return (
    <aside className="w-full shrink-0 bg-[#111111] border-r border-white/5 flex flex-col h-full overflow-hidden">
      <div className="p-3">
        <button
          onClick={() => openComposer('new')}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus className="w-4 h-4" />
          Novo E-mail
        </button>
      </div>

      <AccountSelector
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelect={selectAccount}
      />

      <FolderNav
        currentFolder={currentFolder}
        unreadByFolder={unreadByFolder}
        onChangeFolder={changeFolder}
      />

      <div className="p-2 border-t border-white/5 flex gap-1">
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all text-xs disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
        <button
          onClick={onOpenSettings}
          title="Configurações de e-mail"
          className="flex items-center justify-center p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
        >
          <Cog className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
