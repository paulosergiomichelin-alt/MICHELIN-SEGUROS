import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, AlertTriangle, Clock, CheckCircle2, ChevronRight,
  TrendingUp, BarChart2, PieChart,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Cliente } from '../../types';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { useClientes } from '../../contexts/ClienteRealtimeContext';
import { SEGURADORAS } from '../../lib/seguradoras';
import { format, parseISO, differenceInDays, isToday, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); }
  catch { return iso; }
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

    const todos = [...vencidos, ...hoje, ...sete, ...trinta].sort((a,b) => a.days - b.days);
    return { hoje, sete, trinta, vencidos, todos };
  }, [clientes]);

  // Distribution by seguradora
  const bySeguradora = useMemo(() => {
    const map: Record<string, number> = {};
    clientes.filter(c => c.status !== 'inativo').forEach(c => {
      if (c.seguradoraAtualId) map[c.seguradoraAtualId] = (map[c.seguradoraAtualId] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,6);
  }, [clientes]);

  // Distribution by produto
  const byProduto = useMemo(() => {
    const map: Record<string, number> = {};
    clientes.filter(c => c.status !== 'inativo').forEach(c => {
      if (c.produtoAtual) map[c.produtoAtual] = (map[c.produtoAtual] || 0) + 1;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,6);
  }, [clientes]);

  const totalAtivos = clientes.filter(c => c.status !== 'inativo').length;

  return (
    <div className="flex flex-col h-full bg-brand-dark">
      {/* Header */}
      <div className="shrink-0 border-b border-white/5 px-4 md:px-6 py-4 bg-brand-black/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gold-deep/15 border border-gold-deep/20 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-gold-deep" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-widest">Renovações</h1>
            <p className="text-[10px] text-white/40 font-medium">Controle de vencimentos da carteira</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Renovam hoje"       value={hoje.length}    color="border-gold-deep/20"          icon={Clock} />
          <StatCard label="Próximos 7 dias"    value={sete.length}    color="border-amber-500/20"          icon={AlertTriangle} />
          <StatCard label="Próximos 30 dias"   value={trinta.length}  color="border-white/10"              icon={RefreshCw} />
          <StatCard label="Renovações vencidas" value={vencidos.length} color="border-red-500/20"          icon={AlertTriangle} />
        </div>

        {/* Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* By seguradora */}
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-gold-deep" />
              <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Carteira por Seguradora</h3>
            </div>
            {bySeguradora.length === 0 ? (
              <p className="text-[11px] text-white/20">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {bySeguradora.map(([id, count]) => {
                  const pct = totalAtivos > 0 ? Math.round((count / totalAtivos) * 100) : 0;
                  return (
                    <div key={id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <SeguradoraBadge seguradoraId={id} size="xs" />
                        <span className="text-[10px] text-white/50">{count} <span className="text-white/20">({pct}%)</span></span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-deep/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* By produto */}
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-gold-deep" />
              <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Carteira por Produto</h3>
            </div>
            {byProduto.length === 0 ? (
              <p className="text-[11px] text-white/20">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {byProduto.map(([produto, count]) => {
                  const pct = totalAtivos > 0 ? Math.round((count / totalAtivos) * 100) : 0;
                  return (
                    <div key={produto}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-white/60 font-medium">{produto}</span>
                        <span className="text-[10px] text-white/50">{count} <span className="text-white/20">({pct}%)</span></span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-deep/40 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Summary card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-gold-deep/50" />
            <div>
              <p className="text-[9px] text-white/30 uppercase font-black">Total carteira ativa</p>
              <p className="text-2xl font-black text-white">{totalAtivos}</p>
            </div>
          </div>
          <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
            <div>
              <p className="text-[9px] text-white/30 uppercase font-black">Ativos sem renovação próxima</p>
              <p className="text-2xl font-black text-white">{clientes.filter(c => c.status === 'ativo').length}</p>
            </div>
          </div>
          <div className="bg-brand-black/50 border border-amber-500/10 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-400/50" />
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
