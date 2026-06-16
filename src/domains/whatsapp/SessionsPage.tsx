import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Plus, Trash2, RefreshCw, Loader2, CheckCircle2,
  AlertCircle, Clock, QrCode, WifiOff, User, BarChart2,
  MessageSquare, Users, CheckCheck, XCircle, Activity, Inbox,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { WhatsAppSession, WhatsAppSessionStatus } from '../../types';
import { useWhatsApp } from '../../contexts/WhatsAppContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { EvolutionService } from '../../services/EvolutionService';
import { QRCodeModal } from './QRCodeModal';

const STATUS_CONFIG: Record<WhatsAppSessionStatus, { label: string; cls: string; icon: React.ElementType }> = {
  open:       { label: 'Conectado',       cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  connecting: { label: 'Conectando...',   cls: 'text-amber-300  bg-amber-500/10  border-amber-500/20',   icon: Loader2 },
  qr:         { label: 'QR Pendente',    cls: 'text-blue-400   bg-blue-500/10   border-blue-500/20',     icon: QrCode },
  close:      { label: 'Desconectado',   cls: 'text-white/30   bg-white/5       border-white/10',         icon: WifiOff },
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return iso; }
}

function fmtPhone(p?: string) {
  if (!p) return '—';
  const n = p.replace(/\D/g, '');
  if (n.length >= 12) return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  return p;
}

// ── Painel de monitoramento ───────────────────────────────────────────────────

interface WaStats {
  sessions: { total: number; active: number; list: any[] };
  conversations: { total: number; withUnread: number; withLead: number };
  messages: { totalToday: number; inboundToday: number; outboundToday: number; failedTotal: number };
  queue: Record<string, { pending: number; sentLastMinute: number }>;
  webhook: { lastWebhookAt: string | null; webhookCount: number; messagesProcessed: number; messagesFailed: number; duplicatesIgnored: number };
  reconcile: { lastReconcileAt: string | null; totalImported: number; reconcileRunning: boolean };
  dedup: { pendingInMemory: number };
  generatedAt: string;
}

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ElementType; color?: string }> = ({
  label, value, icon: Icon, color = 'text-gold-deep',
}) => (
  <div className="bg-brand-black/60 border border-white/5 rounded-xl p-3 flex items-center gap-3">
    <div className={cn('w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0', color.replace('text-', 'bg-').replace('-', '-') + '/10')}>
      <Icon className={cn('w-4 h-4', color)} />
    </div>
    <div className="min-w-0">
      <p className="text-[9px] text-white/30 font-black uppercase tracking-widest leading-none">{label}</p>
      <p className="text-[16px] font-black text-white leading-tight mt-0.5">{value}</p>
    </div>
  </div>
);

