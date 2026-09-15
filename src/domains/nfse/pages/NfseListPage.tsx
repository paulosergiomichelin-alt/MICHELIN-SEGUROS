import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Receipt, Plus, RefreshCw, Search, X, FileText, Download, Ban,
  ChevronDown, AlertCircle, Eye, Settings, FileX,
} from 'lucide-react';
import { useNfse } from '../hooks/useNfse';
import { NfseStatusBadge, NfseEnvironmentBadge } from '../components/NfseStatusBadge';
import { EmitirNfseModal } from '../components/EmitirNfseModal';
import { NfseService } from '../services/NfseService';
import { formatCurrency, formatDate } from '../utils/nfse-utils';
import type { NfseStatus, NfseDocument, Empresa } from '../../../types';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { Button, Card } from '../../../components/ui';
import { cn } from '../../../lib/utils';

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
    <div className="min-h-full bg-slate-50">
      <div className="p-4 md:p-6 space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-gold-deep" />
              </div>
              <div>
                <h1 className="text-[15px] font-black text-slate-900 uppercase tracking-widest">Notas Fiscais</h1>
                <p className="text-[10px] text-slate-500 font-medium">NFS-e — Nota Fiscal de Serviços Eletrônica</p>
              </div>
            </div>
            {permissions.canEmitInvoices !== false && (
              <Button variant="primary" icon={Plus} onClick={() => setShowEmitir(true)}>
                Emitir NFS-e
              </Button>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="border-b border-slate-200 flex gap-0 overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap',
                tab === t.id ? 'border-[#1B4D8F] text-[#1B4D8F]' : 'border-transparent text-slate-400 hover:text-slate-600',
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Configurações Tab */}
        {tab === 'configuracoes' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto">
            <Card className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center mx-auto mb-4">
                <Settings className="w-[22px] h-[22px] text-gold-deep" />
              </div>
              <h3 className="text-[14px] font-black text-slate-900 mb-2">Configurações Fiscais</h3>
              <p className="text-[12px] text-slate-500 mb-6">
                Configure os dados fiscais, certificado digital e serviços cadastrados acessando as abas correspondentes no cadastro da empresa.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left space-y-2.5 mb-6">
                {[
                  { label: 'Dados Fiscais',       desc: 'IM, regime tributário, CNAE, alíquota ISS, município IBGE, ambiente' },
                  { label: 'Certificado Digital', desc: 'Upload do arquivo .pfx/.p12 e senha do certificado A1' },
                  { label: 'Serviços Fiscais',    desc: 'Cadastro de serviços com item de lista, alíquota e CNAE' },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold-deep mt-1.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-semibold text-slate-800">{label}</p>
                      <p className="text-[10px] text-slate-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                Navegue até <span className="text-slate-600 font-semibold">Empresas → Editar → Dados Fiscais</span>
              </p>
            </Card>
          </motion.div>
        )}

        {/* Lista */}
        {tab !== 'configuracoes' && (
          <>
            {/* Toolbar */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input type="text" placeholder="Buscar por cliente, número ou serviço..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full h-9 bg-white border border-slate-200 rounded-lg pl-9 pr-3.5 text-[12px] font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all" />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <Button variant="secondary" icon={RefreshCw} onClick={() => refresh()} disabled={loading} loading={loading}>
                Atualizar
              </Button>
            </motion.div>

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-[#C0392B]/20 bg-[#FDE4E4]">
                <AlertCircle className="w-4 h-4 text-[#C0392B] shrink-0" />
                <p className="text-[12px] text-[#C0392B]">{error}</p>
              </div>
            )}

            {/* Table */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-[20px] border border-slate-200 bg-white overflow-hidden shadow-sm">

              {!loading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                    <FileX className="w-6 h-6 text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-slate-500 mb-1">
                      {search ? `Sem resultados para "${search}"` : `Nenhuma nota ${tab === 'rascunhos' ? 'em rascunho' : tab === 'canceladas' ? 'cancelada' : 'emitida'}`}
                    </p>
                    {!search && tab === 'emitidas' && permissions.canEmitInvoices !== false && (
                      <button onClick={() => setShowEmitir(true)}
                        className="text-[11px] text-[#1B4D8F] hover:underline mt-1">
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
                      <tr className="border-b border-slate-200 bg-slate-50">
                        {['Número', 'RPS', 'Cliente', 'CPF/CNPJ', 'Serviço', 'Valor', 'Data', 'Status', 'Amb.', 'Ações'].map((col, i) => (
                          <th key={i} className={cn('px-3 py-3 text-left', i === 9 && 'text-right')}>
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{col}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading
                        ? Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              {Array.from({ length: 10 }).map((__, j) => (
                                <td key={j} className="px-3 py-3">
                                  <div className="h-3 rounded-full bg-slate-100 animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                                </td>
                              ))}
                            </tr>
                          ))
                        : filtered.map((nfse, idx) => (
                            <motion.tr key={nfse.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                              className="border-t border-slate-100 hover:bg-slate-50 transition-colors group">
                              <td className="px-3 py-3">
                                <span className="text-[11px] font-mono text-gold-deep">{nfse.numeroNota ?? '—'}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[11px] font-mono text-slate-500">{nfse.numeroRps ?? '—'}</span>
                              </td>
                              <td className="px-3 py-3">
                                <p className="text-[11px] font-semibold text-slate-800 max-w-[120px] truncate">{nfse.clienteNome}</p>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[10px] font-mono text-slate-500">{nfse.clienteCpfCnpj}</span>
                              </td>
                              <td className="px-3 py-3">
                                <p className="text-[10px] text-slate-600 max-w-[140px] truncate">{nfse.descricaoServico}</p>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[11px] font-semibold text-slate-800">{formatCurrency(nfse.valorServico)}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[10px] text-slate-500">{formatDate(nfse.emittedAt ?? nfse.createdAt)}</span>
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
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:border-gold-deep/40 hover:text-gold-deep transition-all">
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  {nfse.xmlUrl && (
                                    <a href={nfse.xmlUrl} download title="Download XML"
                                      className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-all">
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {nfse.status === 'emitida' && permissions.canCancelInvoices !== false && (
                                    <button onClick={() => handleCancel(nfse)} title="Cancelar"
                                      className="w-7 h-7 rounded-lg border border-[#C0392B]/20 bg-[#FDE4E4] flex items-center justify-center text-[#C0392B]/70 hover:text-[#C0392B] hover:border-[#C0392B]/40 transition-all">
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
                <div className="px-4 py-3 border-t border-slate-100 text-center">
                  <button onClick={loadMore} disabled={loadingMore}
                    className="h-8 px-4 rounded-lg border border-slate-200 bg-white text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-all disabled:opacity-50 flex items-center gap-2 mx-auto">
                    <ChevronDown className="w-3.5 h-3.5" />
                    {loadingMore ? 'Carregando...' : 'Carregar mais'}
                  </button>
                </div>
              )}

              {!loading && filtered.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                  <p className="text-[9.5px] text-slate-400">
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
        <div className="fixed inset-0 z-50 bg-white">
          {React.createElement(
            React.lazy(() => import('../pdf/DanfsePreview').then(m => ({ default: m.DanfsePreview }))),
            { nfse: showDanfse, empresa, onClose: () => setShowDanfse(null) },
          )}
        </div>
      )}
    </div>
  );
}
