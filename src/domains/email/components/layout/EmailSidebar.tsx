import React from 'react';
import { Cog, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEmail } from '../../../../contexts/EmailContext';
import { FolderNav } from '../sidebar/FolderNav';
import { AccountSelector } from '../sidebar/AccountSelector';

interface Props {
  onOpenSettings: () => void;
}

export const EmailSidebar: React.FC<Props> = ({ onOpenSettings }) => {
  const navigate = useNavigate();
  const {
    state, changeFolder, selectAccount,
    createFolder, renameFolder, deleteFolder, emptyFolder, markFolderRead, moveMessage,
  } = useEmail();
  const { currentFolder, accounts, selectedAccountId, unreadByFolder } = state;

  return (
    <aside className="w-full shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col h-full overflow-hidden">
      <AccountSelector
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelect={selectAccount}
      />

      <FolderNav
        currentFolder={currentFolder}
        unreadByFolder={unreadByFolder}
        onChangeFolder={changeFolder}
        accountId={selectedAccountId}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onEmptyFolder={emptyFolder}
        onMarkFolderRead={markFolderRead}
        onMoveMessage={moveMessage}
      />

      <div className="p-2 border-t border-slate-200 flex gap-1">
        <button
          onClick={() => navigate('/email/contas')}
          title="Contas de e-mail"
          className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
        >
          <Users className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onOpenSettings}
          title="Configurações de e-mail"
          className="flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
        >
          <Cog className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
