import React, { useMemo, useState } from 'react';
import { cn } from '../../../lib/utils';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  referenceDate: Date;
  events: CalendarEvent[];
  onClickEvent: (event: CalendarEvent) => void;
  onCreateOnDay: (day: Date) => void;
  onMoveEventToDay: (event: CalendarEvent, day: Date) => void;
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

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MAX_VISIBLE_PER_DAY = 3;

export const MonthGrid: React.FC<Props> = ({ referenceDate, events, onClickEvent, onCreateOnDay, onMoveEventToDay }) => {
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const days = useMemo(() => buildMonthGrid(referenceDate), [referenceDate]);
  const today = new Date();

  return (
    <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-px bg-white/5 overflow-hidden">
      {days.map((day, i) => {
        const dayEvents = events.filter(ev => isSameDay(new Date(ev.startAt), day));
        const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
        const hiddenCount = dayEvents.length - visible.length;
        const key = day.toISOString();

        return (
          <div
            key={key}
            onDoubleClick={() => onCreateOnDay(day)}
            onDragOver={e => { e.preventDefault(); setDragOverDay(key); }}
            onDragLeave={() => setDragOverDay(prev => (prev === key ? null : prev))}
            onDrop={e => {
              e.preventDefault();
              setDragOverDay(null);
              const eventId = e.dataTransfer.getData('text/plain');
              const dragged = events.find(ev => ev.id === eventId);
              if (dragged && !isSameDay(new Date(dragged.startAt), day)) onMoveEventToDay(dragged, day);
            }}
            className={cn(
              'bg-[#141414] p-1.5 overflow-hidden flex flex-col gap-0.5',
              day.getMonth() !== referenceDate.getMonth() && 'opacity-40',
              dragOverDay === key && 'ring-1 ring-inset ring-blue-400/60 bg-blue-500/5',
            )}
          >
            <span className={cn(
              'text-[11px] w-5 h-5 flex items-center justify-center rounded-full shrink-0',
              isSameDay(day, today) ? 'bg-blue-600 text-white font-semibold' : 'text-white/50',
            )}>
              {day.getDate()}
            </span>
            <div className="flex flex-col gap-0.5 overflow-hidden">
              {visible.map(event => (
                <button
                  key={event.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', event.id)}
                  onClick={() => onClickEvent(event)}
                  onDoubleClick={e => e.stopPropagation()}
                  className="text-left text-[10px] px-1 py-0.5 rounded bg-blue-600/60 hover:bg-blue-600/80 text-white truncate transition-colors"
                >
                  {event.allDay ? '' : `${new Date(event.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} `}
                  {event.title}
                </button>
              ))}
              {hiddenCount > 0 && (
                <span className="text-[9px] text-white/30 px-1">+{hiddenCount} mais</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
