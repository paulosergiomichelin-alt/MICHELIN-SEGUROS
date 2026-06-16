import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, AlertTriangle, Clock, CheckCircle2, ChevronRight,
  TrendingUp, BarChart2, PieChart, X, FileText,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Apolice, Cliente } from '../../types';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { useClientes } from '../../contexts/ClienteRealtimeContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { ClienteService } from '../../services/ClienteService';
import { SEGURADORAS } from '../../lib/seguradoras';
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); }
  catch { return iso; }
}

function fmtCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface RenovalItem { cliente: Cliente; days: number }

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ElementType }) {
  return (
    <div className={cn('bg-brand-black/50 border rounded-2xl p-4 space-y-1', color)}>
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{label}</p>
        <Icon className="w-4 h-4 opacity-40" />
      </div>
      <p className="text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export const RenovacoesPage: React.FC = () => {
  const navigate = useNavigate();
  const { clientes, loading } = useClientes();
  const { userProfile } = usePermissions();
  const [apolices, setApolices] = useState<Apolice[]>([]);
  const [selectedSeguradora, setSelectedSeguradora] = useState<string | null>(null);

  const organizationId = userProfile?.organizationId ?? 'default';

  useEffect(() => {
    const unsub = ClienteService.subscribeAllApolices(organizationId, setApolices);
    return unsub;
  }, [organizationId]);

  const { hoje, sete, trinta, vencidos, todos } = useMemo(() => {
    const hoje: RenovalItem[] = [];
    const sete: RenovalItem[] = [];
    const trinta: RenovalItem[] = [];
    const vencidos: RenovalItem[] = [];

    clientes.forEach(c => {
      if (!c.dataRenovacao) return;
      try {
        const days = differenceInDays(parseISO(c.dataRenovacao), startOfDay(new Date()));
        const item = { cliente: c, days };
        if (days < 0) vencidos.push(item);
        else if (days === 0) hoje.push(item);
        else if (days <= 7) sete.push(item);
        else if (days <= 30) trinta.push(item);
      } catch {}
    });

    const todos = [...vencidos, ...hoje, ...sete, ...trinta].sort((a, b) => a.days - b.days);
    return { hoje, sete, trinta, vencidos, todos };
  }, [clientes]);

  // Totais globais de apólices
  const totalApolices = apolices.length;
  const totalValor = useMemo(() => apolices.reduce((sum, a) => sum + (a.valorTotal ?? 0), 0), [apolices]);

  // Distribuição por seguradora com contagem + valor total
  const bySeguradora = useMemo(() => {
    const map: Record<string, { count: number; valor: number }> = {};
    apolices.forEach(a => {
      if (!a.seguradoraId) return;
      if (!map[a.seguradoraId]) map[a.seguradoraId] = { count: 0, valor: 0 };
      map[a.seguradoraId].count++;
      map[a.seguradoraId].valor += a.valorTotal ?? 0;
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  }, [apolices]);

  // Distribuição por produto — filtrada pela seguradora selecionada
  const byProduto = useMemo(() => {
    const filtered = selectedSeguradora
      ? apolices.filter(a => a.seguradoraId === selectedSeguradora)
      : apolices;
    const map: Record<string, { count: number; valor: number }> = {};
    filtered.forEach(a => {
      if (!a.produto) return;
      if (!map[a.produto]) map[a.produto] = { count: 0, valor: 0 };
      map[a.produto].count++;
      map[a.produto].valor += a.valorTotal ?? 0;
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  }, [apolices, selectedSeguradora]);

  const totalAtivos = clientes.filter(c => c.status !== 'inativo').length;

  const seguradoraNome = selectedSeguradora
    ? (SEGURADORAS.find(s => s.id === selectedSeguradora)?.nome ?? selectedSeguradora)
    : null;

  return (
    <div className="flex flex-col h-full bg-brand-dark">
      {/* Header */}
      <div className="shrink-0 border-b border-white/5 px-4 md:px-6 py-4 bg-brand-black/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gold-deep/15 border border-gold-deep/20 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-gold-deep" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-black text-white uppercase tracking-widest">Renovações</h1>
            <p className="text-[10px] text-white/40 font-medium">Controle de vencimentos da carteira</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Renovam hoje"        value={hoje.length}    color="border-gold-deep/20"  icon={Clock} />
          <StatCard label="Próximos 7 dias"     value={sete.length}    color="border-amber-500/20"  icon={AlertTriangle} />
          <StatCard label="Próximos 30 dias"    value={trinta.length}  color="border-white/10"      icon={RefreshCw} />
          <StatCard label="Renovações vencidas" value={vencidos.length} color="border-red-500/20"   icon={AlertTriangle} />
        </div>

        {/* Panels: Seguradora + Produto */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Por seguradora */}
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-gold-deep" />
              <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Carteira por Seguradora</h3>
              <div className="ml-auto">
                {selectedSeguradora ? (
                  <button
                    onClick={() => setSelectedSeguradora(null)}
                    className="flex items-center gap-1 text-[9px] font-black text-gold-deep/70 hover:text-gold-deep uppercase tracking-widest transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Limpar filtro
                  </button>
                ) : (
                  <span className="text-[9px] text-white/25 font-medium">clique para filtrar</span>
                )}
              </div>
            </div>
            {bySeguradora.length === 0 ? (
              <p className="text-[11px] text-white/20">Sem dados</p>
            ) : (
              <div className="space-y-3">
                {bySeguradora.map(([id, { count, valor }]) => {
                  const pctCount = totalApolices > 0 ? Math.round((count / totalApolices) * 100) : 0;
                  const pctValor = totalValor > 0 ? Math.round((valor / totalValor) * 100) : 0;
                  const isSelected = selectedSeguradora === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedSeguradora(isSelected ? null : id)}
                      className={cn(
                        'w-full text-left rounded-xl p-2.5 -mx-1 transition-colors',
                        isSelected
                          ? 'bg-gold-deep/10 border border-gold-deep/25'
                          : 'hover:bg-white/3 border border-transparent',
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <SeguradoraBadge seguradoraId={id} size="xs" />
                        <div className="text-right">
                          <span className="text-[10px] text-white/50 font-mono">{count}</span>
                          <span className="text-[9px] text-white/25 ml-1">({pctCount}%)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-white/30">{fmtCurrency(valor)}</span>
                        <span className="text-[9px] text-white/25">{pctValor}% do total</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-deep/60 rounded-full" style={{ width: `${pctValor}%` }} />
                      </div>
                    </button>
                  );
                })}
                {/* Totais */}
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[9px] text-white/30 uppercase font-black">Total</span>
                  <div className="text-right">
                    <span className="text-[10px] text-white/50 font-mono">{totalApolices} apólices</span>
                    <span className="text-[9px] text-white/30 ml-2">{fmtCurrency(totalValor)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Por produto */}
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-gold-deep" />
              <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Carteira por Produto</h3>
              {selectedSeguradora && seguradoraNome && (
                <div className="ml-auto flex items-center gap-1.5 bg-gold-deep/10 border border-gold-deep/20 rounded-full px-2 py-0.5">
                  <span className="text-[9px] text-gold-deep font-bold truncate max-w-[80px]">{seguradoraNome}</span>
                  <button
                    onClick={() => setSelectedSeguradora(null)}
                    className="text-gold-deep/60 hover:text-gold-deep transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            {byProduto.length === 0 ? (
              <p className="text-[11px] text-white/20">Sem dados</p>
            ) : (
              <div className="space-y-2.5">
                {byProduto.map(([produto, { count, valor }]) => {
                  const base = selectedSeguradora
                    ? apolices.filter(a => a.seguradoraId === selectedSeguradora).length
                    : totalApolices;
                  const pctCount = base > 0 ? Math.round((count / base) * 100) : 0;
                  const baseValor = selectedSeguradora
                    ? apolices.filter(a => a.seguradoraId === selectedSeguradora).reduce((s, a) => s + (a.valorTotal ?? 0), 0)
                    : totalValor;
                  const pctValor = baseValor > 0 ? Math.round((valor / baseValor) * 100) : 0;
                  return (
                    <div key={produto}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-white/60 font-medium">{produto}</span>
                        <div className="text-right">
                          <span className="text-[10px] text-white/50 font-mono">{count}</span>
                          <span className="text-[9px] text-white/25 ml-1">({pctCount}%)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-white/30">{fmtCurrency(valor)}</span>
                        <span className="text-[9px] text-white/25">{pctValor}% do total</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-deep/40 rounded-full" style={{ width: `${pctValor}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-gold-deep/50 shrink-0" />
            <div>
              <p className="text-[9px] text-white/30 uppercase font-black">Total carteira ativa</p>
              <p className="text-2xl font-black text-white">{totalAtivos}</p>
            </div>
          </div>
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <FileText className="w-8 h-8 text-gold-deep/50 shrink-0" />
            <div>
              <p className="text-[9px] text-white/30 uppercase font-black">Total de apólices</p>
              <p className="text-2xl font-black text-white">{totalApolices}</p>
            </div>
          </div>
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/50 shrink-0" />
            <div>
              <p className="text-[9px] text-white/30 uppercase font-black">Valor total</p>
              <p className="text-xl font-black text-white leading-tight">{fmtCurrency(totalValor)}</p>
            </div>
          </div>
          <div className="bg-brand-black/50 border border-amber-500/10 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-400/50 shrink-0" />
            <div>
              <p className="text-[9px] text-white/30 uppercase font-black">Requer atenção (≤30 dias)</p>
              <p className="text-2xl font-black text-amber-300">{hoje.length + sete.length + trinta.length + vencidos.length}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-brand-black/50 border border-white/5 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5">
            <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">
              Vencimentos — Próximos &amp; Atrasados
            </h3>
          </div>
          {todos.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/20 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Nenhum vencimento próximo ou atrasado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Cliente', 'Produto', 'Seguradora', 'Data Renovação', 'Dias', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[9px] font-black text-white/30 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/3">
                  {todos.map(({ cliente: c, days }) => {
                    const isVencido = days < 0;
                    const isUrgent = !isVencido && days <= 7;
                    const rowColor = isVencido ? 'bg-red-500/3' : isUrgent ? 'bg-amber-500/3' : '';
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate('/clientes/' + c.id)}
                        className={cn('cursor-pointer hover:bg-white/3 transition-colors group', rowColor)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-[11px] font-bold text-white">{c.nome}</p>
                          <p className="text-[9px] text-white/30 font-mono">{c.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] text-white/60">{c.produtoAtual ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {c.seguradoraAtualId
                            ? <SeguradoraBadge seguradoraId={c.seguradoraAtualId} size="xs" />
                            : <span className="text-[10px] text-white/20">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[10px] font-semibold', isVencido ? 'text-red-400' : isUrgent ? 'text-amber-300' : 'text-white/60')}>
                            {fmtDate(c.dataRenovacao)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-[9px] font-black border',
                            isVencido ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                            isUrgent  ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
                            'bg-white/5 border-white/10 text-white/40',
                          )}>
                            {isVencido ? `Há ${Math.abs(days)}d` : days === 0 ? 'Hoje' : `${days}d`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-gold-deep transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
