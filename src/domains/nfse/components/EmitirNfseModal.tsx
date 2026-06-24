import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, User, Briefcase, Calculator, Loader2, AlertCircle, Save, Send, Search } from 'lucide-react';
import type { NfseDocument, NfseEnvironment, NfseProvider, FiscalService, Empresa } from '../../../types';
import { NfseService } from '../services/NfseService';
import { fetchCep, calcISS, calcTotal, formatCurrency } from '../utils/nfse-utils';

function cn(...c: (string | boolean | undefined | null)[]): string {
  return c.filter(Boolean).join(' ');
}

interface Props {
  organizationId: string;
  empresa: Empresa | null;
  clienteId?: string;
  clienteNome?: string;
  clienteCpfCnpj?: string;
  clienteEmail?: string;
  clienteTelefone?: string;
  onClose(): void;
  onSaved(id: string): void;
}

type ModalTab = 'tomador' | 'servico' | 'impostos' | 'resumo';

const inputCls = "w-full h-9 bg-[#0E0F11] border border-white/[0.07] rounded-lg px-3 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4A854]/40 focus:ring-2 focus:ring-[#D4A854]/10 transition-all";
const selectCls = inputCls + " appearance-none cursor-pointer";
const labelCls  = "block text-[9px] font-black text-[#8E8E93]/60 uppercase tracking-[0.18em] mb-1.5";

