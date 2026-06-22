import React, { useMemo, useState, useEffect } from 'react';
import {
  RefreshCw, BarChart2, PieChart, X,
} from 'lucide-react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from 'recharts';
import { cn } from '../../lib/utils';
import { Apolice } from '../../types';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { usePermissions } from '../../contexts/PermissionsContext';
import { ClienteService } from '../../services/ClienteService';
import { SEGURADORAS } from '../../lib/seguradoras';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function fmtCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function avgPct(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (!valid.length) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function fmtShort(v: number) {
  if (v === 0) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export const RenovacoesPage: React.FC = () => {
  const { userProfile } = usePermissions();
  const [apolices, setApolices] = useState<Apolice[]>([]);
  const [selectedSeguradora, setSelectedSeguradora] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'valor' | 'qtd'>('valor');

  const organizationId = userProfile?.organizationId ?? 'default';

  useEffect(() => {
    const unsub = ClienteService.subscribeAllApolices(organizationId, setApolices);
    return unsub;
  }, [organizationId]);

  const totalApolices = apolices.length;
  const totalValor = useMemo(() => apolices.reduce((sum, a) => sum + (a.valorTotal ?? 0), 0), [apolices]);

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

  const seguradoraNome = selectedSeguradora
    ? (SEGURADORAS.find(s => s.id === selectedSeguradora)?.nome ?? selectedSeguradora)
    : null;

  const last12Months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const prevD = new Date(d.getFullYear() - 1, d.getMonth(), 1);
      return {
        monthKey: format(d, 'yyyy-MM'),
        mes: format(d, "MMM/yy", { locale: ptBR }),
        prevKey: format(prevD, 'yyyy-MM'),
      };
    });
  }, []);

  const apolicesByMonth = useMemo(() => {
    const filtered = selectedSeguradora
      ? apolices.filter(a => a.seguradoraId === selectedSeguradora)
      : apolices;
    const map: Record<string, { valorTotal: number; qtd: number }> = {};
    filtered.forEach(a => {
      const iso = a.inicioVigencia || a.createdAt;
      if (!iso) return;
      const key = iso.substring(0, 7);
      if (!map[key]) map[key] = { valorTotal: 0, qtd: 0 };
      map[key].valorTotal += a.valorTotal ?? 0;
      map[key].qtd += 1;
    });
    return map;
  }, [apolices, selectedSeguradora]);

  const chartData = useMemo(() =>
    last12Months.map(m => ({
      ...m,
      valorTotal: apolicesByMonth[m.monthKey]?.valorTotal ?? 0,
      qtd: apolicesByMonth[m.monthKey]?.qtd ?? 0,
    })),
  [last12Months, apolicesByMonth]);

  const tableData = useMemo(() =>
    last12Months.map(m => {
      const atual = apolicesByMonth[m.monthKey] ?? { valorTotal: 0, qtd: 0 };
      const ant   = apolicesByMonth[m.prevKey]  ?? { valorTotal: 0, qtd: 0 };
      const crescValor = ant.valorTotal > 0
        ? (atual.valorTotal - ant.valorTotal) / ant.valorTotal * 100
        : atual.valorTotal > 0 ? 100 : null;
      const crescQtd = ant.qtd > 0
        ? (atual.qtd - ant.qtd) / ant.qtd * 100
        : atual.qtd > 0 ? 100 : null;
      return { ...m, atualValor: atual.valorTotal, atualQtd: atual.qtd, antValor: ant.valorTotal, antQtd: ant.qtd, crescValor, crescQtd };
    }),
  [last12Months, apolicesByMonth]);

  const tableTotals = useMemo(() => {
    const now  = new Date();
    const keys12 = new Set(last12Months.map(m => m.monthKey));
    const prev12  = new Set(last12Months.map(m => m.prevKey));
    const ytdS  = `${now.getFullYear()}-01-01`;
    const ytdE  = format(now, 'yyyy-MM-dd');
    const py    = now.getFullYear() - 1;
    const pytdS = `${py}-01-01`;
    let pytdE: string;
    try { pytdE = format(new Date(py, now.getMonth(), now.getDate()), 'yyyy-MM-dd'); }
    catch { pytdE = `${py}-12-31`; }

    const filtered = selectedSeguradora ? apolices.filter(a => a.seguradoraId === selectedSeguradora) : apolices;
    let t12V=0,t12Q=0, p12V=0,p12Q=0, ytdV=0,ytdQ=0, pytdV=0,pytdQ=0;
    filtered.forEach(a => {
      const iso = a.inicioVigencia || a.createdAt;
      if (!iso) return;
      const key = iso.substring(0,7);
      const date = iso.substring(0,10);
      const val = a.valorTotal ?? 0;
      if (keys12.has(key)) { t12V += val; t12Q++; }
      if (prev12.has(key)) { p12V += val; p12Q++; }
      if (date >= ytdS  && date <= ytdE)  { ytdV += val;  ytdQ++; }
      if (date >= pytdS && date <= pytdE) { pytdV += val; pytdQ++; }
    });
    return {
      t12V, t12Q, p12V, p12Q, ytdV, ytdQ, pytdV, pytdQ,
      cresc12V:  p12V  > 0 ? (t12V  - p12V)  / p12V  * 100 : null,
      cresc12Q:  p12Q  > 0 ? (t12Q  - p12Q)  / p12Q  * 100 : null,
      crescYtdV: pytdV > 0 ? (ytdV  - pytdV) / pytdV * 100 : null,
      crescYtdQ: pytdQ > 0 ? (ytdQ  - pytdQ) / pytdQ * 100 : null,
    };
  }, [apolices, selectedSeguradora, last12Months]);

  const comissaoByMonth = useMemo(() => {
    const filtered = selectedSeguradora
      ? apolices.filter(a => a.seguradoraId === selectedSeguradora)
      : apolices;
    const map: Record<string, { comissao: number; qtd: number }> = {};
    filtered.forEach(a => {
      const iso = a.inicioVigencia || a.createdAt;
      if (!iso) return;
      const key = iso.substring(0, 7);
      if (!map[key]) map[key] = { comissao: 0, qtd: 0 };
      map[key].comissao += a.comissao ?? 0;
      map[key].qtd += 1;
    });
    return map;
  }, [apolices, selectedSeguradora]);

  const tableComissao = useMemo(() =>
    last12Months.map(m => {
      const atual = comissaoByMonth[m.monthKey] ?? { comissao: 0, qtd: 0 };
      const ant   = comissaoByMonth[m.prevKey]  ?? { comissao: 0, qtd: 0 };
      const cresc = ant.comissao > 0
        ? (atual.comissao - ant.comissao) / ant.comissao * 100
        : atual.comissao > 0 ? 100 : null;
      return { ...m, atualComissao: atual.comissao, antComissao: ant.comissao, cresc };
    }),
  [last12Months, comissaoByMonth]);

  const comissaoTotals = useMemo(() => {
    const now   = new Date();
    const keys12 = new Set(last12Months.map(m => m.monthKey));
    const prev12  = new Set(last12Months.map(m => m.prevKey));
    const ytdS  = `${now.getFullYear()}-01-01`;
    const ytdE  = format(now, 'yyyy-MM-dd');
    const py    = now.getFullYear() - 1;
    const pytdS = `${py}-01-01`;
    let pytdE: string;
    try { pytdE = format(new Date(py, now.getMonth(), now.getDate()), 'yyyy-MM-dd'); }
    catch { pytdE = `${py}-12-31`; }

    const filtered = selectedSeguradora ? apolices.filter(a => a.seguradoraId === selectedSeguradora) : apolices;
    let t12=0, p12=0, ytd=0, pytd=0;
    filtered.forEach(a => {
      const iso = a.inicioVigencia || a.createdAt;
      if (!iso) return;
      const key  = iso.substring(0, 7);
      const date = iso.substring(0, 10);
      const val  = a.comissao ?? 0;
      if (keys12.has(key)) t12  += val;
      if (prev12.has(key)) p12  += val;
      if (date >= ytdS  && date <= ytdE)  ytd  += val;
      if (date >= pytdS && date <= pytdE) pytd += val;
    });
    return {
      t12, p12, ytd, pytd,
      cresc12:  p12  > 0 ? (t12  - p12)  / p12  * 100 : null,
      crescYtd: pytd > 0 ? (ytd  - pytd) / pytd * 100 : null,
    };
  }, [apolices, selectedSeguradora, last12Months]);

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-[#141414] border border-white/10 rounded-xl px-3 py-2.5 shadow-2xl min-w-[160px]">
        <p className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-2">{label}</p>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-sm bg-[#D4A94D]" />
          <span className="text-[10px] text-white/50">Valor Total:</span>
          <span className="text-[10px] font-bold text-white ml-auto">
            {(d?.valorTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-sm bg-[#34d399]" />
          <span className="text-[10px] text-white/50">Apólices:</span>
          <span className="text-[10px] font-bold text-white ml-auto">{d?.qtd ?? 0}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-brand-dark">
      {/* Header */}
      <div className="shrink-0 border-b border-white/5 px-4 md:px-6 py-4 bg-brand-black/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gold-deep/15 border border-gold-deep/20 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-gold-deep" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-black text-white uppercase tracking-widest">Dashboard</h1>
            <p className="text-[10px] text-white/40 font-medium">Visão geral da carteira</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
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
                          <span className="text-[10px] text-white/70 font-mono">{count}</span>
                          <span className="text-[9px] text-white/40 ml-1">({pctCount}%)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-white/55">{fmtCurrency(valor)}</span>
                        <span className="text-[9px] text-white/40">{pctValor}% do total</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gold-deep/60 rounded-full" style={{ width: `${pctValor}%` }} />
                      </div>
                    </button>
                  );
                })}
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[9px] text-white/50 uppercase font-black">Total</span>
                  <div className="text-right">
                    <span className="text-[10px] text-white/70 font-mono">{totalApolices} apólices</span>
                    <span className="text-[9px] text-white/50 ml-2">{fmtCurrency(totalValor)}</span>
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
                          <span className="text-[10px] text-white/70 font-mono">{count}</span>
                          <span className="text-[9px] text-white/40 ml-1">({pctCount}%)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-white/55">{fmtCurrency(valor)}</span>
                        <span className="text-[9px] text-white/40">{pctValor}% do total</span>
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

        {/* Gráfico: emissões mês a mês */}
        <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-4 h-4 text-gold-deep" />
            <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">
              Emissões Mês a Mês
            </h3>
            {selectedSeguradora && seguradoraNome && (
              <div className="flex items-center gap-1.5 bg-gold-deep/10 border border-gold-deep/20 rounded-full px-2 py-0.5">
                <span className="text-[9px] text-gold-deep font-bold truncate max-w-[100px]">{seguradoraNome}</span>
                <button onClick={() => setSelectedSeguradora(null)} className="text-gold-deep/60 hover:text-gold-deep transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="ml-auto flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
              <button
                onClick={() => setChartMetric('valor')}
                className={cn(
                  'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors',
                  chartMetric === 'valor' ? 'bg-gold-deep text-brand-black' : 'text-white/40 hover:text-white/70',
                )}
              >
                Valor
              </button>
              <button
                onClick={() => setChartMetric('qtd')}
                className={cn(
                  'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors',
                  chartMetric === 'qtd' ? 'bg-gold-deep text-brand-black' : 'text-white/40 hover:text-white/70',
                )}
              >
                Qtd
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 30, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={v => chartMetric === 'valor'
                  ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))
                  : String(v)}
                width={44}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar
                dataKey={chartMetric === 'valor' ? 'valorTotal' : 'qtd'}
                fill={chartMetric === 'valor' ? '#D4A94D' : '#34d399'}
                fillOpacity={0.85}
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              >
                <LabelList
                  dataKey={chartMetric === 'valor' ? 'valorTotal' : 'qtd'}
                  position="top"
                  content={({ x, y, width, value }: any) => {
                    if (!value) return null;
                    const label = chartMetric === 'valor'
                      ? 'R$' + Math.round(value).toLocaleString('pt-BR')
                      : String(value);
                    return (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={Number(y) - 5}
                        textAnchor="middle"
                        fill={chartMetric === 'valor' ? '#D4A94D' : '#34d399'}
                        fontSize={8}
                        fontWeight={700}
                      >
                        {label}
                      </text>
                    );
                  }}
                />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>

          {/* Tabela comparativa */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-[9px]" style={{ minWidth: 780 }}>
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 px-2 text-white/30 font-black uppercase tracking-widest w-24">Período</th>
                  {tableData.map(m => (
                    <th key={m.monthKey} className="text-center py-2 px-1 text-white/30 font-black uppercase tracking-widest whitespace-nowrap">
                      {m.mes}
                    </th>
                  ))}
                  <th className="text-center py-2 px-2 text-white/30 font-black uppercase tracking-widest whitespace-nowrap border-l border-white/5">Total 12m</th>
                  <th className="text-center py-2 px-2 text-white/30 font-black uppercase tracking-widest whitespace-nowrap">YTD</th>
                </tr>
              </thead>
              <tbody>
                {/* Crescimento — primeira linha */}
                <tr className="border-b border-white/3">
                  <td className="py-2 px-2 text-white/35 font-bold">Crescimento</td>
                  {tableData.map(m => {
                    const pct = chartMetric === 'valor' ? m.crescValor : m.crescQtd;
                    return (
                      <td key={m.monthKey} className="py-2 px-1 text-center">
                        {pct === null
                          ? <span className="text-white/20">—</span>
                          : <span className={cn('font-bold', pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                              {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                            </span>}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center border-l border-white/5">
                    {(() => {
                      const pct = avgPct(tableData.map(m => chartMetric === 'valor' ? m.crescValor : m.crescQtd));
                      return pct === null
                        ? <span className="text-white/20">—</span>
                        : <span className={cn('font-bold', pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                            <span className="text-white/25 font-normal"> méd</span>
                          </span>;
                    })()}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {(() => {
                      const yr = new Date().getFullYear().toString();
                      const pct = avgPct(tableData.filter(m => m.monthKey.startsWith(yr)).map(m => chartMetric === 'valor' ? m.crescValor : m.crescQtd));
                      return pct === null
                        ? <span className="text-white/20">—</span>
                        : <span className={cn('font-bold', pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                            <span className="text-white/25 font-normal"> méd</span>
                          </span>;
                    })()}
                  </td>
                </tr>
                {/* Ano Atual */}
                <tr className="border-b border-white/3">
                  <td className="py-2 px-2 text-white/60 font-bold">Ano Atual</td>
                  {tableData.map(m => (
                    <td key={m.monthKey} className="py-2 px-1 text-center text-white/80 font-mono tabular-nums">
                      {chartMetric === 'valor' ? fmtShort(m.atualValor) : (m.atualQtd || '—')}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-center text-gold-deep font-bold border-l border-white/5 tabular-nums">
                    {chartMetric === 'valor' ? fmtShort(tableTotals.t12V) : (tableTotals.t12Q || '—')}
                  </td>
                  <td className="py-2 px-2 text-center text-gold-deep font-bold tabular-nums">
                    {chartMetric === 'valor' ? fmtShort(tableTotals.ytdV) : (tableTotals.ytdQ || '—')}
                  </td>
                </tr>
                {/* Ano Anterior */}
                <tr>
                  <td className="py-2 px-2 text-white/35 font-bold">Ano Anterior</td>
                  {tableData.map(m => (
                    <td key={m.monthKey} className="py-2 px-1 text-center text-white/35 font-mono tabular-nums">
                      {chartMetric === 'valor' ? fmtShort(m.antValor) : (m.antQtd || '—')}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-center text-white/35 border-l border-white/5 tabular-nums">
                    {chartMetric === 'valor' ? fmtShort(tableTotals.p12V) : (tableTotals.p12Q || '—')}
                  </td>
                  <td className="py-2 px-2 text-center text-white/35 tabular-nums">
                    {chartMetric === 'valor' ? fmtShort(tableTotals.pytdV) : (tableTotals.pytdQ || '—')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {/* Tabela de Comissões */}
        <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-4 h-4 text-gold-deep" />
            <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">
              Comissões Mês a Mês
            </h3>
            {selectedSeguradora && seguradoraNome && (
              <div className="flex items-center gap-1.5 bg-gold-deep/10 border border-gold-deep/20 rounded-full px-2 py-0.5">
                <span className="text-[9px] text-gold-deep font-bold truncate max-w-[100px]">{seguradoraNome}</span>
                <button onClick={() => setSelectedSeguradora(null)} className="text-gold-deep/60 hover:text-gold-deep transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[9px]" style={{ minWidth: 780 }}>
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 px-2 text-white/30 font-black uppercase tracking-widest w-24">Período</th>
                  {tableComissao.map(m => (
                    <th key={m.monthKey} className="text-center py-2 px-1 text-white/30 font-black uppercase tracking-widest whitespace-nowrap">
                      {m.mes}
                    </th>
                  ))}
                  <th className="text-center py-2 px-2 text-white/30 font-black uppercase tracking-widest whitespace-nowrap border-l border-white/5">Total 12m</th>
                  <th className="text-center py-2 px-2 text-white/30 font-black uppercase tracking-widest whitespace-nowrap">YTD</th>
                </tr>
              </thead>
              <tbody>
                {/* Crescimento */}
                <tr className="border-b border-white/3">
                  <td className="py-2 px-2 text-white/35 font-bold">Crescimento</td>
                  {tableComissao.map(m => (
                    <td key={m.monthKey} className="py-2 px-1 text-center">
                      {m.cresc === null
                        ? <span className="text-white/20">—</span>
                        : <span className={cn('font-bold', m.cresc >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {m.cresc >= 0 ? '+' : ''}{m.cresc.toFixed(0)}%
                          </span>}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-center border-l border-white/5">
                    {(() => {
                      const pct = avgPct(tableComissao.map(m => m.cresc));
                      return pct === null
                        ? <span className="text-white/20">—</span>
                        : <span className={cn('font-bold', pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                            <span className="text-white/25 font-normal"> méd</span>
                          </span>;
                    })()}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {(() => {
                      const yr = new Date().getFullYear().toString();
                      const pct = avgPct(tableComissao.filter(m => m.monthKey.startsWith(yr)).map(m => m.cresc));
                      return pct === null
                        ? <span className="text-white/20">—</span>
                        : <span className={cn('font-bold', pct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%
                            <span className="text-white/25 font-normal"> méd</span>
                          </span>;
                    })()}
                  </td>
                </tr>
                {/* Ano Atual */}
                <tr className="border-b border-white/3">
                  <td className="py-2 px-2 text-white/60 font-bold">Ano Atual</td>
                  {tableComissao.map(m => (
                    <td key={m.monthKey} className="py-2 px-1 text-center text-white/80 font-mono tabular-nums">
                      {fmtShort(m.atualComissao)}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-center text-gold-deep font-bold border-l border-white/5 tabular-nums">
                    {fmtShort(comissaoTotals.t12)}
                  </td>
                  <td className="py-2 px-2 text-center text-gold-deep font-bold tabular-nums">
                    {fmtShort(comissaoTotals.ytd)}
                  </td>
                </tr>
                {/* Ano Anterior */}
                <tr>
                  <td className="py-2 px-2 text-white/35 font-bold">Ano Anterior</td>
                  {tableComissao.map(m => (
                    <td key={m.monthKey} className="py-2 px-1 text-center text-white/35 font-mono tabular-nums">
                      {fmtShort(m.antComissao)}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-center text-white/35 border-l border-white/5 tabular-nums">
                    {fmtShort(comissaoTotals.p12)}
                  </td>
                  <td className="py-2 px-2 text-center text-white/35 tabular-nums">
                    {fmtShort(comissaoTotals.pytd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
