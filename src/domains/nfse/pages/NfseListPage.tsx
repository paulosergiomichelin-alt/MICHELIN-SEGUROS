import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Receipt, Plus, RefreshCw, Search, X, FileText, Download, Ban,
  ChevronDown, AlertCircle, Eye, Settings, Building2, FileX,
} from 'lucide-react';
import { useNfse } from '../hooks/useNfse';
import { NfseStatusBadge, NfseEnvironmentBadge } from '../components/NfseStatusBadge';
import { EmitirNfseModal } from '../components/EmitirNfseModal';
import { NfseService } from '../services/NfseService';
import { formatCurrency, formatDate } from '../utils/nfse-utils';
import type { NfseStatus, NfseDocument, Empresa } from '../../../types';
import { usePermissions } from '../../../contexts/PermissionsContext';

function cn(...c: (string | boolean | undefined | null)[]): string {
  return c.filter(Boolean).join(' ');
}

type Tab = 'emitidas' | 'rascunhos' | 'canceladas' | 'configuracoes';

const STATUS_MAP: Record<Tab, NfseStatus | undefined> = {
  emitidas:      'emitida',
  rascunhos:     'rascunho',
  canceladas:    'cancelada',
  configuracoes: undefined,
};

export function NfseListPage() {
  const { userProfile, permissions } = usePermissions();
  const orgId = userProfile?.organizationId ?? '';

  const [tab, setTab]             = useState<Tab>('emitidas');
  const [search, setSearch]       = useState('');
  const [showEmitir, setShowEmitir] = useState(false);
  const [empresa, setEmpresa]     = useState<Empresa | null>(null);
  const [showDanfse, setShowDanfse] = useState<NfseDocument | null>(null);

  const { docs, loading, loadingMore, error, hasMore, load, loadMore, refresh } = useNfse(orgId);

  useEffect(() => {
    if (orgId) load(STATUS_MAP[tab]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, orgId]);

  // Load empresa data for the modal
  useEffect(() => {
    if (!orgId) return;
    import('../../../services/EmpresaService').then(({ EmpresaService }) => {
      EmpresaService.getEmpresa(orgId).then(setEmpresa).catch(() => null);
    });
  }, [orgId]);

  const filtered = search
    ? docs.filter(d =>
        d.clienteNome.toLowerCase().includes(search.toLowerCase()) ||
        d.clienteCpfCnpj.includes(search) ||
        d.numeroNota?.includes(search) ||
        d.descricaoServico.toLowerCase().includes(search.toLowerCase()),
      )
    : docs;

  const handleCancel = useCallback(async (nfse: NfseDocument) => {
    if (!window.confirm(`Cancelar a NFS-e ${nfse.numeroNota ?? 'rascunho'}?`)) return;
    try {
      await NfseService.update(orgId, nfse.id, {
        status: 'cancelada',
        canceledAt: new Date().toISOString(),
      });
      refresh();
    } catch (e: any) {
      console.error('[NfseListPage] cancel error:', e);
    }
  }, [orgId, refresh]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'emitidas',      label: 'Emitidas' },
    { id: 'rascunhos',     label: 'Rascunhos' },
    { id: 'canceladas',    label: 'Canceladas' },
    { id: 'configuracoes', label: 'Configurações' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#050505] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
                <Receipt className="text-[#D4A854]" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <h1 className="text-[18px] font-black text-white tracking-tight">Notas Fiscais</h1>
                <p className="text-[11px] text-[#8E8E93]/60">NFS-e — Nota Fiscal de Serviços Eletrônica</p>
              </div>
            </div>
            {permissions.canEmitInvoices !== false && (
              <button onClick={() => setShowEmitir(true)}
                className="h-9 px-4 rounded-lg bg-[#D4A854] text-[#050505] text-[11px] font-black uppercase tracking-wide flex items-center gap-2 hover:bg-[#C49844] transition-all">
                <Plus className="w-3.5 h-3.5" /> Emitir NFS-e
              </button>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="border-b border-white/[0.05] flex gap-0 overflow-x-auto mb-4 -mx-4 md:-mx-6 px-4 md:px-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap',
                tab === t.id ? 'border-[#D4A854] text-[#D4A854]' : 'border-transparent text-white/30 hover:text-white/60',
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Configurações Tab */}
        {tab === 'configuracoes' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto mt-8">
            <div className="rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/85 p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center mx-auto mb-4">
                <Settings className="text-[#D4A854]" style={{ width: 22, height: 22 }} />
              </div>
              <h3 className="text-[14px] font-black text-white mb-2">Configurações Fiscais</h3>
              <p className="text-[12px] text-[#8E8E93]/60 mb-6">
                Configure os dados fiscais, certificado digital e serviços cadastrados acessando as abas correspondentes no cadastro da empresa.
              </p>
              <div className="rounded-xl border border-white/[0.07] bg-[#16181B] p-4 text-left space-y-2.5 mb-6">
                {[
                  { label: 'Dados Fiscais',       desc: 'IM, regime tributário, CNAE, alíquota ISS, município IBGE, ambiente' },
                  { label: 'Certificado Digital', desc: 'Upload do arquivo .pfx/.p12 e senha do certificado A1' },
                  { label: 'Serviços Fiscais',    desc: 'Cadastro de serviços com item de lista, alíquota e CNAE' },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#D4A854] mt-1.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-semibold text-white">{label}</p>
                      <p className="text-[10px] text-[#8E8E93]/50">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#8E8E93]/40">
                Navegue até <span className="text-white/60">Empresas → Editar → Dados Fiscais</span>
              </p>
            </div>
          </motion.div>
        )}

        {/* Lista */}
        {tab !== 'configuracoes' && (
          <>
            {/* Toolbar */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative w-full sm:flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 pointer-events-none" />
                <input type="text" placeholder="Buscar por cliente, número ou serviço..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full h-9 bg-[#16181B] border border-white/[0.07] rounded-lg pl-9 pr-3.5 text-[12px] font-medium text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4A854]/40 focus:ring-2 focus:ring-[#D4A854]/10 transition-all" />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]/40 hover:text-white/60">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button onClick={() => refresh()} disabled={loading}
                className="h-9 px-3.5 rounded-lg border border-white/[0.07] bg-[#16181B] text-[#8E8E93]/70 hover:border-white/[0.15] hover:text-white transition-all disabled:opacity-50 flex items-center gap-2 text-[11px] font-semibold">
                <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
              </button>
            </motion.div>

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] mb-4">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-[12px] text-red-400">{error}</p>
              </div>
            )}

            {/* Table */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/85 backdrop-blur-xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.4)]">

              {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                    <FileX className="w-6 h-6 text-[#8E8E93]/30" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-white/40 mb-1">
                      {search ? `Sem resultados para "${search}"` : `Nenhuma nota ${tab === 'rascunhos' ? 'em rascunho' : tab === 'canceladas' ? 'cancelada' : 'emitida'}`}
                    </p>
                    {!search && tab === 'emitidas' && permissions.canEmitInvoices !== false && (
                      <button onClick={() => setShowEmitir(true)}
                        className="text-[11px] text-[#D4A854]/80 hover:text-[#D4A854] underline mt-1">
                        Emitir primeira NFS-e
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(loading || filtered.length > 0) && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.05] bg-white/[0.015]">
                        {['Número', 'RPS', 'Cliente', 'CPF/CNPJ', 'Serviço', 'Valor', 'Data', 'Status', 'Amb.', 'Ações'].map((col, i) => (
                          <th key={i} className={cn('px-3 py-3 text-left', i === 9 && 'text-right')}>
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">{col}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading
                        ? Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="border-t border-white/[0.04]">
                              {Array.from({ length: 10 }).map((__, j) => (
                                <td key={j} className="px-3 py-3">
                                  <div className="h-3 rounded-full bg-white/[0.06] animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                                </td>
                              ))}
                            </tr>
                          ))
                        : filtered.map((nfse, idx) => (
                            <motion.tr key={nfse.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                              className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                              <td className="px-3 py-3">
                                <span className="text-[11px] font-mono text-[#D4A854]">{nfse.numeroNota ?? '—'}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[11px] font-mono text-white/50">{nfse.numeroRps ?? '—'}</span>
                              </td>
                              <td className="px-3 py-3">
                                <p className="text-[11px] font-semibold text-white max-w-[120px] truncate">{nfse.clienteNome}</p>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[10px] font-mono text-white/50">{nfse.clienteCpfCnpj}</span>
                              </td>
                              <td className="px-3 py-3">
                                <p className="text-[10px] text-white/60 max-w-[140px] truncate">{nfse.descricaoServico}</p>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[11px] font-semibold text-white">{formatCurrency(nfse.valorServico)}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[10px] text-white/50">{formatDate(nfse.emittedAt ?? nfse.createdAt)}</span>
                              </td>
                              <td className="px-3 py-3">
                                <NfseStatusBadge status={nfse.status} size="sm" />
                              </td>
                              <td className="px-3 py-3">
                                <NfseEnvironmentBadge env={nfse.ambiente} />
                              </td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => setShowDanfse(nfse)}
                                    title="Ver DANF-Se"
                                    className="w-7 h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] flex items-center justify-center text-[#8E8E93]/60 hover:border-[#D4A854]/30 hover:text-[#D4A854] transition-all">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  {nfse.xmlUrl && (
                                    <a href={nfse.xmlUrl} download title="Download XML"
                                      className="w-7 h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] flex items-center justify-center text-[#8E8E93]/60 hover:border-blue-400/30 hover:text-blue-400 transition-all">
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {nfse.status === 'emitida' && permissions.canCancelInvoices !== false && (
                                    <button onClick={() => handleCancel(nfse)} title="Cancelar"
                                      className="w-7 h-7 rounded-lg border border-red-500/20 bg-red-500/[0.06] flex items-center justify-center text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-all">
                                      <Ban className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </motion.tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              )}

              {hasMore && !loading && (
                <div className="px-4 py-3 border-t border-white/[0.04] text-center">
                  <button onClick={loadMore} disabled={loadingMore}
                    className="h-8 px-4 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold text-[#8E8E93]/80 hover:border-white/15 hover:text-white transition-all disabled:opacity-50 flex items-center gap-2 mx-auto">
                    <ChevronDown className="w-3.5 h-3.5" />
                    {loadingMore ? 'Carregando...' : 'Carregar mais'}
                  </button>
                </div>
              )}

              {!loading && filtered.length > 0 && (
                <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01]">
                  <p className="text-[9.5px] text-[#8E8E93]/40">
                    {filtered.length} nota{filtered.length !== 1 ? 's' : ''}
                    {search && ` (filtradas de ${docs.length}`}
                  </p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>

      {/* Emit modal */}
      {showEmitir && (
        <EmitirNfseModal
          organizationId={orgId}
          empresa={empresa}
          onClose={() => setShowEmitir(false)}
          onSaved={() => { setShowEmitir(false); refresh(); }}
        />
      )}

      {/* DANF-Se Preview */}
      {showDanfse && empresa && (
        <div className="fixed inset-0 z-50 bg-[#050505]">
          {React.createElement(
            React.lazy(() => import('../pdf/DanfsePreview').then(m => ({ default: m.DanfsePreview }))),
            { nfse: showDanfse, empresa, onClose: () => setShowDanfse(null) },
          )}
        </div>
      )}
    </div>
  );
}
