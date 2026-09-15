import React, { useState, useRef, useCallback } from 'react';
import { timeToY, durationToHeight, yToTime, HOUR_HEIGHT } from '../utils/gridMath';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  event: CalendarEvent;
  dayDate: Date;
  columnWidthPercent: number; // pra eventos sobrepostos dividirem a largura
  columnOffsetPercent: number;
  onClick: (e: React.MouseEvent) => void;
  onMove: (event: CalendarEvent, newStartAt: Date) => void;
  onResize: (event: CalendarEvent, newEndAt: Date) => void;
}

export const EventBlock: React.FC<Props> = ({
  event, dayDate, columnWidthPercent, columnOffsetPercent, onClick, onMove, onResize,
}) => {
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [resizingHeight, setResizingHeight] = useState<number | null>(null);
  const startAt = new Date(event.startAt);
  const endAt = new Date(event.endAt);
  const top = timeToY(startAt) + dragOffsetY;
  const height = resizingHeight ?? durationToHeight(startAt, endAt);
  const dragging = useRef(false);
  const justDraggedRef = useRef(false);

  const handleMoveStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    dragging.current = false;

    const onMouseMove = (moveEvt: MouseEvent) => {
      dragging.current = true;
      setDragOffsetY(moveEvt.clientY - startY);
    };
    const onMouseUp = (upEvt: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (dragging.current) {
        const deltaY = upEvt.clientY - startY;
        const newStart = yToTime(timeToY(startAt) + deltaY, dayDate);
        onMove(event, newStart);
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 0);
      }
      setDragOffsetY(0);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [event, startAt, dayDate, onMove]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    const initialHeight = durationToHeight(startAt, endAt);
    const resizeDragging = { current: false };

    const onMouseMove = (moveEvt: MouseEvent) => {
      resizeDragging.current = true;
      const deltaY = moveEvt.clientY - startY;
      setResizingHeight(Math.max(HOUR_HEIGHT / 4, initialHeight + deltaY));
    };
    const onMouseUp = (upEvt: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (resizeDragging.current) {
        const deltaY = upEvt.clientY - startY;
        const newHeightMinutes = ((initialHeight + deltaY) / HOUR_HEIGHT) * 60;
        const snappedMinutes = Math.max(15, Math.round(newHeightMinutes / 15) * 15);
        const newEnd = new Date(startAt.getTime() + snappedMinutes * 60000);
        onResize(event, newEnd);
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 0);
      }
      setResizingHeight(null);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [event, startAt, endAt, onResize]);

  return (
    <div
      onClick={e => {
        if (justDraggedRef.current) {
          e.stopPropagation();
          return;
        }
        onClick(e);
      }}
      onMouseDown={handleMoveStart}
      className="absolute rounded-md bg-[#1B4D8F]/85 hover:bg-[#1B4D8F] border border-[#1B4D8F]/60 text-white text-[11px] px-2 py-1 overflow-hidden cursor-pointer select-none transition-colors"
      style={{
        top, height, left: `${columnOffsetPercent}%`, width: `${columnWidthPercent}%`,
      }}
    >
      <div className="font-medium truncate">{event.title}</div>
      {!event.allDay && (
        <div className="text-[10px] text-white/70">
          {startAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize"
      />
    </div>
  );
};
