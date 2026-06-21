import React from 'react';
import { Mail, MailOpen, Search, Loader2 } from 'lucide-react';

type EmptyType = 'no-accounts' | 'empty-folder' | 'no-results' | 'searching';

interface Props {
  type: EmptyType;
}

const CONFIG: Record<EmptyType, { icon: React.ReactNode; message: string }> = {
  'no-accounts': {
    icon: <Mail className="w-10 h-10 text-white/10" />,
    message: 'Nenhuma conta conectada',
  },
  'empty-folder': {
    icon: <MailOpen className="w-10 h-10 text-white/10" />,
    message: 'Nenhuma mensagem',
  },
  'no-results': {
    icon: <Search className="w-10 h-10 text-white/10" />,
    message: 'Nenhum resultado encontrado',
  },
  'searching': {
    icon: <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />,
    message: 'Buscando...',
  },
};

export const EmailListEmpty: React.FC<Props> = ({ type }) => {
  const { icon, message } = CONFIG[type];
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3 py-10">
      {icon}
      <p className="text-white/30 text-sm">{message}</p>
    </div>
  );
};
