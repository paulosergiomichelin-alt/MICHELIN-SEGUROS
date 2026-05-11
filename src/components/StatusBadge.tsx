import React from 'react';
import { 
  PlusCircle, 
  MessageSquare, 
  FileText, 
  FileSearch, 
  Clock, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  X 
} from 'lucide-react';
import { LeadStatus } from '../types';
import { cn } from '../lib/utils';

export const StatusBadge = ({ status }: { status: LeadStatus }) => {
  const styles: Record<string, string> = {
    'Novo Lead': 'bg-white/5 text-white/60 border-white/10',
    'Em Atendimento': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'Aguardando Documento': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    'Em Cotação': 'bg-gold-deep/10 text-gold-deep border-gold-deep/20',
    'Proposta Enviada': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    'Negociação': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'Fechado': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'Perdido': 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const icons: Record<string, React.ReactNode> = {
    'Novo Lead': <PlusCircle className="w-3 h-3 mr-1" />,
    'Em Atendimento': <MessageSquare className="w-3 h-3 mr-1" />,
    'Aguardando Documento': <FileSearch className="w-3 h-3 mr-1" />,
    'Em Cotação': <Clock className="w-3 h-3 mr-1" />,
    'Proposta Enviada': <Send className="w-3 h-3 mr-1" />,
    'Negociação': <Sparkles className="w-3 h-3 mr-1" />,
    'Fechado': <CheckCircle2 className="w-3 h-3 mr-1" />,
    'Perdido': <X className="w-3 h-3 mr-1" />,
  };

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold border flex items-center w-fit uppercase tracking-tighter", styles[status] || styles['Novo Lead'])}>
      {icons[status] || icons['Novo Lead']}
      {status}
    </span>
  );
};
