import React, { useState } from 'react';
import {
  Mail,
  RefreshCw,
  Trash2,
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Clock,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { useEmail } from '../../contexts/EmailContext';
import { EmailAccount, EmailService } from '../../services/EmailService';
import { usePermissions } from '../../contexts/PermissionsContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#4285F4', '#EA4335', '#FBBC05', '#34A853',
  '#7c3aed', '#db2777', '#0891b2', '#d97706',
];

function getAvatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function fmtSync(iso?: string): string {
  if (!iso) return 'Nunca';
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return 'Data desconhecida';
  }
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

const AccountStatusBadge: React.FC<{ status: EmailAccount['status'] }> = ({ status }) => {
  const map = {
    connected: { label: 'Conectado', icon: CheckCircle, className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    disconnected: { label: 'Desconectado', icon: XCircle, className: 'bg-white/5 text-white/40 border-white/10' },
    error: { label: 'Erro', icon: AlertCircle, className: 'bg-red-500/15 text-red-400 border-red-500/25' },
  };
  const { label, icon: Icon, className } = map[status] ?? map.disconnected;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border', className)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

// ─── AccountCard ─────────────────────────────────────────────────────────────

const AccountCard: React.FC<{
  account: EmailAccount;
  onSetDefault: () => void;
  onSync: () => void;
  onDelete: () => void;
  syncing: boolean;
  deleting: boolean;
}> = ({ account, onSetDefault, onSync, onDelete, syncing, deleting }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initial = account.email[0].toUpperCase();
  const color = getAvatarColor(account.email);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-[#1a1a1a] border border-white/8 rounded-2xl p-5 flex items-start gap-4 hover:border-white/12 transition-colors"
    >
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-lg shrink-0"
        style={{ backgroundColor: color + '33', border: `1px solid ${color}44` }}
      >
        <span style={{ color }}>{initial}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-white/85 font-medium text-sm truncate">{account.displayName || account.email}</span>
          {account.isDefault && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold-deep/15 text-gold-deep text-xs border border-gold-deep/25">
              <Star className="w-2.5 h-2.5 fill-gold-deep" />
              Padrão
            </span>
          )}
        </div>
        <p className="text-white/40 text-xs mb-2">{account.email}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <AccountStatusBadge status={account.status} />
          <span className="flex items-center gap-1 text-xs text-white/30">
            <Clock className="w-3 h-3" />
            Sync: {fmtSync(account.lastSync)}
          </span>
          <span className="text-xs text-white/25 capitalize">
            {account.provider === 'gmail' ? 'Gmail' : 'Outlook / Microsoft'}
          </span>
        </div>
        {account.errorMessage && (
          <p className="mt-2 text-xs text-red-400/80 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-1.5">
            {account.errorMessage}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 shrink-0">
        {!account.isDefault && (
          <button
            onClick={onSetDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-gold-deep hover:bg-gold-deep/10 transition-colors border border-white/8 hover:border-gold-deep/25"
          >
            <Star className="w-3 h-3" />
            Definir padrão
          </button>
        )}
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors border border-white/8 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
        {confirmDelete ? (
          <div className="flex gap-1">
            <button
              onClick={onDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Confirmar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 border border-white/8 transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-white/8 hover:border-red-500/20"
          >
            <Trash2 className="w-3 h-3" />
            Remover
          </button>
        )}
      </div>
    </motion.div>
  );
};

// ─── EmailAccountsPage ────────────────────────────────────────────────────────

export const EmailAccountsPage: React.FC = () => {
  const { state, deleteAccount, setDefaultAccount, loadAccounts } = useEmail();
  const { accounts, loading } = state;
  const { userProfile } = usePermissions();

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSync = async (account: EmailAccount) => {
    setSyncingId(account.id);
    setSyncError(null);
    try {
      const result = await EmailService.syncAccount(account.id);
      if (!result.success) setSyncError('Falha ao sincronizar conta.');
    } catch {
      setSyncError('Falha ao sincronizar conta.');
    } finally {
      setSyncingId(null);
      loadAccounts();
    }
  };

  const handleDelete = async (accountId: string) => {
    setDeletingId(accountId);
    try {
      await deleteAccount(accountId);
    } finally {
      setDeletingId(null);
    }
  };

  const gmailUrl = userProfile?.uid
    ? EmailService.getGmailAuthUrl(userProfile.uid, window.location.href)
    : '#';

  const microsoftUrl = userProfile?.uid
    ? EmailService.getMicrosoftAuthUrl(userProfile.uid, window.location.href)
    : '#';

  return (
    <div className="flex-1 overflow-y-auto bg-[#0f0f0f] p-6">
      <div className="max-w-3xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-white/90 text-2xl font-bold mb-1">Contas de E-mail</h1>
            <p className="text-white/40 text-sm">Gerencie as contas conectadas ao seu CRM</p>
          </div>
          <button
            onClick={loadAccounts}
            disabled={loading}
            className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>

        {syncError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {syncError}
          </div>
        )}

        {/* Accounts list */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
              <Mail className="w-8 h-8 text-white/15" />
            </div>
            <p className="text-white/30 text-sm">Nenhuma conta conectada</p>
          </div>
        ) : (
          <div className="space-y-3 mb-8">
            <AnimatePresence mode="popLayout">
              {accounts.map(acc => (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  onSetDefault={() => setDefaultAccount(acc.id)}
                  onSync={() => handleSync(acc)}
                  onDelete={() => handleDelete(acc.id)}
                  syncing={syncingId === acc.id}
                  deleting={deletingId === acc.id}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Connect new account */}
        <div className="bg-[#1a1a1a] border border-white/8 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-white/40" />
            <h2 className="text-white/70 font-semibold text-sm">Conectar nova conta</h2>
          </div>
          <p className="text-white/30 text-sm mb-5">
            Conecte uma conta Gmail ou Microsoft Outlook para sincronizar e-mails com o CRM.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Gmail */}
            <a
              href={gmailUrl}
              className="flex items-center gap-3 px-5 py-3 rounded-xl border border-white/10 hover:border-red-500/30 hover:bg-red-500/5 transition-all text-white/60 hover:text-white/90 group"
            >
              <svg viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              </svg>
              <div>
                <p className="font-medium text-sm">Conectar Gmail</p>
                <p className="text-xs text-white/30 group-hover:text-white/40">Google Workspace ou Gmail pessoal</p>
              </div>
            </a>

            {/* Microsoft */}
            <a
              href={microsoftUrl}
              className="flex items-center gap-3 px-5 py-3 rounded-xl border border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all text-white/60 hover:text-white/90 group"
            >
              <svg viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                <path fill="#F25022" d="M22 22H2V2h20z"/>
                <path fill="#7FBA00" d="M46 22H26V2h20z"/>
                <path fill="#00A4EF" d="M22 46H2V26h20z"/>
                <path fill="#FFB900" d="M46 46H26V26h20z"/>
              </svg>
              <div>
                <p className="font-medium text-sm">Conectar Outlook</p>
                <p className="text-xs text-white/30 group-hover:text-white/40">Microsoft 365 ou Outlook.com</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
