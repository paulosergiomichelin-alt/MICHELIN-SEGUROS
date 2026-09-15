import React, { useState, useCallback } from 'react';
import { FileText, User, Briefcase, Calculator, Loader2, AlertCircle, Save, Send, Search } from 'lucide-react';
import type { NfseDocument, NfseEnvironment, NfseProvider, FiscalService, Empresa } from '../../../types';
import { NfseService } from '../services/NfseService';
import { fetchCep, calcISS, calcTotal, formatCurrency } from '../utils/nfse-utils';
import { Button, Card, Badge, Modal, Input, Select, Textarea } from '../../../components/ui';
import { cn } from '../../../lib/utils';

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
    <Modal
      title="Emitir NFS-e"
      onClose={() => { if (!saving) onClose(); }}
      className="max-w-xl"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={Save} onClick={handleSaveDraft} disabled={saving} loading={saving}>
              Rascunho
            </Button>
            <Button variant="primary" icon={Send} onClick={handleEmit} disabled={saving} loading={saving}>
              Emitir NFS-e
            </Button>
          </div>
        </div>
      }
    >
      {/* Ambiente / provedor */}
      <div className="flex items-center gap-1.5 mb-3">
        <Badge variant={ambiente === 'producao' ? 'success' : 'warning'}>
          {ambiente === 'producao' ? 'Produção' : 'Homologação'}
        </Badge>
        <span className="text-[9px] text-slate-400 font-semibold">{provider}</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-0 overflow-x-auto -mx-5 px-5 mb-4">
        {tabs.map(t => {
          const Icon = t.Icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap',
                tab === t.id ? 'border-[#1B4D8F] text-[#1B4D8F]' : 'border-transparent text-slate-400 hover:text-slate-600',
              )}>
              <Icon className="w-3 h-3" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tomador ── */}
      {tab === 'tomador' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input label="Nome / Razão Social" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo ou razão social" />
            </div>
            <Input label="CPF / CNPJ" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="000.000.000-00" />
            <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            <Input label="Telefone" value={tel} onChange={e => setTel(e.target.value)} placeholder="(67) 99999-9999" />
          </div>

          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.18em] mt-4 mb-2">Endereço</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">CEP</label>
              <div className={cn(
                'flex items-center rounded-lg border overflow-hidden focus-within:border-[#1B4D8F]/60 focus-within:ring-2 focus-within:ring-[#1B4D8F]/15',
                'border-slate-200',
              )}>
                <input
                  className="w-full px-3 py-2 bg-white text-slate-800 text-[12px] font-medium outline-none placeholder:text-slate-300"
                  value={cep} onChange={e => setCep(e.target.value)} onBlur={handleCepBlur} placeholder="79000-000"
                />
                <span className="px-3 bg-slate-50 border-l border-slate-200 text-slate-400 shrink-0 flex items-center">
                  {fetchingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </span>
              </div>
            </div>
            <Input label="Número" value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" />
            <div className="col-span-2">
              <Input label="Logradouro" value={logradouro} onChange={e => setLogradouro(e.target.value)} placeholder="Rua, Av., ..." />
            </div>
            <Input label="Complemento" value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Sala 1, Apto..." />
            <Input label="Bairro" value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" />
            <Input label="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Campo Grande" />
            <Input label="Estado" value={estado} onChange={e => setEstado(e.target.value)} placeholder="MS" maxLength={2} />
          </div>
        </div>
      )}

      {/* ── Serviço ── */}
      {tab === 'servico' && (
        <div className="space-y-3">
          {fiscalServices.length > 0 && (
            <Select label="Serviço cadastrado" value={servicoId} onChange={e => handleServicoChange(e.target.value)}>
              <option value="">— Selecionar serviço —</option>
              {fiscalServices.filter(s => s.ativo).map(s => (
                <option key={s.id} value={s.id}>{s.descricao} (ISS {s.aliquotaISS}%)</option>
              ))}
            </Select>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Textarea label="Descrição do serviço" rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Corretagem de seguros..." />
            </div>
            <Input label="Valor unitário (R$)" type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
            <Input label="Quantidade" type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
            <Input label="Desconto (R$)" type="number" min="0" step="0.01" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
            <div className="col-span-2">
              <Textarea label="Observações" rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Informações complementares..." />
            </div>
          </div>
        </div>
      )}

      {/* ── Impostos ── */}
      {tab === 'impostos' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Alíquota ISS (%)" type="number" min="0" max="100" step="0.01" value={aliquotaISS} onChange={e => setAliquotaISS(e.target.value)} />
            <div>
              <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">ISS Retido na Fonte</label>
              <button type="button" onClick={() => setIssRetido(v => !v)}
                className={cn('h-9 w-full rounded-lg border text-[11px] font-semibold transition-all',
                  issRetido
                    ? 'bg-[#FDE4E4] border-[#C0392B]/30 text-[#C0392B]'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700',
                )}>
                {issRetido ? 'SIM — ISS Retido' : 'NÃO — Recolhimento pelo Prestador'}
              </button>
            </div>
            <Select label="Natureza da Operação" value={natureza} onChange={e => setNatureza(e.target.value)}>
              <option value="1">1 — Tributação no Município</option>
              <option value="2">2 — Tributação Fora do Município</option>
              <option value="3">3 — Isenção</option>
              <option value="4">4 — Imune</option>
              <option value="6">6 — Exigibilidade Suspensa por Decisão Judicial</option>
              <option value="7">7 — Exigibilidade Suspensa por Procedimento Administrativo</option>
            </Select>
            <Select label="Exigibilidade do ISS" value={exigibilidade} onChange={e => setExigibilidade(e.target.value)}>
              <option value="1">1 — Exigível</option>
              <option value="2">2 — Não incidência</option>
              <option value="3">3 — Isenção</option>
              <option value="4">4 — Exportação</option>
              <option value="5">5 — Imunidade</option>
              <option value="6">6 — Exig. Suspensa por Decisão Judicial</option>
              <option value="7">7 — Exig. Suspensa por Processo Administrativo</option>
            </Select>
          </div>
        </div>
      )}

      {/* ── Resumo ── */}
      {tab === 'resumo' && (
        <div className="space-y-3">
          <Card className="p-0 overflow-hidden">
            {[
              { label: 'Tomador',         value: nome || '—' },
              { label: 'CPF/CNPJ',         value: cpfCnpj || '—' },
              { label: 'Serviço',          value: descricao || '—' },
              { label: 'Valor bruto',      value: formatCurrency(totalServico) },
              { label: 'Desconto',         value: descontoNum > 0 ? `− ${formatCurrency(descontoNum)}` : '—' },
              { label: `ISS (${aliquotaISS}%)`, value: formatCurrency(valorIss), highlight: true },
              { label: 'ISS retido',       value: issRetido ? 'Sim' : 'Não' },
              { label: 'Ambiente',         value: ambiente === 'producao' ? 'Produção' : 'Homologação' },
              { label: 'Provedor',         value: provider },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0">
                <span className="text-[10px] font-semibold text-slate-500">{label}</span>
                <span className={cn('text-[11px] font-semibold', highlight ? 'text-gold-deep' : 'text-slate-700')}>{value}</span>
              </div>
            ))}
          </Card>
          {/* Total */}
          <div className="rounded-xl border border-gold-deep/25 bg-gold-deep/[0.06] p-4 text-center">
            <p className="text-[9px] font-black text-gold-deep/80 uppercase tracking-widest mb-1">Valor Total dos Serviços</p>
            <p className="text-[24px] font-black text-gold-deep">{formatCurrency(totalLiq)}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-[#C0392B]/20 bg-[#FDE4E4] mt-3">
          <AlertCircle className="w-3.5 h-3.5 text-[#C0392B] shrink-0" />
          <p className="text-[11px] text-[#C0392B]">{error}</p>
        </div>
      )}
    </Modal>
  );
}
