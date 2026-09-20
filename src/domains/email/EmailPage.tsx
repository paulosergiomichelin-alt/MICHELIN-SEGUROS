import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useEmail } from '../../contexts/EmailContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { EmailShell } from './components/layout/EmailShell';
import { EmptyState } from '../../components/ui';

// ─── NoAccountsOnboarding ─────────────────────────────────────────────────────

const NoAccountsOnboarding: React.FC = () => {
  const { userProfile } = usePermissions();
  const uid = userProfile?.uid ?? '';
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  const returnUrl = encodeURIComponent(cleanUrl);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8">
      <EmptyState
        icon={Mail}
        title="Conecte sua conta de e-mail"
        description="Conecte uma conta Gmail ou Microsoft Outlook para começar a gerenciar seus e-mails diretamente no CRM."
        action={
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={uid ? `/api/email/auth/gmail/init?userId=${encodeURIComponent(uid)}&returnUrl=${returnUrl}` : '#'}
              className="flex items-center gap-3 px-6 py-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-slate-700 hover:text-slate-900"
            >
              <svg viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              </svg>
              Conectar Gmail
            </a>
            <a
              href={uid ? `/api/email/auth/microsoft/init?userId=${encodeURIComponent(uid)}&returnUrl=${returnUrl}` : '#'}
              className="flex items-center gap-3 px-6 py-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-slate-700 hover:text-slate-900"
            >
              <svg viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#F25022" d="M22 22H2V2h20z"/>
                <path fill="#7FBA00" d="M46 22H26V2h20z"/>
                <path fill="#00A4EF" d="M22 46H2V26h20z"/>
                <path fill="#FFB900" d="M46 46H26V26h20z"/>
              </svg>
              Conectar Outlook
            </a>
          </div>
        }
      />
    </div>
  );
};

// ─── EmailPage ────────────────────────────────────────────────────────────────

export const EmailPage: React.FC = () => {
  const { state } = useEmail();
  const { accounts, loading } = state;
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-[#1B4D8F] rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Carregando e-mails...</p>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex h-full w-full bg-slate-50 overflow-hidden">
        <NoAccountsOnboarding />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden">
      <EmailShell onOpenSettings={() => navigate('/email/configuracoes')} />
    </div>
  );
};