const MonitoringPanel: React.FC<{ sessionName?: string }> = ({ sessionName }) => {
  const [stats, setStats] = useState<WaStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconcilingAll, setReconcilingAll] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const qs = sessionName ? `?sessionName=${encodeURIComponent(sessionName)}` : '';
      const res = await fetch(`/api/evolution/stats${qs}`);
      if (res.ok) setStats(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [sessionName]);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 30_000);
    return () => clearInterval(t);
  }, [fetchStats]);

  const handleReconcile = async () => {
    setReconcilingAll(true);
    try {
      await fetch('/api/evolution/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    } finally {
      setTimeout(() => { setReconcilingAll(false); fetchStats(); }, 3000);
    }
  };

  if (loading && !stats) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 text-gold-deep animate-spin" />
    </div>
  );

  if (!stats) return null;

  const w = stats.webhook;
  const r = stats.reconcile;
  const queueTotal = Object.values(stats.queue).reduce((a, q) => a + q.pending, 0);
  const queueSent = Object.values(stats.queue).reduce((a, q) => a + q.sentLastMinute, 0);

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Sessões */}
      <div>
        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Smartphone className="w-3 h-3" /> Instâncias
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Sessões Ativas" value={stats.sessions.active} icon={CheckCircle2} color="text-emerald-400" />
          <StatCard label="Total Sessões" value={stats.sessions.total} icon={Smartphone} />
          <StatCard label="Conversas" value={stats.conversations.total} icon={MessageSquare} />
          <StatCard label="Com Lead" value={stats.conversations.withLead} icon={Users} color="text-blue-400" />
        </div>
      </div>

      {/* Mensagens */}
      <div>
        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <MessageSquare className="w-3 h-3" /> Mensagens (24h)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Total Hoje" value={stats.messages.totalToday} icon={MessageSquare} />
          <StatCard label="Recebidas" value={stats.messages.inboundToday} icon={Inbox} color="text-blue-400" />
          <StatCard label="Enviadas" value={stats.messages.outboundToday} icon={CheckCheck} color="text-emerald-400" />
          <StatCard label="Falhas Total" value={stats.messages.failedTotal} icon={XCircle} color="text-red-400" />
        </div>
      </div>

      {/* Webhook + Fila */}
      <div>
        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Activity className="w-3 h-3" /> Webhook & Fila
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Webhooks Recebidos" value={w.webhookCount} icon={Activity} />
          <StatCard label="Processadas" value={w.messagesProcessed} icon={CheckCheck} color="text-emerald-400" />
          <StatCard label="Duplicatas Ignoradas" value={w.duplicatesIgnored} icon={CheckCircle2} color="text-amber-400" />
          <StatCard label="Na Fila" value={queueTotal} icon={Clock} color={queueTotal > 0 ? 'text-amber-400' : 'text-white/30'} />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-white/30">
          <div className="bg-brand-black/40 border border-white/5 rounded-xl px-3 py-2">
            <span className="font-black uppercase tracking-widest">Último webhook</span>
            <p className="text-white/60 mt-0.5 font-mono">{w.lastWebhookAt ? fmtDate(w.lastWebhookAt) : '—'}</p>
          </div>
          <div className="bg-brand-black/40 border border-white/5 rounded-xl px-3 py-2">
            <span className="font-black uppercase tracking-widest">Enviadas/min</span>
            <p className="text-white/60 mt-0.5 font-mono">{queueSent}</p>
          </div>
        </div>
      </div>

      {/* Reconciliação */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" /> Reconciliação
          </p>
          <button
            onClick={handleReconcile}
            disabled={reconcilingAll || r.reconcileRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
          >
            <RefreshCw className={cn('w-3 h-3', (reconcilingAll || r.reconcileRunning) && 'animate-spin')} />
            {r.reconcileRunning ? 'Reconciliando...' : 'Reconciliar agora'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[9px] text-white/30">
          <div className="bg-brand-black/40 border border-white/5 rounded-xl px-3 py-2">
            <span className="font-black uppercase tracking-widest">Última execução</span>
            <p className="text-white/60 mt-0.5 font-mono">{r.lastReconcileAt ? fmtDate(r.lastReconcileAt) : 'Ainda não executou'}</p>
          </div>
          <div className="bg-brand-black/40 border border-white/5 rounded-xl px-3 py-2">
            <span className="font-black uppercase tracking-widest">Mensagens recuperadas</span>
            <p className="text-white/60 mt-0.5 font-mono">{r.totalImported}</p>
          </div>
        </div>
      </div>

      <p className="text-[8px] text-white/10 text-right font-mono">
        Atualizado: {fmtDate(stats.generatedAt)} · Atualiza automaticamente a cada 30s
      </p>
    </div>
  );
};

// ── Página principal ──────────────────────────────────────────────────────────

export const SessionsPage: React.FC = () => {
  const { sessions, loading } = useWhatsApp();
  const { userProfile } = usePermissions();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'gestor';

  const [tab, setTab] = useState<'sessoes' | 'monitoramento'>('sessoes');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [qrSession, setQrSession] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!userProfile) return;
    setCreating(true);
    setError('');
    try {
      const result = await EvolutionService.createSession(
        userProfile.uid,
        userProfile.organizationId ?? 'default',
      );
      if (!result) { setError('Falha ao criar sessão. Verifique a configuração da Evolution API.'); return; }
      if ('error' in result) { setError(result.error); return; }
      setQrSession(result.instanceName);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (session: WhatsAppSession) => {
    if (!window.confirm(`Desconectar e remover "${session.sessionName}"?`)) return;
    setDeletingId(session.id);
    setError('');
    const ok = await EvolutionService.deleteSession(session.sessionName);
    if (!ok) setError('Falha ao remover sessão. Tente novamente.');
    setDeletingId(null);
  };

  const handleRefresh = async (session: WhatsAppSession) => {
    setRefreshingId(session.id);
    await EvolutionService.refreshSession(session.sessionName);
    setRefreshingId(null);
    setQrSession(session.sessionName);
  };

  // Only count active sessions (not closed) to decide if user can create a new one
  const mySession = sessions.find(s => s.userId === userProfile?.uid && s.status !== 'close');

  return (
    <div className="flex flex-col h-full bg-brand-dark overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-brand-black/80 border-b border-white/5 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-sm font-black text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" /> WhatsApp
            </h1>
            <p className="text-[10px] text-white/30 mt-0.5">Configurações e monitoramento</p>
          </div>
          {tab === 'sessoes' && !mySession && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Conectar WhatsApp
            </button>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {([
            { id: 'sessoes', label: 'Sessões', icon: Smartphone },
            { id: 'monitoramento', label: 'Monitoramento', icon: BarChart2 },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border',
                tab === t.id
                  ? 'bg-gold-deep text-brand-dark border-gold-deep'
                  : 'bg-white/5 text-white/40 border-transparent hover:bg-white/10',
              )}
            >
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="shrink-0 mx-6 mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[10px] text-red-300">{error}</p>
        </div>
      )}

      {/* Monitoramento */}
      {tab === 'monitoramento' && (
        <div className="flex-1 overflow-y-auto p-6">
          <MonitoringPanel />
        </div>
      )}

      {/* Sessions list */}
      {tab === 'sessoes' && <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gold-deep animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-white/20" />
            </div>
            <div>
              <p className="text-white/40 font-bold text-sm">Nenhum WhatsApp conectado</p>
              <p className="text-white/20 text-xs mt-1">Clique em "Conectar WhatsApp" para começar</p>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Conectar agora
            </button>
          </div>
        ) : (
          <div className="max-w-3xl space-y-3">
            {sessions.map(session => {
              const sc = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.close;
              const StatusIcon = sc.icon;
              const isDeleting = deletingId === session.id;
              const isRefreshing = refreshingId === session.id;
              const isOwn = session.userId === userProfile?.uid;

              return (
                <div key={session.id} className={cn(
                  'bg-brand-black/50 border rounded-2xl p-5 transition-all',
                  session.status === 'open' ? 'border-emerald-500/20' : 'border-white/5',
                )}>
                  <div className="flex items-start gap-4">
                    {/* Profile pic */}
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                      {session.profilePicture ? (
                        <img src={session.profilePicture} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-white/20" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-white truncate">
                          {session.profileName || session.sessionName}
                        </span>
                        {isOwn && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-gold-deep bg-gold-deep/10 border border-gold-deep/20 px-1.5 py-0.5 rounded">
                            Sua sessão
                          </span>
                        )}
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider', sc.cls)}>
                          <StatusIcon className={cn('w-2.5 h-2.5', session.status === 'connecting' && 'animate-spin')} />
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50 font-mono mt-1">{fmtPhone(session.phoneNumber)}</p>
                      <p className="text-[9px] text-white/20 mt-1 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> Conectado em {fmtDate(session.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {session.status === 'qr' && (isOwn || isAdmin) && (
                        <button
                          onClick={() => setQrSession(session.sessionName)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all text-[10px] font-black uppercase tracking-widest"
                        >
                          <QrCode className="w-3.5 h-3.5" /> Ver QR Code
                        </button>
                      )}
                      {session.status !== 'open' && (isOwn || isAdmin) && (
                        <button
                          onClick={() => handleRefresh(session)}
                          disabled={isRefreshing}
                          title="Reconectar (reiniciar instância)"
                          className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-emerald-400 hover:border-emerald-500/30 transition-all disabled:opacity-40"
                        >
                          {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {(isOwn || isAdmin) && (
                        <button
                          onClick={() => handleDelete(session)}
                          disabled={isDeleting}
                          title="Desconectar"
                          className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-40"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* Config hint */}
      <div className="shrink-0 border-t border-white/5 px-6 py-3 flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
        <p className="text-[9px] text-white/20">
          Requer Evolution API configurada. Variáveis: <span className="font-mono text-white/30">EVOLUTION_API_URL</span> e <span className="font-mono text-white/30">EVOLUTION_API_KEY</span>
        </p>
      </div>

      {/* QR Modal */}
      {qrSession && (
        <QRCodeModal
          sessionName={qrSession}
          onClose={() => setQrSession(null)}
          onConnected={() => setQrSession(null)}
        />
      )}
    </div>
  );
};
