import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Plus, Trash2, CheckCircle2, AlertTriangle, Clock,
  User, Phone, Mail, MapPin, FileText, History, RefreshCw, ExternalLink,
  Calendar, DollarSign, Building2, ClipboardList, Car, Shield, Tag,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Cliente, Lead, Apolice, ClienteHistoricoItem, ClienteStatus } from '../../types';
import { DataService } from '../../services/DataService';
import { ClienteService } from '../../services/ClienteService';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { ClienteForm } from './ClienteForm';
import { ApoliceForm } from './ApoliceForm';
import { usePermissions } from '../../contexts/PermissionsContext';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Tab = 'resumo' | 'cadastro' | 'apolices' | 'renovacoes' | 'historico';

const STATUS_CONFIG: Record<ClienteStatus, { label: string; cls: string; icon: React.ElementType }> = {
  ativo:             { label: 'Ativo',             cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  renovacao_proxima: { label: 'Renovação Próxima', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/20',      icon: Clock },
  renovacao_vencida: { label: 'Renovação Vencida', cls: 'bg-red-500/10 text-red-400 border-red-500/20',            icon: AlertTriangle },
  inativo:           { label: 'Inativo',            cls: 'bg-white/5 text-white/40 border-white/10',                icon: Clock },
};

const APOLICE_STATUS_COLOR: Record<string, string> = {
  ativo:        'text-emerald-400',
  em_renovacao: 'text-amber-300',
  expirado:     'text-red-400',
  cancelado:    'text-white/30',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); } catch { return iso; }
}

