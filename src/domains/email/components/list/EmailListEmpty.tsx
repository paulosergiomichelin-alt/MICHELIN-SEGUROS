import React from 'react';
import { Mail, MailOpen, Search, Loader2 } from 'lucide-react';
import { EmptyState } from '../../../../components/ui';

type EmptyType = 'no-accounts' | 'empty-folder' | 'no-results' | 'searching';

interface Props {
  type: EmptyType;
}

const CONFIG: Record<Exclude<EmptyType, 'searching'>, { icon: React.ElementType; message: string }> = {
  'no-accounts': {
    icon: Mail,
    message: 'Nenhuma conta conectada',
  },
  'empty-folder': {
    icon: MailOpen,
    message: 'Nenhuma mensagem',
  },
  'no-results': {
    icon: Search,
    message: 'Nenhum resultado encontrado',
  },
};

export const EmailListEmpty: React.FC<Props> = ({ type }) => {
  if (type === 'searching') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3 py-10">
        <Loader2 className="w-8 h-8 text-[#1B4D8F] animate-spin" />
        <p className="text-slate-400 text-sm">Buscando...</p>
      </div>
    );
  }

  const { icon, message } = CONFIG[type];
  return (
    <div className="h-full flex items-center justify-center">
      <EmptyState icon={icon} title={message} />
    </div>
  );
};
