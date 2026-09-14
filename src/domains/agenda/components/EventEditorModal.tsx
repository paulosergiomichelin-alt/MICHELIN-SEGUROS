import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CalendarEvent, CreateEventPayload } from '../../../services/AgendaService';

interface Props {
  initial?: CalendarEvent;
  defaultStartAt?: Date;
  defaultEndAt?: Date;
  onClose: () => void;
  onSave: (payload: Omit<CreateEventPayload, 'userId' | 'accountId'>) => void;
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const EventEditorModal: React.FC<Props> = ({ initial, defaultStartAt, defaultEndAt, onClose, onSave }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [startAt, setStartAt] = useState(toLocalInputValue(new Date(initial?.startAt ?? defaultStartAt ?? new Date())));
  const [endAt, setEndAt] = useState(toLocalInputValue(new Date(initial?.endAt ?? defaultEndAt ?? new Date(Date.now() + 60 * 60000))));

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      allDay,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-[#161616]">
          <h2 className="text-white/85 text-sm font-semibold">{initial ? 'Editar evento' : 'Novo evento'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-blue-500/50"
          />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Local"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-blue-500/50"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrição"
            rows={3}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-blue-500/50 resize-none"
          />
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="accent-blue-500" />
            Dia inteiro
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-white/40 uppercase">Início</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? startAt.slice(0, 10) : startAt}
                onChange={e => setStartAt(allDay ? `${e.target.value}T00:00` : e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/85 outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] text-white/40 uppercase">Fim</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? endAt.slice(0, 10) : endAt}
                onChange={e => setEndAt(allDay ? `${e.target.value}T00:00` : e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/85 outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/8 bg-[#161616]">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};
