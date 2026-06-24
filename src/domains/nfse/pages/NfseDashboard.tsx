import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp, DollarSign, Receipt, Percent, FileText, Loader2 } from 'lucide-react';
import { NfseService } from '../services/NfseService';
import { NfseStatusBadge } from '../components/NfseStatusBadge';
import { formatCurrency, formatDate } from '../utils/nfse-utils';
import type { NfseDocument } from '../../../types';
import type { NfseMonthlyStats } from '../types';
import { usePermissions } from '../../../contexts/PermissionsContext';

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
    { label: 'Notas emitidas (mês)', value: String(stats.total), Icon: Receipt, color: '#D4A854' },
    { label: 'Valor faturado (mês)', value: formatCurrency(stats.valorTotal), Icon: DollarSign, color: '#4ADE80' },
    { label: 'ISS recolhido (mês)',  value: formatCurrency(stats.issTotal),   Icon: Percent,     color: '#60A5FA' },
    { label: 'Ticket médio',         value: formatCurrency(stats.ticketMedio), Icon: TrendingUp,  color: '#FBBF24' },
  ] : [];

  return (
    <div className="flex flex-col h-full bg-[#050505] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
              <BarChart3 className="text-[#D4A854]" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h1 className="text-[18px] font-black text-white tracking-tight">Dashboard NFS-e</h1>
              <p className="text-[11px] text-[#8E8E93]/60">Resumo do mês atual</p>
            </div>
          </div>
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#D4A854] animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] mb-4">
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}

        {!loading && stats && (
          <>
            {/* Stat cards */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {cards.map(({ label, value, Icon, color }, i) => (
                <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05 }}
                  className="rounded-[16px] border border-white/[0.06] bg-[#0E0F11]/85 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-[9.5px] font-black text-[#8E8E93]/60 uppercase tracking-[0.15em] leading-snug max-w-[80%]">{label}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                  </div>
                  <p className="text-[18px] font-black text-white leading-none">{value}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Recent */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <p className="text-[9px] font-black text-[#8E8E93]/60 uppercase tracking-[0.18em] mb-3">Últimas notas emitidas</p>
              <div className="rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/85 overflow-hidden">
                {recent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <FileText className="w-8 h-8 text-[#8E8E93]/20" />
                    <p className="text-[12px] text-white/30">Nenhuma nota emitida este mês</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.05] bg-white/[0.015]">
                        {['Número', 'Cliente', 'Serviço', 'Valor', 'Data', 'Status'].map((col, i) => (
                          <th key={i} className="px-4 py-3 text-left">
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">{col}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((nfse, idx) => (
                        <motion.tr key={nfse.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}
                          className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-mono text-[#D4A854]">{nfse.numeroNota ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-[11px] font-semibold text-white max-w-[120px] truncate">{nfse.clienteNome}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-[10px] text-white/50 max-w-[140px] truncate">{nfse.descricaoServico}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-semibold text-white">{formatCurrency(nfse.valorServico)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] text-white/50">{formatDate(nfse.emittedAt ?? nfse.createdAt)}</span>
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
