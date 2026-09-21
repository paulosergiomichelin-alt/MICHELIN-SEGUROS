import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Plus, Trash2, CheckCircle2, AlertTriangle, Clock,
  User, Phone, Mail, MapPin, FileText, History, RefreshCw, ExternalLink,
  Calendar, DollarSign, Building2, ClipboardList, Car, Shield, Tag, Users,
} from 'lucide-react';
import { cn, formatCNPJ } from '../../lib/utils';
import { Cliente, Lead, Apolice, ApoliceVeiculo, ClienteHistoricoItem, ClienteStatus, UserProfile } from '../../types';
import { DataService } from '../../services/DataService';
import { ClienteService } from '../../services/ClienteService';
import { dataApiClient } from '../../lib/dataApiClient';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { ClienteForm } from './ClienteForm';
import { ApoliceForm } from './ApoliceForm';
import { RelacionamentosTab } from './RelacionamentosTab';
import { Button, Card } from '../../components/ui';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useClientes } from '../../contexts/ClienteRealtimeContext';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Tab = 'resumo' | 'cadastro' | 'apolices' | 'renovacoes' | 'historico' | 'relacionamentos';

const STATUS_CONFIG: Record<ClienteStatus, { label: string; cls: string; icon: React.ElementType }> = {
  ativo:             { label: 'Ativo',             cls: 'bg-[#E4F5EA] text-[#1F8A4C] border-[#1F8A4C]/20', icon: CheckCircle2 },
  renovacao_proxima: { label: 'Renovação Próxima', cls: 'bg-[#FFF3DC] text-[#B8860B] border-[#B8860B]/20', icon: Clock },
  renovacao_vencida: { label: 'Renovação Vencida', cls: 'bg-[#FDE4E4] text-[#C0392B] border-[#C0392B]/20', icon: AlertTriangle },
  inativo:           { label: 'Inativo',            cls: 'bg-slate-100 text-slate-400 border-slate-200',    icon: Clock },
};

const APOLICE_STATUS_COLOR: Record<string, string> = {
  ativo:        'text-[#1F8A4C]',
  em_renovacao: 'text-[#B8860B]',
  expirado:     'text-[#C0392B]',
  cancelado:    'text-slate-400',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); } catch { return iso; }
}

