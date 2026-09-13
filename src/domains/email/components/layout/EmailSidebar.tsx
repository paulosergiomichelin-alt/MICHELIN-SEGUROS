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
  const { state, changeFolder, selectAccount } = useEmail();
  const { currentFolder, accounts, selectedAccountId, unreadByFolder } = state;

  return (
    <aside className="w-full shrink-0 bg-[#111111] border-r border-white/5 flex flex-col h-full overflow-hidden">
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
      />

      <div className="p-2 border-t border-white/5 flex gap-1">
        <button
          onClick={() => navigate('/email/contas')}
          title="Contas de e-mail"
          className="flex items-center justify-center p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
        >
          <Users className="w-3.5 h-3.5" />
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
