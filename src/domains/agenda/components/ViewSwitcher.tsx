import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { AgendaView } from '../../../contexts/AgendaContext';

interface Props {
  view: AgendaView;
  currentDate: string;
  onSetView: (view: AgendaView) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
}

const VIEWS: Array<{ id: AgendaView; label: string }> = [
  { id: 'day', label: 'Dia' },
  { id: 'workweek', label: 'Semana de Trabalho' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
];

export const ViewSwitcher: React.FC<Props> = ({ view, currentDate, onSetView, onNavigate }) => {
  const label = new Date(currentDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#141414]">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('today')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:bg-white/5 border border-white/10 transition-colors"
        >
          Hoje
        </button>
        <button onClick={() => onNavigate('prev')} className="p-1.5 rounded-lg text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onNavigate('next')} className="p-1.5 rounded-lg text-white/50 hover:bg-white/5 hover:text-white/80 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-white/80 text-sm font-semibold capitalize ml-2">{label}</span>
      </div>
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => onSetView(v.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              view === v.id ? 'bg-blue-600/30 text-blue-300' : 'text-white/50 hover:text-white/80',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
};
