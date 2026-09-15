import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp, DollarSign, Receipt, Percent, FileText, Loader2 } from 'lucide-react';
import { NfseService } from '../services/NfseService';
import { NfseStatusBadge } from '../components/NfseStatusBadge';
import { formatCurrency, formatDate } from '../utils/nfse-utils';
import type { NfseDocument } from '../../../types';
import type { NfseMonthlyStats } from '../types';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { Card } from '../../../components/ui';

export function NfseDashboard() {
  const { userProfile } = usePermissions();
  const orgId = userProfile?.organizationId ?? '';

  const [stats, setStats]           = useState<NfseMonthlyStats | null>(null);
  const [recent, setRecent]         = useState<NfseDocument[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);

    Promise.all([
      NfseService.getMonthlyStats(orgId),
      NfseService.list(orgId, { status: 'emitida', pageSize: 5 }),
    ])
      .then(([s, { docs }]) => {
        setStats(s);
        setRecent(docs);
      })
      .catch(e => setError(e?.message ?? 'Erro ao carregar dados'))
      .finally(() => setLoading(false));
  }, [orgId]);

  const cards = stats ? [
    { label: 'Notas emitidas (mês)', value: String(stats.total), Icon: Receipt, color: '#1B4D8F' },
    { label: 'Valor faturado (mês)', value: formatCurrency(stats.valorTotal), Icon: DollarSign, color: '#1F8A4C' },
    { label: 'ISS recolhido (mês)',  value: formatCurrency(stats.issTotal),   Icon: Percent,     color: '#1B4D8F' },
    { label: 'Ticket médio',         value: formatCurrency(stats.ticketMedio), Icon: TrendingUp,  color: '#B8860B' },
  ] : [];

  return (
    <div className="min-h-full bg-slate-50">
      <div className="p-4 md:p-6 space-y-5">

        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-gold-deep" />
            </div>
            <div>
              <h1 className="text-[15px] font-black text-slate-900 uppercase tracking-widest">Dashboard NFS-e</h1>
              <p className="text-[10px] text-slate-500 font-medium">Resumo do mês atual</p>
            </div>
          </div>
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#1B4D8F] animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-[#C0392B]/20 bg-[#FDE4E4]">
            <p className="text-[12px] text-[#C0392B]">{error}</p>
          </div>
        )}

        {!loading && stats && (
          <>
            {/* Stat cards */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {cards.map(({ label, value, Icon, color }, i) => (
                <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05 }}>
                  <Card>
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-[9.5px] font-black text-slate-500 uppercase tracking-[0.15em] leading-snug max-w-[80%]">{label}</p>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                      </div>
                    </div>
                    <p className="text-[18px] font-black text-slate-900 leading-none">{value}</p>
                  </Card>
                </motion.div>
              ))}
            </motion.div>

            {/* Recent */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.18em] mb-3">Últimas notas emitidas</p>
              <div className="rounded-[20px] border border-slate-200 bg-white overflow-hidden shadow-sm">
                {recent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <FileText className="w-8 h-8 text-slate-300" />
                    <p className="text-[12px] text-slate-400">Nenhuma nota emitida este mês</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        {['Número', 'Cliente', 'Serviço', 'Valor', 'Data', 'Status'].map((col, i) => (
                          <th key={i} className="px-4 py-3 text-left">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{col}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((nfse, idx) => (
                        <motion.tr key={nfse.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}
                          className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-mono text-gold-deep">{nfse.numeroNota ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-[11px] font-semibold text-slate-800 max-w-[120px] truncate">{nfse.clienteNome}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-[10px] text-slate-500 max-w-[140px] truncate">{nfse.descricaoServico}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold text-slate-800">{formatCurrency(nfse.valorServico)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] text-slate-500">{formatDate(nfse.emittedAt ?? nfse.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <NfseStatusBadge status={nfse.status} size="sm" />
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