function fmtMoney(cents?: number) {
  if (!cents) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCPF(cpf?: string) {
  const n = (cpf ?? '').replace(/\D/g, '');
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function fmtPhone(phone: string) {
  const n = (phone ?? '').replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return phone;
}

function calcularIdade(dataNascimento?: string): number | null {
  if (!dataNascimento) return null;
  try {
    const nasc = parseISO(dataNascimento);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const aniversarioEsteAno = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
    if (hoje < aniversarioEsteAno) idade--;
    return idade;
  } catch { return null; }
}

// Diferença em meses/dias de calendário entre duas datas (assume `de` <= `para`) —
// não é uma divisão simples de dias totais por 30, respeita o tamanho real dos meses.
function diferencaMesesDias(de: Date, para: Date): { meses: number; dias: number } {
  let meses = (para.getFullYear() - de.getFullYear()) * 12 + (para.getMonth() - de.getMonth());
  let dias = para.getDate() - de.getDate();
  if (dias < 0) {
    meses -= 1;
    dias += new Date(para.getFullYear(), para.getMonth(), 0).getDate();
  }
  return { meses: Math.max(0, meses), dias: Math.max(0, dias) };
}

function fmtMesesDias(meses: number, dias: number): string {
  const partes: string[] = [];
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`);
  return partes.length > 0 ? partes.join(' e ') : 'Hoje';
}

// "X meses e Y dias" até o próximo aniversário.
function tempoParaAniversario(dataNascimento?: string): string | null {
  if (!dataNascimento) return null;
  try {
    const nasc = parseISO(dataNascimento);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let proximo = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
    if (proximo.getTime() < hoje.getTime()) proximo = new Date(hoje.getFullYear() + 1, nasc.getMonth(), nasc.getDate());
    if (proximo.getTime() === hoje.getTime()) return 'Hoje! 🎉';
    const { meses, dias } = diferencaMesesDias(hoje, proximo);
    return meses === 0 && dias === 0 ? 'Hoje! 🎉' : fmtMesesDias(meses, dias);
  } catch { return null; }
}

function diasParaVencer(dataISO?: string): number | null {
  if (!dataISO) return null;
  try { return differenceInDays(parseISO(dataISO), new Date()); } catch { return null; }
}

// "Faltam X meses e Y dias" / "Vencida há X meses e Y dias" — mesmo formato de
// calendário usado no aniversário, em vez de só a contagem de dias corridos.
function fmtDiasVencimento(dataISO?: string): string {
  if (!dataISO) return '';
  const dias = diasParaVencer(dataISO);
  if (dias === null) return '';
  if (dias === 0) return 'Vence hoje';
  try {
    const alvo = parseISO(dataISO);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (dias > 0) {
      const { meses, dias: d } = diferencaMesesDias(hoje, alvo);
      return `Faltam ${fmtMesesDias(meses, d)}`;
    }
    const { meses, dias: d } = diferencaMesesDias(alvo, hoje);
    return `Vencida há ${fmtMesesDias(meses, d)}`;
  } catch { return ''; }
}

// "ABC1D23 - Marca - Modelo - AnoModelo/AnoFabricação", omitindo partes ausentes.
function fmtVeiculoResumo(v?: ApoliceVeiculo): string {
  if (!v) return '';
  const parts = [v.placa, v.marca, v.modelo].filter(Boolean) as string[];
  const anos = [v.anoModelo, v.anoFabricacao].filter(Boolean).join('/');
  if (anos) parts.push(anos);
  return parts.join(' - ');
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
  const { clientes: allClientes } = useClientes();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clientePJ, setClientePJ] = useState<any>(null);
  const [leadOrigem, setLeadOrigem] = useState<Lead | null>(null);
  const [apolices, setApolices] = useState<Apolice[]>([]);
  const [historico, setHistorico] = useState<ClienteHistoricoItem[]>([]);
  const [loadingCliente, setLoadingCliente] = useState(true);
  const [tab, setTab] = useState<Tab>('resumo');
  const [showEditCliente, setShowEditCliente] = useState(false);
  const [deletingCliente, setDeletingCliente] = useState(false);
  const [showApoliceForm, setShowApoliceForm] = useState(false);
  const [editingApolice, setEditingApolice] = useState<Apolice | null>(null);
  const [viewingApoliceOnly, setViewingApoliceOnly] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'gestor';

  useEffect(() => {
    const unsub = DataService.subscribeCollection('users', [], (data: any[]) => {
      setUsers(
        data.filter((u: UserProfile) =>
          u.organizationId === userProfile?.organizationId && u.userType === 'HUMAN',
        ),
      );
    });
    return unsub;
  }, [userProfile?.organizationId]);

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

  // Load satellite PJ row when cliente is pessoa jurídica
  useEffect(() => {
    if (cliente?.tipoPessoa === 'juridica') {
      dataApiClient.get('cliente_pessoa_juridica', cliente.id).then(setClientePJ).catch(() => setClientePJ(null));
    } else {
      setClientePJ(null);
    }
  }, [cliente?.id, cliente?.tipoPessoa]);

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

  const handleDeleteCliente = async () => {
    if (!id) return;
    if (!window.confirm(`Excluir o cliente "${cliente?.nome}"? Esta ação também remove apólices, histórico e vínculos familiares dele, e não pode ser desfeita.`)) return;
    setDeletingCliente(true);
    try {
      await DataService.delete('cliente', id);
      navigate('/clientes');
    } catch (err: any) {
      window.alert(`Não foi possível excluir o cliente: ${err.message}`);
      setDeletingCliente(false);
    }
  };

  if (loadingCliente) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="w-6 h-6 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-slate-50">
        <AlertTriangle className="w-10 h-10 text-slate-300" />
        <p className="text-slate-500 text-sm">Cliente não encontrado</p>
        <button onClick={() => navigate('/clientes')} className="text-[#1B4D8F] text-sm font-bold hover:text-[#153E73] transition-colors">← Voltar</button>
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
    { id: 'resumo',          label: 'Resumo',          icon: User },
    { id: 'cadastro',        label: 'Cadastro',        icon: ClipboardList },
    { id: 'apolices',        label: `Apólices (${apolices.length})`,       icon: FileText },
    { id: 'renovacoes',      label: `Renovações (${upcomingRenov.length})`, icon: RefreshCw },
    { id: 'relacionamentos', label: 'Família',          icon: Users },
    { id: 'historico',       label: 'Histórico',       icon: History },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 md:px-6 py-3.5 flex items-center gap-3">
        <button onClick={() => navigate('/clientes')} className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-sm font-black text-slate-900">
              {cliente.tipoPessoa === 'juridica' ? (clientePJ?.nomeFantasia || clientePJ?.razaoSocial || cliente.nome) : cliente.nome}
            </h1>
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider', statusCfg.cls)}>
              <StatusIcon className="w-2.5 h-2.5" />{statusCfg.label}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
            {cliente.tipoPessoa === 'juridica' ? (clientePJ ? formatCNPJ(clientePJ.cnpj) : '') : fmtCPF(cliente.cpf)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cliente.leadOrigemId && (
            <button
              onClick={() => navigate('/leads/' + cliente.leadOrigemId)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Ver Lead
            </button>
          )}
          <button
            onClick={() => setShowEditCliente(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gold-deep/10 border border-gold-deep/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-gold-deep hover:bg-gold-deep/20 transition-colors"
          >
            <Edit2 className="w-3 h-3" /> Editar
          </button>
          <button
            onClick={handleDeleteCliente}
            disabled={deletingCliente}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#FDE4E4] border border-[#C0392B]/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#C0392B] hover:bg-[#C0392B]/15 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" /> {deletingCliente ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      {!showEditCliente && <div className="shrink-0 border-b border-slate-200 px-4 md:px-6 flex gap-0 overflow-x-auto bg-white">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap',
                tab === t.id ? 'border-[#1B4D8F] text-[#1B4D8F]' : 'border-transparent text-slate-400 hover:text-slate-700',
              )}
            >
              <Icon className="w-3 h-3" />{t.label}
            </button>
          );
        })}
      </div>}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
        {showEditCliente && (
          <ClienteForm
            isOpen={true}
            inline={true}
            onClose={() => setShowEditCliente(false)}
            onSave={handleSaveCliente}
            cliente={cliente}
            users={users}
            currentUser={userProfile}
            isAdmin={isAdmin}
          />
        )}
        {!showEditCliente && <>

        {/* RESUMO */}
        {tab === 'resumo' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Dados pessoais */}
            <Card title="Dados Pessoais" icon={User} className="space-y-3">
              {(cliente.tipoPessoa === 'juridica' ? [
                ['Razão Social', clientePJ?.razaoSocial],
                ['Nome Fantasia', clientePJ?.nomeFantasia],
                ['CNPJ', clientePJ ? formatCNPJ(clientePJ.cnpj) : ''],
                ['Inscrição Estadual', clientePJ?.inscricaoEstadual],
                ['Situação Cadastral', clientePJ?.situacaoCadastral],
                ['Porte', clientePJ?.porte],
                ['CNAE', clientePJ?.cnae],
                ['Contato responsável', clientePJ?.nomeContato ?? cliente.nome],
              ] : [
                ['Nome', cliente.nome],
                ['CPF', fmtCPF(cliente.cpf)],
                ['RG', cliente.rg],
                ['Nascimento', fmtDate(cliente.dataNascimento)],
                ['Idade', calcularIdade(cliente.dataNascimento) != null ? `${calcularIdade(cliente.dataNascimento)} anos` : undefined],
                ['Aniversário em', tempoParaAniversario(cliente.dataNascimento)],
                ['Estado civil', cliente.estadoCivil],
                ['Profissão', cliente.profissao],
              ]).map(([k,v]) => v ? (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">{k}</span>
                  <span className="text-[10px] text-slate-700 font-medium text-right">{v}</span>
                </div>
              ) : null)}
            </Card>

            {/* Contato */}
            <Card title="Contato" icon={Phone} className="space-y-3">
              {[
                ['Telefone', cliente.telefone ? fmtPhone(cliente.telefone) : undefined],
                ['WhatsApp', cliente.whatsapp ? fmtPhone(cliente.whatsapp) : undefined],
                ['E-mail', cliente.email],
                ['Cidade', [cliente.cidade, cliente.estado].filter(Boolean).join(' / ')],
                ['CEP', cliente.cep],
                ['Endereço', [cliente.rua, cliente.numero, cliente.complemento, cliente.bairro].filter(Boolean).join(', ')],
              ].map(([k,v]) => v ? (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">{k}</span>
                  <span className="text-[10px] text-slate-700 font-medium text-right max-w-[200px]">{v}</span>
                </div>
              ) : null)}
            </Card>

            {/* Contatos adicionais — financeiro, proprietário, responsável pela contratação etc. */}
            {cliente.contatosAdicionais && cliente.contatosAdicionais.length > 0 && (
              <Card title="Contatos Adicionais" icon={Users} className="md:col-span-2 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {cliente.contatosAdicionais.map(c => (
                    <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-bold text-slate-800">{c.nome}</span>
                        {c.observacao && (
                          <span className="shrink-0 px-2 py-0.5 bg-gold-deep/10 text-gold-deep text-[8.5px] font-black uppercase tracking-wider rounded-full">
                            {c.observacao}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {c.telefone && <p className="text-[10px] text-slate-500">{fmtPhone(c.telefone)}</p>}
                        {c.whatsapp && <p className="text-[10px] text-slate-500">WhatsApp: {fmtPhone(c.whatsapp)}</p>}
                        {c.email && <p className="text-[10px] text-slate-500">{c.email}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Seguro atual */}
            {apoliceAtiva && (
              <Card
                title="Apólice Ativa"
                icon={FileText}
                className="md:col-span-2 border-gold-deep/20"
                onClick={() => { setEditingApolice(apoliceAtiva); setViewingApoliceOnly(true); setShowApoliceForm(true); setTab('apolices'); }}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Produto</p>
                    <p className="text-[11px] text-slate-800 font-bold">{apoliceAtiva.produto}</p>
                    {fmtVeiculoResumo(apoliceAtiva.veiculo) && (
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        {fmtVeiculoResumo(apoliceAtiva.veiculo)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Seguradora</p>
                    <SeguradoraBadge seguradoraId={apoliceAtiva.seguradoraId} size="xs" />
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Renovação</p>
                    <p className="text-[11px] text-[#B8860B] font-bold">{fmtDate(apoliceAtiva.dataRenovacao)}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{fmtDiasVencimento(apoliceAtiva.dataRenovacao)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Prêmio</p>
                    <p className="text-[11px] text-slate-800 font-bold">{fmtMoney(apoliceAtiva.valorTotal)}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Observações */}
            {cliente.observacoes && (
              <Card className="md:col-span-2">
                <p className="text-[9px] text-slate-400 uppercase font-black mb-2">Observações</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">{cliente.observacoes}</p>
              </Card>
            )}
          </div>
        )}

        {/* CADASTRO */}
        {tab === 'cadastro' && (
          <div className="space-y-4">
            {!cliente.leadOrigemId ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center gap-3 text-center shadow-sm">
                <ClipboardList className="w-10 h-10 text-slate-200" />
                <p className="text-slate-500 text-sm">Cliente cadastrado manualmente — sem ficha de lead</p>
              </div>
            ) : !leadOrigem ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Ficha do lead original</p>
                  <button
                    onClick={() => navigate('/leads/' + leadOrigem.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all"
                  >
                    <ExternalLink className="w-3 h-3" /> Abrir Lead
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Identificação */}
                  <Card title="Identificação" icon={User} className="space-y-2.5">
                    {[
                      ['Nome', leadOrigem.name],
                      ['CPF', fmtCPF(leadOrigem.cpf)],
                      ['RG', leadOrigem.rg],
                      ['Nascimento', leadOrigem.birthDate ? fmtDate(leadOrigem.birthDate) : undefined],
                      ['Estado Civil', leadOrigem.civilStatus || leadOrigem.maritalStatus],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-slate-700 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </Card>

                  {/* Contato */}
                  <Card title="Contato" icon={Phone} className="space-y-2.5">
                    {[
                      ['Telefone', leadOrigem.phone ? fmtPhone(leadOrigem.phone) : undefined],
                      ['Telefone 2', leadOrigem.phone2 ? fmtPhone(leadOrigem.phone2) : undefined],
                      ['E-mail', leadOrigem.email],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-slate-700 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </Card>

                  {/* Veículo */}
                  {(leadOrigem.plate || leadOrigem.chassis || leadOrigem.chassi) && (
                    <Card title="Veículo" icon={Car} className="space-y-2.5">
                      {[
                        ['Placa', leadOrigem.plate],
                        ['Chassi', leadOrigem.chassis || leadOrigem.chassi],
                        ['RENAVAM', leadOrigem.renavam],
                        ['Marca / Modelo', leadOrigem.brandModel],
                      ].map(([k, v]) => v ? (
                        <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0">{k}</span>
                          <span className="text-[10px] text-slate-700 font-medium text-right font-mono">{v}</span>
                        </div>
                      ) : null)}
                    </Card>
                  )}

                  {/* Perfil / Seguro */}
                  <Card title="Perfil e Seguro" icon={Shield} className="space-y-2.5">
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
                      <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0 max-w-[55%]">{k}</span>
                        <span className="text-[10px] text-slate-700 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </Card>

                  {/* Endereço Pernoite */}
                  <Card title="End. Pernoite" icon={MapPin} className="space-y-2.5">
                    {[
                      ['CEP', leadOrigem.zipCodeOvernight || leadOrigem.cepPernoite],
                      ['Logradouro', leadOrigem.addressOvernight || leadOrigem.logradouroPernoite],
                      ['Número', leadOrigem.numberOvernight || leadOrigem.numeroPernoite],
                      ['Bairro', leadOrigem.bairroPernoite],
                      ['Cidade', leadOrigem.cidadePernoite || leadOrigem.city],
                      ['Estado', leadOrigem.estadoPernoite],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-slate-700 font-medium text-right">{v}</span>
                      </div>
                    ) : null)}
                  </Card>

                  {/* Endereço Residência (se diferente) */}
                  {leadOrigem.isDifferentResidenceZip && (leadOrigem.zipCodeResidence || leadOrigem.addressResidence) && (
                    <Card title="End. Residencial" icon={MapPin} className="space-y-2.5">
                      {[
                        ['CEP', leadOrigem.zipCodeResidence],
                        ['Logradouro', leadOrigem.addressResidence],
                        ['Número', leadOrigem.numberResidence],
                      ].map(([k, v]) => v ? (
                        <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0">{k}</span>
                          <span className="text-[10px] text-slate-700 font-medium text-right">{v}</span>
                        </div>
                      ) : null)}
                    </Card>
                  )}

                  {/* Proprietário (se diferente do condutor) */}
                  {(leadOrigem.ownerName || leadOrigem.nomeProprietario || leadOrigem.ownerCpfCnpj) && (
                    <Card title="Proprietário do Veículo" icon={User} className="space-y-2.5">
                      {[
                        ['Nome', leadOrigem.ownerName || leadOrigem.nomeProprietario],
                        ['CPF / CNPJ', leadOrigem.ownerCpfCnpj || leadOrigem.cpfProprietario],
                        ['Instituição financeira', leadOrigem.financialInstitution],
                      ].map(([k, v]) => v ? (
                        <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0">{k}</span>
                          <span className="text-[10px] text-slate-700 font-medium text-right">{v}</span>
                        </div>
                      ) : null)}
                    </Card>
                  )}

                  {/* Origem */}
                  <Card title="Origem" icon={Tag} className="space-y-2.5">
                    {[
                      ['Canal', leadOrigem.origin],
                      ['Detalhes', leadOrigem.originDetails],
                      ['Status no CRM', leadOrigem.status],
                      ['Temperatura', leadOrigem.temperature],
                      ['Criado em', fmtDate(leadOrigem.createdAt)],
                    ].map(([k, v]) => v ? (
                      <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black shrink-0">{k}</span>
                        <span className="text-[10px] text-slate-700 font-medium text-right capitalize">{v}</span>
                      </div>
                    ) : null)}
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* APÓLICES */}
        {tab === 'apolices' && (
          <div className="space-y-4">
            {showApoliceForm ? (
              <ApoliceForm
                isOpen={true}
                inline={true}
                onClose={() => { setShowApoliceForm(false); setEditingApolice(null); setViewingApoliceOnly(false); }}
                onSave={handleSaveApolice}
                apolice={editingApolice}
                initialReadOnly={viewingApoliceOnly}
              />
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <h2 className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Histórico de Apólices</h2>
                  <Button variant="primary" icon={Plus} onClick={() => { setEditingApolice(null); setViewingApoliceOnly(false); setShowApoliceForm(true); }}>
                    Nova Apólice
                  </Button>
                </div>

                {apolices.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <FileText className="w-10 h-10 text-slate-200" />
                    <p className="text-slate-500 text-sm">Nenhuma apólice cadastrada</p>
                    <button onClick={() => { setViewingApoliceOnly(false); setShowApoliceForm(true); }} className="text-[#1B4D8F] text-[10px] font-black uppercase hover:text-[#153E73] transition-colors">
                      + Adicionar primeira apólice
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {apolices.map(a => (
                      <div
                        key={a.id}
                        onClick={() => { setEditingApolice(a); setViewingApoliceOnly(true); setShowApoliceForm(true); }}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-gold-deep/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Produto</p>
                              <p className="text-[11px] text-slate-800 font-bold">{a.produto}</p>
                              {a.numeroApolice && <p className="text-[9px] text-slate-400 font-mono mt-0.5">#{a.numeroApolice}</p>}
                              {fmtVeiculoResumo(a.veiculo) && (
                                <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                  {fmtVeiculoResumo(a.veiculo)}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Seguradora</p>
                              <SeguradoraBadge seguradoraId={a.seguradoraId} size="xs" />
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Vigência</p>
                              <p className="text-[10px] text-slate-600">{fmtDate(a.inicioVigencia)} → {fmtDate(a.fimVigencia)}</p>
                              <p className="text-[9px] text-[#B8860B] mt-0.5">Renov: {fmtDate(a.dataRenovacao)} · {fmtDiasVencimento(a.dataRenovacao)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-400 uppercase font-black mb-1">Valor total</p>
                              <p className="text-[11px] text-slate-800 font-bold">{fmtMoney(a.valorTotal)}</p>
                              <p className={cn('text-[9px] font-black uppercase mt-0.5', APOLICE_STATUS_COLOR[a.status])}>{a.status.replace('_',' ')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); setEditingApolice(a); setViewingApoliceOnly(false); setShowApoliceForm(true); }}
                              className="p-1.5 text-slate-300 hover:text-gold-deep transition-colors"
                              title="Editar apólice"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteApolice(a.id); }}
                              className="p-1.5 text-slate-300 hover:text-[#C0392B] transition-colors"
                              title="Excluir apólice"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* RENOVAÇÕES */}
        {tab === 'renovacoes' && (
          <div className="space-y-3">
            <h2 className="text-[11px] font-black text-slate-600 uppercase tracking-widest mb-4">Próximas Renovações</h2>
            {upcomingRenov.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Calendar className="w-10 h-10 text-slate-200" />
                <p className="text-slate-500 text-sm">Nenhuma renovação pendente</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcomingRenov.map(a => {
                  const days = differenceInDays(parseISO(a.dataRenovacao), new Date());
                  const urgencyColor = days <= 7 ? 'border-[#C0392B]/30 bg-[#FDE4E4]/50' : days <= 30 ? 'border-[#B8860B]/30 bg-[#FFF3DC]/50' : 'border-slate-200 bg-white';
                  return (
                    <div key={a.id} className={cn('border rounded-xl p-4 shadow-sm', urgencyColor)}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-bold text-slate-800">{a.produto}</p>
                          <SeguradoraBadge seguradoraId={a.seguradoraId} size="xs" className="mt-1" />
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500">Renovação</p>
                          <p className={cn('text-[13px] font-black', days <= 7 ? 'text-[#C0392B]' : days <= 30 ? 'text-[#B8860B]' : 'text-slate-800')}>
                            {fmtDate(a.dataRenovacao)}
                          </p>
                          <p className="text-[10px] text-slate-400">{days === 0 ? 'Hoje' : `em ${days} dias`}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* RELACIONAMENTOS */}
        {tab === 'relacionamentos' && (
          <RelacionamentosTab
            cliente={cliente}
            organizationId={userProfile?.organizationId ?? ''}
            clientes={allClientes}
          />
        )}

        {/* HISTÓRICO */}
        {tab === 'historico' && (
          <div className="max-w-3xl space-y-0 relative">
            <div className="absolute left-[18px] top-0 bottom-0 w-px bg-slate-200" />
            {historico.length === 0 ? (
              <p className="text-slate-500 text-sm pl-12">Nenhum registro de histórico</p>
            ) : historico.map((item, i) => {
              const Icon = HIST_ICON[item.tipo] ?? CheckCircle2;
              return (
                <div key={item.id} className="relative flex items-start gap-4 pb-5">
                  <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 z-10 shadow-sm">
                    <Icon className="w-3.5 h-3.5 text-gold-deep" />
                  </div>
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 mt-0 shadow-sm">
                    <p className="text-[11px] text-slate-800 font-medium">{item.descricao}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.usuarioNome && <span className="text-[9px] text-slate-400">{item.usuarioNome}</span>}
                      <span className="text-[9px] text-slate-300">{fmtDate(item.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </>}
      </div>
    </div>
  );
};