const Field = ({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) => (
  <div className={span2 ? 'col-span-2' : ''}>
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

export function EmitirNfseModal({ organizationId, empresa, clienteId, clienteNome = '', clienteCpfCnpj = '', clienteEmail = '', clienteTelefone = '', onClose, onSaved }: Props) {
  const [tab, setTab] = useState<ModalTab>('tomador');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [fetchingCep, setFetchingCep] = useState(false);

  // Tomador
  const [nome, setNome]       = useState(clienteNome);
  const [cpfCnpj, setCpfCnpj] = useState(clienteCpfCnpj);
  const [email, setEmail]     = useState(clienteEmail);
  const [tel, setTel]         = useState(clienteTelefone);
  const [cep, setCep]         = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero]   = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro]   = useState('');
  const [cidade, setCidade]   = useState('');
  const [estado, setEstado]   = useState('');

  // Serviço
  const [servicoId, setServicoId]         = useState('');
  const [descricao, setDescricao]         = useState('');
  const [valor, setValor]                 = useState('');
  const [quantidade, setQuantidade]       = useState('1');
  const [desconto, setDesconto]           = useState('0');
  const [observacoes, setObservacoes]     = useState('');

  // Impostos
  const [issRetido, setIssRetido]         = useState(false);
  const [aliquotaISS, setAliquotaISS]     = useState(String(empresa?.fiscalSettings?.aliquotaISS ?? 2));
  const [natureza, setNatureza]           = useState('1');
  const [exigibilidade, setExigibilidade] = useState('1');

  const ambiente: NfseEnvironment  = empresa?.fiscalSettings?.nfseEnvironment  ?? 'homologacao';
  const provider: NfseProvider     = empresa?.fiscalSettings?.nfseProvider      ?? 'betha';
  const fiscalServices: FiscalService[] = empresa?.fiscalServices ?? [];

  // Auto-fill service fields when selecting a fiscal service
  const handleServicoChange = useCallback((id: string) => {
    setServicoId(id);
    const svc = fiscalServices.find(s => s.id === id);
    if (svc) {
      setDescricao(svc.descricao);
      setAliquotaISS(String(svc.aliquotaISS));
      if (svc.observacoesPadrao) setObservacoes(svc.observacoesPadrao);
    }
  }, [fiscalServices]);

  const handleCepBlur = useCallback(async () => {
    if (!cep || cep.replace(/\D/g, '').length !== 8) return;
    setFetchingCep(true);
    const data = await fetchCep(cep);
    if (data) {
      setLogradouro(data.logradouro);
      setBairro(data.bairro);
      setCidade(data.localidade);
      setEstado(data.uf);
    }
    setFetchingCep(false);
  }, [cep]);

  const valorNum    = parseFloat(valor.replace(',', '.')) || 0;
  const qtdNum      = parseInt(quantidade, 10) || 1;
  const descontoNum = parseFloat(desconto.replace(',', '.')) || 0;
  const totalServico = valorNum * qtdNum;
  const totalLiq     = calcTotal(totalServico, descontoNum);
  const valorIss     = calcISS(totalServico, parseFloat(aliquotaISS) || 0, descontoNum);

  const tabs: { id: ModalTab; label: string; Icon: React.ElementType }[] = [
    { id: 'tomador',  label: 'Tomador',  Icon: User },
    { id: 'servico',  label: 'Serviço',  Icon: Briefcase },
    { id: 'impostos', label: 'Impostos', Icon: Calculator },
    { id: 'resumo',   label: 'Resumo',   Icon: FileText },
  ];

  const buildNfse = (status: NfseDocument['status']): Omit<NfseDocument, 'id' | 'createdAt'> => ({
    organizationId,
    clienteId,
    clienteNome: nome,
    clienteCpfCnpj: cpfCnpj,
    clienteEmail: email || undefined,
    clienteTelefone: tel || undefined,
    clienteEndereco: logradouro ? { cep, logradouro, numero, complemento, bairro, cidade, estado } : undefined,
    servicoId: servicoId || undefined,
    descricaoServico: descricao,
    valorServico: totalServico,
    quantidade: qtdNum,
    desconto: descontoNum || undefined,
    valorISS: valorIss,
    aliquotaISS: parseFloat(aliquotaISS) || 0,
    issRetido,
    naturezaOperacao: natureza,
    exigibilidadeISS: exigibilidade,
    observacoes: observacoes || undefined,
    ambiente,
    provider,
    status,
  });

  const handleSaveDraft = async () => {
    if (!nome || !cpfCnpj || !descricao || valorNum <= 0) {
      setError('Preencha nome, CPF/CNPJ, descrição e valor do serviço.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await NfseService.createDraft(organizationId, buildNfse('rascunho') as any);
      onSaved(id);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar rascunho');
    } finally {
      setSaving(false);
    }
  };

  const handleEmit = async () => {
    if (!nome || !cpfCnpj || !descricao || valorNum <= 0) {
      setError('Preencha nome, CPF/CNPJ, descrição e valor do serviço.');
      setTab('tomador');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await NfseService.createDraft(organizationId, buildNfse('processando') as any);
      // TODO: chamar o provider para emissão real
      // await provider.emit(rps)
      onSaved(id);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao emitir nota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />

        <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="relative w-full max-w-xl rounded-[22px] border border-white/[0.07] bg-[#0E0F11]/97 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          onClick={e => e.stopPropagation()}>

          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/40 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
                <FileText className="w-4 h-4 text-[#D4A854]" />
              </div>
              <div>
                <p className="text-[13px] font-black text-white leading-tight">Emitir NFS-e</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${ambiente === 'producao' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {ambiente === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}
                  </span>
                  <span className="text-[9px] text-[#8E8E93]/40">{provider}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} disabled={saving}
              className="p-1.5 rounded-lg text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="shrink-0 border-b border-white/[0.05] px-5 flex gap-0 overflow-x-auto">
            {tabs.map(t => {
              const Icon = t.Icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap',
                    tab === t.id ? 'border-[#D4A854] text-[#D4A854]' : 'border-transparent text-white/30 hover:text-white/60',
                  )}>
                  <Icon className="w-3 h-3" />{t.label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-5">

            {/* ── Tomador ── */}
            {tab === 'tomador' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome / Razão Social" span2>
                    <input className={inputCls} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo ou razão social" />
                  </Field>
                  <Field label="CPF / CNPJ">
                    <input className={inputCls} value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="000.000.000-00" />
                  </Field>
                  <Field label="E-mail">
                    <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                  </Field>
                  <Field label="Telefone">
                    <input className={inputCls} value={tel} onChange={e => setTel(e.target.value)} placeholder="(67) 99999-9999" />
                  </Field>
                </div>

                <p className="text-[9px] font-black text-[#8E8E93]/60 uppercase tracking-[0.18em] mt-4 mb-2">Endereço</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CEP">
                    <div className="relative">
                      <input className={inputCls + ' pr-8'} value={cep} onChange={e => setCep(e.target.value)} onBlur={handleCepBlur} placeholder="79000-000" />
                      {fetchingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#D4A854] animate-spin" />}
                      {!fetchingCep && <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />}
                    </div>
                  </Field>
                  <Field label="Número">
                    <input className={inputCls} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" />
                  </Field>
                  <Field label="Logradouro" span2>
                    <input className={inputCls} value={logradouro} onChange={e => setLogradouro(e.target.value)} placeholder="Rua, Av., ..." />
                  </Field>
                  <Field label="Complemento">
                    <input className={inputCls} value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Sala 1, Apto..." />
                  </Field>
                  <Field label="Bairro">
                    <input className={inputCls} value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" />
                  </Field>
                  <Field label="Cidade">
                    <input className={inputCls} value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Campo Grande" />
                  </Field>
                  <Field label="Estado">
                    <input className={inputCls} value={estado} onChange={e => setEstado(e.target.value)} placeholder="MS" maxLength={2} />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Serviço ── */}
            {tab === 'servico' && (
              <div className="space-y-3">
                {fiscalServices.length > 0 && (
                  <Field label="Serviço cadastrado">
                    <select className={selectCls} value={servicoId} onChange={e => handleServicoChange(e.target.value)}>
                      <option value="">— Selecionar serviço —</option>
                      {fiscalServices.filter(s => s.ativo).map(s => (
                        <option key={s.id} value={s.id}>{s.descricao} (ISS {s.aliquotaISS}%)</option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Descrição do serviço" span2>
                    <textarea className={inputCls + ' h-16 resize-none py-2'} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Corretagem de seguros..." />
                  </Field>
                  <Field label="Valor unitário (R$)">
                    <input className={inputCls} type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                  </Field>
                  <Field label="Quantidade">
                    <input className={inputCls} type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                  </Field>
                  <Field label="Desconto (R$)">
                    <input className={inputCls} type="number" min="0" step="0.01" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
                  </Field>
                  <Field label="Observações" span2>
                    <textarea className={inputCls + ' h-14 resize-none py-2'} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Informações complementares..." />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Impostos ── */}
            {tab === 'impostos' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Alíquota ISS (%)">
                    <input className={inputCls} type="number" min="0" max="100" step="0.01" value={aliquotaISS} onChange={e => setAliquotaISS(e.target.value)} />
                  </Field>
                  <div>
                    <label className={labelCls}>ISS Retido na Fonte</label>
                    <button type="button" onClick={() => setIssRetido(v => !v)}
                      className={cn('h-9 w-full rounded-lg border text-[11px] font-semibold transition-all',
                        issRetido
                          ? 'bg-red-500/10 border-red-500/30 text-red-400'
                          : 'bg-white/[0.03] border-white/[0.07] text-white/50 hover:border-white/15 hover:text-white/70',
                      )}>
                      {issRetido ? 'SIM — ISS Retido' : 'NÃO — Recolhimento pelo Prestador'}
                    </button>
                  </div>
                  <Field label="Natureza da Operação">
                    <select className={selectCls} value={natureza} onChange={e => setNatureza(e.target.value)}>
                      <option value="1">1 — Tributação no Município</option>
                      <option value="2">2 — Tributação Fora do Município</option>
                      <option value="3">3 — Isenção</option>
                      <option value="4">4 — Imune</option>
                      <option value="6">6 — Exigibilidade Suspensa por Decisão Judicial</option>
                      <option value="7">7 — Exigibilidade Suspensa por Procedimento Administrativo</option>
                    </select>
                  </Field>
                  <Field label="Exigibilidade do ISS">
                    <select className={selectCls} value={exigibilidade} onChange={e => setExigibilidade(e.target.value)}>
                      <option value="1">1 — Exigível</option>
                      <option value="2">2 — Não incidência</option>
                      <option value="3">3 — Isenção</option>
                      <option value="4">4 — Exportação</option>
                      <option value="5">5 — Imunidade</option>
                      <option value="6">6 — Exig. Suspensa por Decisão Judicial</option>
                      <option value="7">7 — Exig. Suspensa por Processo Administrativo</option>
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {/* ── Resumo ── */}
            {tab === 'resumo' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-white/[0.07] bg-[#16181B] overflow-hidden">
                  {[
                    { label: 'Tomador',         value: nome || '—' },
                    { label: 'CPF/CNPJ',         value: cpfCnpj || '—' },
                    { label: 'Serviço',          value: descricao || '—' },
                    { label: 'Valor bruto',      value: formatCurrency(totalServico) },
                    { label: 'Desconto',         value: descontoNum > 0 ? `− ${formatCurrency(descontoNum)}` : '—' },
                    { label: `ISS (${aliquotaISS}%)`, value: formatCurrency(valorIss), highlight: true },
                    { label: 'ISS retido',       value: issRetido ? 'Sim' : 'Não' },
                    { label: 'Ambiente',         value: ambiente === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO' },
                    { label: 'Provedor',         value: provider },
                  ].map(({ label, value, highlight }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] last:border-0">
                      <span className="text-[10px] font-semibold text-[#8E8E93]/60">{label}</span>
                      <span className={cn('text-[11px] font-semibold', highlight ? 'text-[#D4A854]' : 'text-white/80')}>{value}</span>
                    </div>
                  ))}
                </div>
                {/* Total */}
                <div className="rounded-xl border border-[#D4A854]/20 bg-[#D4A854]/[0.04] p-4 text-center">
                  <p className="text-[9px] font-black text-[#D4A854]/60 uppercase tracking-widest mb-1">Valor Total dos Serviços</p>
                  <p className="text-[24px] font-black text-[#D4A854]">{formatCurrency(totalLiq)}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] mt-3">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <p className="text-[11px] text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/[0.05] shrink-0 flex items-center justify-between gap-3">
            <button onClick={onClose} disabled={saving}
              className="h-9 px-4 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-[#8E8E93]/80 hover:border-white/15 hover:text-white transition-all disabled:opacity-50">
              Cancelar
            </button>
            <div className="flex items-center gap-2">
              <button onClick={handleSaveDraft} disabled={saving}
                className="h-9 px-4 rounded-lg border border-[#D4A854]/30 bg-[#D4A854]/[0.06] text-[11px] font-black text-[#D4A854]/80 hover:text-[#D4A854] hover:border-[#D4A854]/50 transition-all disabled:opacity-60 flex items-center gap-2">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Rascunho
              </button>
              <button onClick={handleEmit} disabled={saving}
                className="h-9 px-5 rounded-lg bg-[#D4A854] text-[#050505] text-[11px] font-black uppercase tracking-wide flex items-center gap-2 hover:bg-[#C49844] transition-all disabled:opacity-60">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Emitir NFS-e
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
