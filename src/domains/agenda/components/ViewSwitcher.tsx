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
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('today')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
        >
          Hoje
        </button>
        <button onClick={() => onNavigate('prev')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onNavigate('next')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-slate-800 text-sm font-semibold capitalize ml-2">{label}</span>
      </div>
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => onSetView(v.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              view === v.id ? 'bg-[#1B4D8F] text-white' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
};
