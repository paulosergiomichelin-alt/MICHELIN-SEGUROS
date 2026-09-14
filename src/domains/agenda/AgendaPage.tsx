import React from 'react';
import { CalendarPlus } from 'lucide-react';
import { useAgenda } from '../../contexts/AgendaContext';
import { useEmail } from '../../contexts/EmailContext';
import { AgendaService } from '../../services/AgendaService';
import { AccountSelector } from '../email/components/sidebar/AccountSelector';
import { ViewSwitcher } from './components/ViewSwitcher';
import { MiniCalendar } from './components/MiniCalendar';
import { TimeGrid } from './components/TimeGrid';
import { MonthGrid } from './components/MonthGrid';
import type { EmailAccount } from '../../services/EmailService';

const INTERNAL_ACCOUNT: EmailAccount = {
  id: 'internal', userId: '', provider: 'imap', email: 'Calendário local',
  isDefault: false, status: 'connected',
};

function daysForView(view: string, currentDate: string): Date[] {
  const base = new Date(currentDate);
  if (view === 'day') return [base];
  const day = base.getDay();
  const count = view === 'workweek' ? 5 : view === 'week' ? 7 : 0;
  if (count === 0) return [];
  const startOffset = view === 'workweek' ? 1 - day : -day;
  const start = new Date(base);
  start.setDate(start.getDate() + startOffset);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export const AgendaPage: React.FC = () => {
  const { state, selectAccount, setView, navigate, goToDate, createEvent, updateEvent } = useAgenda();
  const { state: emailState } = useEmail();

  // Só contas Gmail/Microsoft/IMAP fazem sentido na Agenda — mais o item sintético
  // "Calendário local" pra eventos que não pertencem a nenhuma conta específica.
  const accounts: EmailAccount[] = [INTERNAL_ACCOUNT, ...emailState.accounts];
  const selectedAccount = accounts.find(a => a.id === state.selectedAccountId) ?? INTERNAL_ACCOUNT;
  const needsConnect = state.selectedAccountId !== 'internal'
    && (selectedAccount.provider === 'gmail' || selectedAccount.provider === 'microsoft')
    && !selectedAccount.calendarScopeGranted;

  const handleConnect = () => {
    if (selectedAccount.provider !== 'gmail' && selectedAccount.provider !== 'microsoft') return;
    window.location.href = AgendaService.getCalendarConnectUrl(
      selectedAccount.provider, selectedAccount.id, window.location.pathname,
    );
  };

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] overflow-hidden">
      <aside className="w-64 shrink-0 bg-[#111111] border-r border-white/5 flex flex-col overflow-hidden">
        <AccountSelector accounts={accounts} selectedAccountId={state.selectedAccountId} onSelect={selectAccount} />
        <MiniCalendar currentDate={state.currentDate} onSelectDate={goToDate} />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <ViewSwitcher view={state.view} currentDate={state.currentDate} onSetView={setView} onNavigate={navigate} />

        {needsConnect ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <CalendarPlus className="w-8 h-8 text-blue-400" />
            </div>
            <div className="text-center">
              <h2 className="text-white/80 text-lg font-semibold mb-1">Conectar calendário desta conta</h2>
              <p className="text-white/40 text-sm max-w-sm">
                Pra ver e criar eventos de {selectedAccount.email}, autorize o acesso ao calendário — é uma permissão separada da de e-mail.
              </p>
            </div>
            <button
              onClick={handleConnect}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Conectar calendário
            </button>
          </div>
        ) : (
          state.view === 'month' ? (
            <MonthGrid
              referenceDate={new Date(state.currentDate)}
              events={state.events}
              onClickEvent={event => {
                // eslint-disable-next-line no-alert
                window.alert(`${event.title}\n${new Date(event.startAt).toLocaleString('pt-BR')}`);
              }}
              onCreateOnDay={day => {
                // eslint-disable-next-line no-alert
                const title = window.prompt('Título do evento:');
                if (!title || !title.trim()) return;
                const start = new Date(day); start.setHours(9, 0, 0, 0);
                const end = new Date(day); end.setHours(10, 0, 0, 0);
                createEvent({ title: title.trim(), startAt: start.toISOString(), endAt: end.toISOString(), allDay: false });
              }}
              onMoveEventToDay={(event, day) => {
                const start = new Date(event.startAt);
                const end = new Date(event.endAt);
                const durationMs = end.getTime() - start.getTime();
                const newStart = new Date(day);
                newStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
                updateEvent(event.id, {
                  startAt: newStart.toISOString(),
                  endAt: new Date(newStart.getTime() + durationMs).toISOString(),
                });
              }}
            />
          ) : (
            <TimeGrid
              days={daysForView(state.view, state.currentDate)}
              events={state.events}
              onCreateRange={(startAt, endAt) => {
                // eslint-disable-next-line no-alert
                const title = window.prompt('Título do evento:');
                if (!title || !title.trim()) return;
                createEvent({ title: title.trim(), startAt: startAt.toISOString(), endAt: endAt.toISOString(), allDay: false });
              }}
              onMoveEvent={(event, newStartAt) => {
                const durationMs = new Date(event.endAt).getTime() - new Date(event.startAt).getTime();
                updateEvent(event.id, {
                  startAt: newStartAt.toISOString(),
                  endAt: new Date(newStartAt.getTime() + durationMs).toISOString(),
                });
              }}
              onResizeEvent={(event, newEndAt) => updateEvent(event.id, { endAt: newEndAt.toISOString() })}
              onClickEvent={(event) => {
                // eslint-disable-next-line no-alert
                window.alert(`${event.title}\n${new Date(event.startAt).toLocaleString('pt-BR')}`);
              }}
            />
          )
        )}
      </div>
    </div>
  );
};
