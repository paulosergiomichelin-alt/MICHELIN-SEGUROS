import React, { useState } from 'react';
import { Button, Checkbox, Input, Modal, Textarea } from '../../../components/ui';
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
    <Modal
      title={initial ? 'Editar evento' : 'Novo evento'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={!title.trim()}>Salvar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" />
        <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Local" />
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Descrição"
          rows={3}
        />
        <Checkbox label="Dia inteiro" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              label="Início"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? startAt.slice(0, 10) : startAt}
              onChange={e => setStartAt(allDay ? `${e.target.value}T00:00` : e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Fim"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? endAt.slice(0, 10) : endAt}
              onChange={e => setEndAt(allDay ? `${e.target.value}T00:00` : e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
