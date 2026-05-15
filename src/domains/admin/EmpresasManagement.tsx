import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  PauseCircle,
  AlertTriangle,
  Clock,
  ChevronUp,
  ChevronDown,
  Eye,
  ShieldCheck,
  ShieldOff,
  Users,
  Loader2,
  AlertCircle,
  X,
  Plus,
} from 'lucide-react';
import { EmpresaService } from '../../services/EmpresaService';
import { CompanyRegistration } from '../onboarding/CompanyRegistration';
import type { Empresa, StatusEmpresa } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length < 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcDaysLeft(iso?: string): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<StatusEmpresa, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  trial:       { label: 'Trial',       color: '#60A5FA', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)',  Icon: Clock },
  ativo:       { label: 'Ativo',       color: '#4ADE80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.25)',  Icon: CheckCircle2 },
  suspenso:    { label: 'Suspenso',    color: '#FBBF24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  Icon: PauseCircle },
  inadimplente:{ label: 'Inadimplente',color: '#F87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', Icon: AlertTriangle },
  cancelado:   { label: 'Cancelado',   color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)', Icon: XCircle },
};

function StatusBadge({ status }: { status: StatusEmpresa }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.cancelado;
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.12em]"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Plan badge
// ---------------------------------------------------------------------------

const PLAN_COLORS: Record<string, string> = {
  basico: '#8E8E93',
  profissional: '#D4A854',
  enterprise: '#5E85FF',
};

