import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, X } from 'lucide-react';
import type { CalendarEvent } from '../../../services/AgendaService';

interface Props {
  event: CalendarEvent;
  anchorRect: { top: number; left: number; bottom: number };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Mesma técnica já usada no menu de "Mover para" do EmailListItem (createPortal em
// document.body + position:fixed calculada a partir do retângulo real do elemento) —
// evita cair na armadilha de stacking context de ancestrais com transform (grade com
// scroll, blocos de evento com posicionamento absoluto).
export const EventPopover: React.FC<Props> = ({ event, anchorRect, onClose, onEdit, onDelete }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      className="fixed z-50 w-64 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl py-2"
      style={{ top: anchorRect.bottom + 4, left: anchorRect.left }}
    >
      <div className="flex items-start justify-between px-3 pb-2 border-b border-white/5">
        <div>
          <p className="text-white/85 text-sm font-medium">{event.title}</p>
          <p className="text-white/40 text-xs mt-0.5">
            {new Date(event.startAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            {' – '}
            {new Date(event.endAt).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}
          </p>
          {event.location && <p className="text-white/40 text-xs mt-0.5">{event.location}</p>}
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={onEdit}
        className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" /> Editar
      </button>
      <button
        onClick={onDelete}
        className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-red-400/80 hover:bg-white/5 hover:text-red-400 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Excluir
      </button>
    </div>,
    document.body,
  );
};
