import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface Props {
  currentDate: string;
  onSelectDate: (isoDate: string) => void;
}

function buildMonthGrid(reference: Date): Date[] {
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const startOffset = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export const MiniCalendar: React.FC<Props> = ({ currentDate, onSelectDate }) => {
  const [visibleMonth, setVisibleMonth] = React.useState(() => new Date(currentDate));
  const selected = new Date(currentDate);
  const today = new Date();

  const days = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const changeMonth = (delta: number) => {
    const next = new Date(visibleMonth);
    next.setMonth(next.getMonth() + delta);
    setVisibleMonth(next);
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div className="p-3 border-b border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-white/50 capitalize">{monthLabel}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => changeMonth(-1)} className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/5">
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button onClick={() => changeMonth(1)} className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/5">
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[9px] text-white/25 py-1">{d}</span>
        ))}
        {days.map((day, i) => (
          <button
            key={i}
            onClick={() => onSelectDate(day.toISOString())}
            className={cn(
              'text-[10px] py-1 rounded transition-colors',
              day.getMonth() !== visibleMonth.getMonth() ? 'text-white/15' : 'text-white/60',
              isSameDay(day, selected) && 'bg-blue-600/30 text-blue-300',
              isSameDay(day, today) && !isSameDay(day, selected) && 'text-blue-400 font-semibold',
              'hover:bg-white/10',
            )}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
};
