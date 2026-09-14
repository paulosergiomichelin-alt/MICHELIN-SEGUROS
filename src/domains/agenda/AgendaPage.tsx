import React from 'react';
import { CalendarPlus } from 'lucide-react';
import { useAgenda } from '../../contexts/AgendaContext';
import { useEmail } from '../../contexts/EmailContext';
import { AgendaService } from '../../services/AgendaService';
import { AccountSelector } from '../email/components/sidebar/AccountSelector';
import { ViewSwitcher } from './components/ViewSwitcher';
import { MiniCalendar } from './components/MiniCalendar';
import type { EmailAccount } from '../../services/EmailService';

const INTERNAL_ACCOUNT: EmailAccount = {
  id: 'internal', userId: '', provider: 'imap', email: 'Calendário local',
  isDefault: false, status: 'connected',
};

export const AgendaPage: React.FC = () => {
  const { state, selectAccount, setView, navigate, goToDate } = useAgenda();
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
          <div className="flex-1 overflow-auto p-4 text-white/40 text-sm">
            {/* TimeGrid (Dia/Semana de Trabalho/Semana) e MonthGrid (Mês) — Tasks 9 e 10 */}
            {state.loading ? 'Carregando...' : `${state.events.length} evento(s) no período`}
          </div>
        )}
      </div>
    </div>
  );
};
