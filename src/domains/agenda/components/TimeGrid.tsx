import React, { useMemo, useState, useCallback } from 'react';
import { HOUR_HEIGHT, yToTime } from '../utils/gridMath';
import { EventBlock } from './EventBlock';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  days: Date[]; // 1 dia (Dia) ou 5/7 dias (Semana de Trabalho/Semana)
  events: CalendarEvent[];
  onCreateRange: (startAt: Date, endAt: Date) => void;
  onMoveEvent: (event: CalendarEvent, newStartAt: Date) => void;
  onResizeEvent: (event: CalendarEvent, newEndAt: Date) => void;
  onClickEvent: (event: CalendarEvent, anchorEl: HTMLElement) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const TimeGrid: React.FC<Props> = ({ days, events, onCreateRange, onMoveEvent, onResizeEvent, onClickEvent }) => {
  const [draftRange, setDraftRange] = useState<{ dayIndex: number; startY: number; endY: number } | null>(null);

  const eventsByDay = useMemo(() => {
    return days.map(day => events.filter(ev => !ev.allDay && isSameDay(new Date(ev.startAt), day)));
  }, [days, events]);

  const handleGridMouseDown = useCallback((dayIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const startY = e.clientY - rect.top;
    setDraftRange({ dayIndex, startY, endY: startY });

    const onMouseMove = (moveEvt: MouseEvent) => {
      const y = moveEvt.clientY - rect.top;
      setDraftRange(prev => (prev ? { ...prev, endY: y } : prev));
    };
    const onMouseUp = (upEvt: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const y = upEvt.clientY - rect.top;
      const day = days[dayIndex];
      // Um clique sem arraste de verdade (diferença menor que 4px, pra absorver o tremor
      // natural do mouse entre mousedown e mouseup) vira um evento padrão de 1h a partir
      // do horário clicado, em vez de um evento de duração ~0.
      const didDrag = Math.abs(y - startY) > 4;
      const from = yToTime(Math.min(startY, y), day);
      const to = didDrag ? yToTime(Math.max(startY, y), day) : new Date(from.getTime() + 60 * 60000);
      onCreateRange(from, to);
      setDraftRange(null);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [days, onCreateRange]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
      <div className="flex">
        {/* Coluna de horas */}
        <div className="w-14 shrink-0 pt-2">
          {HOURS.map(h => (
            <div key={h} style={{ height: HOUR_HEIGHT }} className="text-[10px] text-slate-400 text-right pr-2 -translate-y-1.5">
              {h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}
            </div>
          ))}
        </div>

        {/* Colunas dos dias */}
        {days.map((day, dayIndex) => (
          <div
            key={day.toISOString()}
            onMouseDown={e => handleGridMouseDown(dayIndex, e)}
            className="flex-1 relative border-l border-slate-200"
            style={{ height: HOUR_HEIGHT * 24 }}
          >
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-100" />
            ))}

            {draftRange && draftRange.dayIndex === dayIndex && (
              <div
                className="absolute left-0.5 right-0.5 rounded bg-[#1B4D8F]/15 border border-[#1B4D8F]/50 pointer-events-none"
                style={{
                  top: Math.min(draftRange.startY, draftRange.endY),
                  height: Math.abs(draftRange.endY - draftRange.startY),
                }}
              />
            )}

            {eventsByDay[dayIndex].map(event => (
              <EventBlock
                key={event.id}
                event={event}
                dayDate={day}
                columnWidthPercent={94}
                columnOffsetPercent={2}
                onClick={e => onClickEvent(event, e.currentTarget as HTMLElement)}
                onMove={onMoveEvent}
                onResize={onResizeEvent}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