function fmtMoney(cents?: number) {
  if (!cents) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCPF(cpf: string) {
  const n = (cpf ?? '').replace(/\D/g, '');
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function fmtPhone(phone: string) {
  const n = (phone ?? '').replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return phone;
}

const HIST_ICON: Record<string, React.ElementType> = {
  criado:         Plus,
  convertido:     ExternalLink,
  apolice_criada: FileText,
  apolice_renovada: RefreshCw,
  observacao:     FileText,
  status_alterado: CheckCircle2,
  editado:        Edit2,
};

export const ClienteDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = usePermissions();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [leadOrigem, setLeadOrigem] = useState<Lead | null>(null);
  const [apolices, setApolices] = useState<Apolice[]>([]);
  const [historico, setHistorico] = useState<ClienteHistoricoItem[]>([]);
  const [loadingCliente, setLoadingCliente] = useState(true);
  const [tab, setTab] = useState<Tab>('resumo');
  const [showEditCliente, setShowEditCliente] = useState(false);
  const [showApoliceForm, setShowApoliceForm] = useState(false);
  const [editingApolice, setEditingApolice] = useState<Apolice | null>(null);

  // Load cliente
  useEffect(() => {
    if (!id) return;
    setLoadingCliente(true);
    DataService.get('cliente', id).then(data => {
      setCliente(data as Cliente);
      setLoadingCliente(false);
    }).catch(() => setLoadingCliente(false));
  }, [id]);

  // Real-time apolices
  useEffect(() => {
    if (!id) return;
    return ClienteService.subscribeApolices(id, setApolices);
  }, [id]);

  // Real-time historico
  useEffect(() => {
    if (!id) return;
    return ClienteService.subscribeHistorico(id, setHistorico);
  }, [id]);

  // Load original lead when available
  useEffect(() => {
    if (!cliente?.leadOrigemId) { setLeadOrigem(null); return; }
    DataService.get('lead', cliente.leadOrigemId)
      .then(d => setLeadOrigem(d as Lead ?? null))
      .catch(() => setLeadOrigem(null));
  }, [cliente?.leadOrigemId]);

  const handleSaveCliente = async (data: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!id) return;
    await DataService.update('cliente', id, { ...data, updatedAt: new Date().toISOString() });
    setCliente(prev => prev ? { ...prev, ...data } : prev);
    await ClienteService.addHistorico(id, {
      clienteId: id,
      tipo: 'editado',
      descricao: 'Dados do cliente atualizados',
      usuarioId: userProfile?.uid,
      usuarioNome: userProfile?.name,
      organizationId: userProfile?.organizationId,
    });
  };

  const handleSaveApolice = async (data: Omit<Apolice, 'id' | 'clienteId' | 'createdAt' | 'updatedAt'>) => {
    if (!id) return;
    if (editingApolice) {
      await ClienteService.updateApolice(id, editingApolice.id, data as Partial<Apolice>);
    } else {
      await ClienteService.createApolice(id, { ...data, clienteId: id }, userProfile?.organizationId);
    }
    // Refresh cliente for denormalized fields
    const updated = await DataService.get('cliente', id);
    setCliente(updated as Cliente);
  };

  const handleDeleteApolice = async (apoliceId: string) => {
    if (!id || !window.confirm('Excluir esta apólice?')) return;
    await ClienteService.deleteApolice(id, apoliceId);
  };

  if (loadingCliente) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle className="w-10 h-10 text-white/20" />
        <p className="text-white/40 text-sm">Cliente não encontrado</p>
        <button onClick={() => navigate('/clientes')} className="text-gold-deep text-sm font-bold">← Voltar</button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[cliente.status] ?? STATUS_CONFIG.inativo;
  const StatusIcon = statusCfg.icon;
  const apoliceAtiva = apolices.find(a => a.status === 'ativo');
  const upcomingRenov = apolices.filter(a => {
    try { return differenceInDays(parseISO(a.dataRenovacao), new Date()) >= 0; } catch { return false; }
  }).sort((a,b) => new Date(a.dataRenovacao).getTime() - new Date(b.dataRenovacao).getTime());

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'resumo',    label: 'Resumo',    icon: User },
    { id: 'cadastro',  label: 'Cadastro',  icon: ClipboardList },
    { id: 'apolices',  label: `Apólices (${apolices.length})`,  icon: FileText },
    { id: 'renovacoes',label: `Renovações (${upcomingRenov.length})`,icon: RefreshCw },
    { id: 'historico', label: 'Histórico', icon: History },
  ];

  return (
    <div className="flex flex-col h-full bg-brand-dark">
      {/* Top bar */}
      <div className="shrink-0 bg-brand-black/80 border-b border-white/5 px-4 md:px-6 py-3.5 flex items-center gap-3">
        <button onClick={() => navigate('/clientes')} className="p-1.5 text-white/30 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-sm font-black text-white">{cliente.nome}</h1>
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider', statusCfg.cls)}>
              <StatusIcon className="w-2.5 h-2.5" />{statusCfg.label}
            </span>
          </div>
          <p className="text-[10px] text-white/30 font-mono mt-0.5">{fmtCPF(cliente.cpf)}</p>
        </div>
        <div className="flex items-center gap-2">
          {cliente.leadOrigemId && (
            <button
              onClick={() => navigate('/leads/' + cliente.leadOrigemId)}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Ver Lead
            </button>
          )}
          <button
            onClick={() => setShowEditCliente(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gold-deep/10 border border-gold-deep/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-gold-light hover:bg-gold-deep/20 transition-colors"
          >
            <Edit2 className="w-3 h-3" /> Editar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-white/5 px-4 md:px-6 flex gap-0 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap',
                tab === t.id ? 'border-gold-deep text-gold-light' : 'border-transparent text-white/30 hover:text-white/60',
              )}
            >
              <Icon className="w-3 h-3" />{t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">

        {/* RESUMO */}
        {tab === 'resumo' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
            {/* Dados pessoais */}
            <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-gold-deep" />
                <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Dados Pessoais</h3>
              </div>
              {[
                ['Nome', cliente.nome],
                ['CPF', fmtCPF(cliente.cpf)],
                ['RG', cliente.rg],
                ['Nascimento', fmtDate(cliente.dataNascimento)],
                ['Estado civil', cliente.estadoCivil],
                ['Profissão', cliente.profissao],
              ].map(([k,v]) => v ? (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[9px] text-white/30 uppercase tracking-widest font-black">{k}</span>
                  <span className="text-[10px] text-white/80 font-medium text-right">{v}</span>
                </div>
              ) : null)}
            </div>

            {/* Contato */}
            <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-4 h-4 text-gold-deep" />
                <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Contato</h3>
              </div>
              {[
                ['Telefone', cliente.telefone ? fmtPhone(cliente.telefone) : undefined],
                ['WhatsApp', cliente.whatsapp ? fmtPhone(cliente.whatsapp) : undefined],
                ['E-mail', cliente.email],
                ['Cidade', [cliente.cidade, cliente.estado].filter(Boolean).join(' / ')],
                ['CEP', cliente.cep],
                ['Endereço', [cliente.rua, cliente.numero, cliente.complemento, cliente.bairro].filter(Boolean).join(', ')],
              ].map(([k,v]) => v ? (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[9px] text-white/30 uppercase tracking-widest font-black">{k}</span>
                  <span className="text-[10px] text-white/80 font-medium text-right max-w-[200px]">{v}</span>
                </div>
              ) : null)}
            </div>

            {/* Seguro atual */}
            {apoliceAtiva && (
              <div className="md:col-span-2 bg-brand-black/50 border border-gold-deep/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-gold-deep" />
                  <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Apólice Ativa</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[9px] text-white/30 uppercase font-black mb-1">Produto</p>
                    <p className="text-[11px] text-white font-bold">{apoliceAtiva.produto}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/30 uppercase font-black mb-1">Seguradora</p>
                    <SeguradoraBadge seguradoraId={apoliceAtiva.seguradoraId} size="xs" />
                  </div>
                  <div>
                    <p className="text-[9px] text-white/30 uppercase font-black mb-1">Renovação</p>
                    <p className="text-[11px] text-amber-300 font-bold">{fmtDate(apoliceAtiva.dataRenovacao)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/30 uppercase font-black mb-1">Prêmio</p>
                    <p className="text-[11px] text-white font-bold">{fmtMoney(apoliceAtiva.valorTotal)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Observações */}
            {cliente.observacoes && (
              <div className="md:col-span-2 bg-brand-black/50 border border-white/5 rounded-2xl p-5">
                <p className="text-[9px] text-white/30 uppercase font-black mb-2">Observações</p>
                <p className="text-[11px] text-white/70 leading-relaxed">{cliente.observacoes}</p>
              </div>
            )}
          </div>
        )}

        {/* CADASTRO */}
        {tab === 'cadastro' && (
          <div className="max-w-4xl space-y-4">
            {!cliente.leadOrigemId ? (
              <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
                <ClipboardList className="w-10 h-10 text-white/10" />
                <p className="text-white/30 text-sm">Cliente cadastrado manualmente — sem ficha de lead</p>
              </div>
            ) : !leadOrigem ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/30 uppercase tracking-widest font-black">Ficha do lead original</p>
                  <button
                    onClick={() => navigate('/leads/' + leadOrigem.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <ExternalLink className="w-3 h-3" /> Abrir Lead
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Identificação */}
                  <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-4 h-4 text-gold-deep" />
                      <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Identificação</h3>
                    </div>
                    {[
                      ['Nome', leadOrigem.name],
                      ['CPF', fmtCPF(leadOrigem.cpf)],
                      ['RG', leadOrigem.rg],
                      ['Nascimento', leadOrigem.birthDate ? fmtDate(leadOrigem.birthDate) : undefined],
                      ['Estado Civil', leadOrigem.civilStatus || leadOrigem.maritalStatus],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-white/80 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </div>

                  {/* Contato */}
                  <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-3">
                      <Phone className="w-4 h-4 text-gold-deep" />
                      <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Contato</h3>
                    </div>
                    {[
                      ['Telefone', leadOrigem.phone ? fmtPhone(leadOrigem.phone) : undefined],
                      ['Telefone 2', leadOrigem.phone2 ? fmtPhone(leadOrigem.phone2) : undefined],
                      ['E-mail', leadOrigem.email],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-white/80 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </div>

                  {/* Veículo */}
                  {(leadOrigem.plate || leadOrigem.chassis || leadOrigem.chassi) && (
                    <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                      <div className="flex items-center gap-2 mb-3">
                        <Car className="w-4 h-4 text-gold-deep" />
                        <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Veículo</h3>
                      </div>
                      {[
                        ['Placa', leadOrigem.plate],
                        ['Chassi', leadOrigem.chassis || leadOrigem.chassi],
                        ['RENAVAM', leadOrigem.renavam],
                        ['Marca / Modelo', leadOrigem.brandModel],
                      ].map(([k, v]) => v ? (
                        <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0">{k}</span>
                          <span className="text-[10px] text-white/80 font-medium text-right font-mono">{v}</span>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {/* Perfil / Seguro */}
                  <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-gold-deep" />
                      <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Perfil e Seguro</h3>
                    </div>
                    {[
                      ['Possui seguro', (leadOrigem.hasInsurance || leadOrigem.possuiSeguro) ? 'Sim' : 'Não'],
                      ['Seguradora atual', leadOrigem.insurer],
                      ['Início vigência', leadOrigem.startDate ? fmtDate(leadOrigem.startDate) : undefined],
                      ['Fim vigência', leadOrigem.insuranceExpiry ? fmtDate(leadOrigem.insuranceExpiry) : undefined],
                      ['Uso comercial', leadOrigem.serviceUsage ? 'Sim' : 'Não'],
                      ['Condutor jovem (18-24)', leadOrigem.youngDriverHousehold ? 'Sim' : 'Não'],
                      ['Proprietário é condutor', (leadOrigem.isOwnerDriver || leadOrigem.proprietarioEhCondutor) ? 'Sim' : 'Não'],
                      ['Alienação fiduciária', (leadOrigem.fiduciaryAlienation || leadOrigem.alienacaoFiduciaria) ? 'Sim' : 'Não'],
                    ].map(([k, v]) => v != null ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0 max-w-[55%]">{k}</span>
                        <span className="text-[10px] text-white/80 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </div>

                  {/* Endereço Pernoite */}
                  <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-gold-deep" />
                      <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">End. Pernoite</h3>
                    </div>
                    {[
                      ['CEP', leadOrigem.zipCodeOvernight || leadOrigem.cepPernoite],
                      ['Logradouro', leadOrigem.addressOvernight || leadOrigem.logradouroPernoite],
                      ['Número', leadOrigem.numberOvernight || leadOrigem.numeroPernoite],
                      ['Bairro', leadOrigem.bairroPernoite],
                      ['Cidade', leadOrigem.cidadePernoite || leadOrigem.city],
                      ['Estado', leadOrigem.estadoPernoite],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-white/80 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </div>

                  {/* Endereço Residência (se diferente) */}
                  {leadOrigem.isDifferentResidenceZip && (leadOrigem.zipCodeResidence || leadOrigem.addressResidence) && (
                    <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                      <div className="flex items-center gap-2 mb-3">
                        <MapPin className="w-4 h-4 text-gold-deep" />
                        <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">End. Residencial</h3>
                      </div>
                      {[
                        ['CEP', leadOrigem.zipCodeResidence],
                        ['Logradouro', leadOrigem.addressResidence],
                        ['Número', leadOrigem.numberResidence],
                      ].map(([k, v]) => v ? (
                        <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0">{k}</span>
                          <span className="text-[10px] text-white/80 font-medium text-right">{v}</span>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {/* Proprietário (se diferente do condutor) */}
                  {(leadOrigem.ownerName || leadOrigem.nomeProprietario || leadOrigem.ownerCpfCnpj) && (
                    <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                      <div className="flex items-center gap-2 mb-3">
                        <User className="w-4 h-4 text-gold-deep" />
                        <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Proprietário do Veículo</h3>
                      </div>
                      {[
                        ['Nome', leadOrigem.ownerName || leadOrigem.nomeProprietario],
                        ['CPF / CNPJ', leadOrigem.ownerCpfCnpj || leadOrigem.cpfProprietario],
                        ['Instituição financeira', leadOrigem.financialInstitution],
                      ].map(([k, v]) => v ? (
                        <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                          <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0">{k}</span>
                          <span className="text-[10px] text-white/80 font-medium text-right">{v}</span>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  {/* Origem */}
                  <div className="bg-brand-black/50 border border-white/5 rounded-2xl p-5 space-y-2.5">
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="w-4 h-4 text-gold-deep" />
                      <h3 className="text-[10px] font-black text-gold-light uppercase tracking-widest">Origem</h3>
                    </div>
                    {[
                      ['Canal', leadOrigem.origin],
                      ['Detalhes', leadOrigem.originDetails],
                      ['Status no CRM', leadOrigem.status],
                      ['Temperatura', leadOrigem.temperature],
                      ['Criado em', fmtDate(leadOrigem.createdAt)],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-white/30 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-white/80 font-medium text-right capitalize">{v}</span>
                      </div>
                    ) : null)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* APÓLICES */}
        {tab === 'apolices' && (
          <div className="max-w-5xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-[11px] font-black text-white/60 uppercase tracking-widest">Histórico de Apólices</h2>
              <button
                onClick={() => { setEditingApolice(null); setShowApoliceForm(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-gold-deep text-brand-dark rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Nova Apólice
              </button>
            </div>

            {apolices.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <FileText className="w-10 h-10 text-white/10" />
                <p className="text-white/30 text-sm">Nenhuma apólice cadastrada</p>
                <button onClick={() => setShowApoliceForm(true)} className="text-gold-deep text-[10px] font-black uppercase">
                  + Adicionar primeira apólice
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {apolices.map(a => (
                  <div key={a.id} className="bg-brand-black/50 border border-white/5 rounded-xl p-4 hover:border-gold-deep/20 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <p className="text-[9px] text-white/30 uppercase font-black mb-1">Produto</p>
                          <p className="text-[11px] text-white font-bold">{a.produto}</p>
                          {a.numeroApolice && <p className="text-[9px] text-white/30 font-mono mt-0.5">#{a.numeroApolice}</p>}
                        </div>
                        <div>
                          <p className="text-[9px] text-white/30 uppercase font-black mb-1">Seguradora</p>
                          <SeguradoraBadge seguradoraId={a.seguradoraId} size="xs" />
                        </div>
                        <div>
                          <p className="text-[9px] text-white/30 uppercase font-black mb-1">Vigência</p>
                          <p className="text-[10px] text-white/70">{fmtDate(a.inicioVigencia)} → {fmtDate(a.fimVigencia)}</p>
                          <p className="text-[9px] text-amber-300 mt-0.5">Renov: {fmtDate(a.dataRenovacao)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-white/30 uppercase font-black mb-1">Valor total</p>
                          <p className="text-[11px] text-white font-bold">{fmtMoney(a.valorTotal)}</p>
                          <p className={cn('text-[9px] font-black uppercase mt-0.5', APOLICE_STATUS_COLOR[a.status])}>{a.status.replace('_',' ')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingApolice(a); setShowApoliceForm(true); }}
                          className="p-1.5 text-white/20 hover:text-gold-deep transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteApolice(a.id)}
                          className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RENOVAÇÕES */}
        {tab === 'renovacoes' && (
          <div className="max-w-3xl space-y-3">
            <h2 className="text-[11px] font-black text-white/60 uppercase tracking-widest mb-4">Próximas Renovações</h2>
            {upcomingRenov.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Calendar className="w-10 h-10 text-white/10" />
                <p className="text-white/30 text-sm">Nenhuma renovação pendente</p>
              </div>
            ) : upcomingRenov.map(a => {
              const days = differenceInDays(parseISO(a.dataRenovacao), new Date());
              const urgencyColor = days <= 7 ? 'border-red-500/30 bg-red-500/5' : days <= 30 ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5 bg-brand-black/30';
              return (
                <div key={a.id} className={cn('border rounded-xl p-4', urgencyColor)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-bold text-white">{a.produto}</p>
                      <SeguradoraBadge seguradoraId={a.seguradoraId} size="xs" className="mt-1" />
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-white/50">Renovação</p>
                      <p className={cn('text-[13px] font-black', days <= 7 ? 'text-red-400' : days <= 30 ? 'text-amber-300' : 'text-white')}>
                        {fmtDate(a.dataRenovacao)}
                      </p>
                      <p className="text-[10px] text-white/40">{days === 0 ? 'Hoje' : `em ${days} dias`}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTÓRICO */}
        {tab === 'historico' && (
          <div className="max-w-2xl space-y-0 relative">
            <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/5" />
            {historico.length === 0 ? (
              <p className="text-white/30 text-sm pl-12">Nenhum registro de histórico</p>
            ) : historico.map((item, i) => {
              const Icon = HIST_ICON[item.tipo] ?? CheckCircle2;
              return (
                <div key={item.id} className="relative flex items-start gap-4 pb-5">
                  <div className="w-9 h-9 rounded-full bg-brand-black border border-white/10 flex items-center justify-center shrink-0 z-10">
                    <Icon className="w-3.5 h-3.5 text-gold-deep" />
                  </div>
                  <div className="flex-1 bg-brand-black/50 border border-white/5 rounded-xl p-3 mt-0">
                    <p className="text-[11px] text-white font-medium">{item.descricao}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.usuarioNome && <span className="text-[9px] text-white/30">{item.usuarioNome}</span>}
                      <span className="text-[9px] text-white/20">{fmtDate(item.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modals */}
      <ClienteForm
        isOpen={showEditCliente}
        onClose={() => setShowEditCliente(false)}
        onSave={handleSaveCliente}
        cliente={cliente}
      />
      <ApoliceForm
        isOpen={showApoliceForm}
        onClose={() => { setShowApoliceForm(false); setEditingApolice(null); }}
        onSave={handleSaveApolice}
        apolice={editingApolice}
      />
    </div>
  );
};