function PlanBadge({ plan }: { plan: string }) {
  const color = PLAN_COLORS[plan] ?? '#8E8E93';
  const labels: Record<string, string> = { basico: 'Básico', profissional: 'Profissional', enterprise: 'Enterprise' };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.12em]"
      style={{ color, background: `${color}12`, border: `1px solid ${color}25` }}
    >
      {labels[plan] ?? plan}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr className="border-t border-white/[0.04]">
      {[1,2,3,4,5,6,7].map((i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3 rounded-full bg-white/[0.06] animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

interface ConfirmModalProps {
  open: boolean;
  empresa: Empresa | null;
  nextStatus: StatusEmpresa | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmModal({ open, empresa, nextStatus, onConfirm, onCancel, loading }: ConfirmModalProps) {
  if (!open || !empresa || !nextStatus) return null;

  const cfg = STATUS_CONFIG[nextStatus];
  const { Icon } = cfg;

  const actionLabel =
    nextStatus === 'ativo'    ? 'ativar' :
    nextStatus === 'suspenso' ? 'suspender' :
    nextStatus === 'cancelado'? 'cancelar' :
    nextStatus;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-sm rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/95 backdrop-blur-xl p-6 shadow-2xl"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/30 to-transparent rounded-t-[20px]" />

            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <Icon className="w-5 h-5" style={{ color: cfg.color }} />
            </div>

            <h3 className="text-[14px] font-black text-white mb-1">
              {nextStatus === 'ativo' ? 'Ativar empresa?' : nextStatus === 'suspenso' ? 'Suspender empresa?' : 'Alterar status?'}
            </h3>
            <p className="text-[12px] text-[#8E8E93]/70 mb-5">
              Você está prestes a <span className="text-white font-semibold">{actionLabel}</span>{' '}
              a empresa <span className="text-[#D4A854] font-semibold">{empresa.nomeRazaoSocial}</span>.
              {' '}Esta ação pode impactar o acesso dos usuários.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-[#8E8E93]/80 hover:border-white/[0.15] hover:text-white transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 h-9 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: cfg.color, color: nextStatus === 'ativo' ? '#050505' : '#fff' }}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

interface DetailDrawerProps {
  empresa: Empresa | null;
  onClose: () => void;
}

function DetailDrawer({ empresa, onClose }: DetailDrawerProps) {
  if (!empresa) return null;

  const daysLeft = calcDaysLeft(empresa.trialExpiraEm);

  return (
    <AnimatePresence>
      {empresa && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="relative w-full max-w-md rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/40 to-transparent" />

            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-[#D4A854]" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-white leading-tight">{empresa.nomeRazaoSocial}</p>
                  {empresa.nomeFantasia && (
                    <p className="text-[10px] text-[#8E8E93]/60">{empresa.nomeFantasia}</p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {[
                { label: 'CNPJ', value: formatCnpj(empresa.cnpj) },
                { label: 'E-mail', value: empresa.emailCorporativo },
                { label: 'Telefone', value: empresa.telefone ?? '—' },
                { label: 'Slug', value: empresa.slug },
                { label: 'Plano', value: empresa.planoSaas },
                { label: 'Status', value: empresa.status },
                { label: 'Limite de Usuários', value: String(empresa.limiteUsuarios) },
                { label: 'Limite Leads/Mês', value: empresa.limiteLeadsMes.toLocaleString('pt-BR') },
                { label: 'Storage (MB)', value: empresa.limiteStorageMb.toLocaleString('pt-BR') },
                { label: 'Timezone', value: empresa.timezone },
                { label: 'Idioma', value: empresa.idioma },
                { label: 'Criado em', value: formatDate(empresa.criadoEm) },
                { label: 'Atualizado em', value: formatDate(empresa.atualizadoEm) },
                ...(empresa.trialExpiraEm ? [
                  { label: 'Trial expira em', value: `${formatDate(empresa.trialExpiraEm)} (${daysLeft ?? 0} dias)` }
                ] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <span className="text-[9px] font-bold text-[#8E8E93]/60 uppercase tracking-[0.15em] flex-shrink-0">{label}</span>
                  <span className="text-[11px] font-semibold text-white/80 text-right truncate">{value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type SortField = 'nomeRazaoSocial' | 'status' | 'planoSaas' | 'criadoEm';
type SortDir = 'asc' | 'desc';

export function EmpresasManagement() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('criadoEm');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Action state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Empresa | null>(null);
  const [confirmNextStatus, setConfirmNextStatus] = useState<StatusEmpresa | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Detail drawer
  const [detailEmpresa, setDetailEmpresa] = useState<Empresa | null>(null);

  // New company registration modal
  const [showNew, setShowNew] = useState(false);

  const fetchEmpresas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await EmpresaService.listEmpresas();
      setEmpresas(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmpresas(); }, [fetchEmpresas]);

  // Sorting
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  // Filtered + sorted data
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = empresas.filter((e) =>
      !q ||
      e.nomeRazaoSocial.toLowerCase().includes(q) ||
      (e.nomeFantasia ?? '').toLowerCase().includes(q) ||
      e.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );

    result = [...result].sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'pt-BR', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [empresas, search, sortField, sortDir]);

  // Quick actions
  const openConfirm = useCallback((empresa: Empresa, nextStatus: StatusEmpresa) => {
    setConfirmTarget(empresa);
    setConfirmNextStatus(nextStatus);
    setConfirmOpen(true);
  }, []);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmTarget || !confirmNextStatus) return;
    setActionLoading(true);
    try {
      await EmpresaService.setStatus(confirmTarget.id, confirmNextStatus);
      setEmpresas((prev) =>
        prev.map((e) => e.id === confirmTarget.id ? { ...e, status: confirmNextStatus } : e)
      );
      setConfirmOpen(false);
      setConfirmTarget(null);
      setConfirmNextStatus(null);
    } catch (err: unknown) {
      console.error('[EmpresasManagement] setStatus error:', err);
    } finally {
      setActionLoading(false);
    }
  }, [confirmTarget, confirmNextStatus]);

  const handleCancelConfirm = useCallback(() => {
    if (actionLoading) return;
    setConfirmOpen(false);
    setConfirmTarget(null);
    setConfirmNextStatus(null);
  }, [actionLoading]);

  // Sort column header
  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="inline-flex items-center gap-1 group hover:text-white transition-colors"
    >
      <span>{label}</span>
      <span className="flex flex-col -space-y-0.5">
        <ChevronUp className={cn('w-2.5 h-2.5 transition-colors', sortField === field && sortDir === 'asc' ? 'text-[#D4A854]' : 'text-white/20 group-hover:text-white/40')} />
        <ChevronDown className={cn('w-2.5 h-2.5 transition-colors', sortField === field && sortDir === 'desc' ? 'text-[#D4A854]' : 'text-white/20 group-hover:text-white/40')} />
      </span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#050505] p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
            <Building2 className="w-4.5 h-4.5 text-[#D4A854]" style={{ width: 18, height: 18 }} />
          </div>
          <h1 className="text-[18px] font-black text-white tracking-tight">Gestão de Empresas</h1>
        </div>
        <p className="text-[11px] text-[#8E8E93]/60 ml-12">
          {empresas.length} empresa{empresas.length !== 1 ? 's' : ''} cadastrada{empresas.length !== 1 ? 's' : ''}
        </p>
      </motion.div>

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-3 mb-4"
      >
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 bg-[#16181B] border border-white/[0.07] rounded-lg pl-9 pr-3.5 text-[12px] font-medium text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4A854]/40 focus:ring-2 focus:ring-[#D4A854]/10 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]/40 hover:text-white/60 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={fetchEmpresas}
          disabled={loading}
          className="h-9 px-3.5 rounded-lg border border-white/[0.07] bg-[#16181B] text-[#8E8E93]/70 hover:border-white/[0.15] hover:text-white transition-all disabled:opacity-50 flex items-center gap-2 text-[11px] font-semibold"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Atualizar
        </button>

        {/* Nova empresa */}
        <button
          onClick={() => setShowNew(true)}
          className="h-9 px-4 rounded-lg bg-[#D4A854] text-[#050505] text-[11px] font-black uppercase tracking-wide flex items-center gap-2 hover:bg-[#C49844] transition-all ml-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Empresa
        </button>
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] mb-4"
        >
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-[12px] text-red-400">{error}</p>
          <button
            onClick={fetchEmpresas}
            className="ml-auto text-[11px] font-semibold text-red-400 hover:text-red-300 underline"
          >
            Tentar novamente
          </button>
        </motion.div>
      )}

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/85 backdrop-blur-xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/30 to-transparent" />

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#8E8E93]/30" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-white/40">
                {search ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}
              </p>
              <p className="text-[11px] text-[#8E8E93]/30 mt-1">
                {search ? `Sem resultados para "${search}"` : 'As empresas aparecerão aqui após o onboarding'}
              </p>
            </div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-[11px] text-[#D4A854]/80 hover:text-[#D4A854] underline transition-colors"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {(loading || filtered.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.015]">
                  {[
                    { field: 'nomeRazaoSocial' as SortField, label: 'Empresa' },
                  ].map(({ field, label }) => (
                    <th key={field} className="px-4 py-3 text-left">
                      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">
                        <SortHeader field={field} label={label} />
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">CNPJ</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">
                      <SortHeader field="planoSaas" label="Plano" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">
                      <SortHeader field="status" label="Status" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">Usuários</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">Trial / Criação</span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : filtered.map((empresa, idx) => {
                      const daysLeft = calcDaysLeft(empresa.trialExpiraEm);
                      const isTrialExpiring = empresa.status === 'trial' && daysLeft !== null && daysLeft <= 3;

                      return (
                        <motion.tr
                          key={empresa.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                        >
                          {/* Empresa name */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              {empresa.logoUrl ? (
                                <img
                                  src={empresa.logoUrl}
                                  alt={empresa.nomeRazaoSocial}
                                  className="w-7 h-7 rounded-lg object-contain bg-white/[0.04] border border-white/[0.06] flex-shrink-0"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-[#D4A854]/[0.06] border border-[#D4A854]/10 flex items-center justify-center flex-shrink-0">
                                  <Building2 className="w-3.5 h-3.5 text-[#D4A854]/50" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-white truncate max-w-[180px]">
                                  {empresa.nomeRazaoSocial}
                                </p>
                                {empresa.nomeFantasia && (
                                  <p className="text-[10px] text-[#8E8E93]/50 truncate max-w-[180px]">
                                    {empresa.nomeFantasia}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* CNPJ */}
                          <td className="px-4 py-3.5">
                            <span className="text-[11px] font-mono text-white/60">{formatCnpj(empresa.cnpj)}</span>
                          </td>

                          {/* Plano */}
                          <td className="px-4 py-3.5">
                            <PlanBadge plan={empresa.planoSaas} />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">
                            <StatusBadge status={empresa.status} />
                          </td>

                          {/* Usuários */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                              <Users className="w-3 h-3 text-[#8E8E93]/40" />
                              <span>— / {empresa.limiteUsuarios}</span>
                            </div>
                          </td>

                          {/* Trial / Criação */}
                          <td className="px-4 py-3.5">
                            {empresa.status === 'trial' && empresa.trialExpiraEm ? (
                              <div className="space-y-0.5">
                                <p className={cn('text-[11px] font-semibold', isTrialExpiring ? 'text-red-400' : 'text-[#FBBF24]/80')}>
                                  {daysLeft !== null ? `${daysLeft}d restantes` : '—'}
                                </p>
                                <p className="text-[9.5px] text-[#8E8E93]/50">expira {formatDate(empresa.trialExpiraEm)}</p>
                              </div>
                            ) : (
                              <span className="text-[11px] text-white/50">{formatDate(empresa.criadoEm)}</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* View detail */}
                              <button
                                onClick={() => setDetailEmpresa(empresa)}
                                title="Ver detalhes"
                                className="w-7 h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] flex items-center justify-center text-[#8E8E93]/60 hover:border-[#D4A854]/30 hover:text-[#D4A854] transition-all"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Activate */}
                              {empresa.status !== 'ativo' && (
                                <button
                                  onClick={() => openConfirm(empresa, 'ativo')}
                                  title="Ativar"
                                  className="w-7 h-7 rounded-lg border border-green-500/20 bg-green-500/[0.06] flex items-center justify-center text-green-400/70 hover:text-green-400 hover:border-green-500/40 transition-all"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Suspend */}
                              {empresa.status !== 'suspenso' && empresa.status !== 'cancelado' && (
                                <button
                                  onClick={() => openConfirm(empresa, 'suspenso')}
                                  title="Suspender"
                                  className="w-7 h-7 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.06] flex items-center justify-center text-yellow-400/70 hover:text-yellow-400 hover:border-yellow-500/40 transition-all"
                                >
                                  <ShieldOff className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01]">
            <p className="text-[9.5px] text-[#8E8E93]/40">
              Exibindo {filtered.length} de {empresas.length} empresa{empresas.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </motion.div>

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmOpen}
        empresa={confirmTarget}
        nextStatus={confirmNextStatus}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelConfirm}
        loading={actionLoading}
      />

      {/* Detail drawer */}
      <DetailDrawer
        empresa={detailEmpresa}
        onClose={() => setDetailEmpresa(null)}
      />

      {/* New company registration modal */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowNew(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[24px] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowNew(false)}
                className="absolute top-4 right-4 z-10 p-1.5 rounded-lg bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <CompanyRegistration
                onBack={() => setShowNew(false)}
                onSuccess={() => {
                  setShowNew(false);
                  fetchEmpresas();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EmpresasManagement;
