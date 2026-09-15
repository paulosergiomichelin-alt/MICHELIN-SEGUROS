import React, { useState, useMemo } from 'react';
import {
  Plus, Search, ChevronRight, Users, Filter, X,
  Phone, Mail, MapPin, RefreshCw, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Cliente, ClienteStatus, ProdutoSeguro, PRODUTOS_SEGURO } from '../../types';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { SEGURADORAS } from '../../lib/seguradoras';
import { Button, EmptyState } from '../../components/ui';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientesViewProps {
  clientes: Cliente[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onEdit: (c: Cliente) => void;
}

const STATUS_CONFIG: Record<ClienteStatus, { label: string; cls: string; icon: React.ElementType }> = {
  ativo:              { label: 'Ativo',              cls: 'bg-[#E4F5EA] text-[#1F8A4C] border-[#1F8A4C]/20', icon: CheckCircle2 },
  renovacao_proxima:  { label: 'Renovação Próxima',  cls: 'bg-[#FFF3DC] text-[#B8860B] border-[#B8860B]/20', icon: Clock },
  renovacao_vencida:  { label: 'Renovação Vencida',  cls: 'bg-[#FDE4E4] text-[#C0392B] border-[#C0392B]/20', icon: AlertTriangle },
  inativo:            { label: 'Inativo',             cls: 'bg-slate-100 text-slate-400 border-slate-200',    icon: X },
};

function StatusBadge({ status }: { status: ClienteStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.inativo;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider', cfg.cls)}>
      <Icon className="w-2.5 h-2.5" />{cfg.label}
    </span>
  );
}

function RenovacaoTag({ dataRenovacao }: { dataRenovacao?: string }) {
  if (!dataRenovacao) return null;
  const days = differenceInDays(parseISO(dataRenovacao), new Date());
  const color = days < 0 ? 'text-[#C0392B]' : days <= 7 ? 'text-[#C0392B]' : days <= 30 ? 'text-[#B8860B]' : 'text-slate-400';
  const label = days < 0 ? `Venceu há ${Math.abs(days)}d` : days === 0 ? 'Hoje' : `${days}d`;
  try {
    const dateLabel = format(parseISO(dataRenovacao), 'dd/MM/yyyy', { locale: ptBR });
    return <span className={cn('text-[10px] font-semibold', color)}>{dateLabel} <span className="text-[9px] opacity-70">({label})</span></span>;
  } catch {
    return null;
  }
}

function formatPhone(phone: string) {
  const n = phone.replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return phone;
}

export const ClientesView: React.FC<ClientesViewProps> = ({
  clientes, loading, hasMore, onLoadMore, onNew, onSelect, onEdit,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ClienteStatus | ''>('');
  const [filterSeguradora, setFilterSeguradora] = useState('');
  const [filterProduto, setFilterProduto] = useState<ProdutoSeguro | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clientes.filter(c => {
      if (q && !c.nome.toLowerCase().includes(q) && !(c.cpf ?? '').includes(q.replace(/\D/g,'')) && !(c.telefone || '').includes(q.replace(/\D/g,''))) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterSeguradora && c.seguradoraAtualId !== filterSeguradora) return false;
      if (filterProduto && c.produtoAtual !== filterProduto) return false;
      return true;
    });
  }, [clientes, search, filterStatus, filterSeguradora, filterProduto]);

  const activeFilters = [filterStatus, filterSeguradora, filterProduto].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 px-4 md:px-6 py-4 bg-white">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center">
              <Users className="w-4 h-4 text-gold-deep" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-widest">Clientes</h1>
              <p className="text-[10px] text-slate-500 font-medium">{filtered.length} de {clientes.length} clientes</p>
            </div>
          </div>
          <Button variant="primary" icon={Plus} onClick={onNew}>
            Novo Cliente
          </Button>
        </div>

        {/* Search + filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF ou telefone..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] text-slate-800 placeholder:text-slate-300 font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all',
              showFilters || activeFilters > 0
                ? 'bg-gold-deep/10 border-gold-deep/30 text-gold-deep'
                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            {activeFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gold-deep text-white rounded-full text-[8px] font-black flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as ClienteStatus | '')}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-800 font-medium"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select
              value={filterSeguradora}
              onChange={e => setFilterSeguradora(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-800 font-medium"
            >
              <option value="">Todas as seguradoras</option>
              {SEGURADORAS.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <select
              value={filterProduto}
              onChange={e => setFilterProduto(e.target.value as ProdutoSeguro | '')}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-800 font-medium"
            >
              <option value="">Todos os produtos</option>
              {PRODUTOS_SEGURO.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && clientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-6 h-6 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
            <p className="text-[11px] text-slate-400">Carregando clientes...</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            action={!search && (
              <button onClick={onNew} className="text-[10px] text-[#1B4D8F] font-black uppercase tracking-widest hover:text-[#153E73] transition-colors">
                + Criar primeiro cliente
              </button>
            )}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white/95 backdrop-blur border-b border-slate-200">
                    {['Cliente', 'Contato', 'Localidade', 'Seguradora', 'Produto', 'Renovação', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => onSelect(c.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <p className="text-[11px] font-bold text-slate-800">{c.nome}</p>
                        <p className="text-[9px] text-slate-400 font-mono">{c.tipoPessoa === 'juridica' ? 'Pessoa Jurídica' : (c.cpf ?? '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[10px] text-slate-600">{formatPhone(c.telefone)}</p>
                        {c.email && <p className="text-[9px] text-slate-400 truncate max-w-[150px]">{c.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {(c.cidade || c.estado) ? (
                          <span className="text-[10px] text-slate-500">{[c.cidade, c.estado].filter(Boolean).join(' / ')}</span>
                        ) : <span className="text-[10px] text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.seguradoraAtualId
                          ? <SeguradoraBadge seguradoraId={c.seguradoraAtualId} size="xs" />
                          : <span className="text-[10px] text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-slate-600">{c.produtoAtual ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <RenovacaoTag dataRenovacao={c.dataRenovacao} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#1B4D8F] transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className="p-4 flex items-start gap-3 active:bg-slate-50 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-gold-deep/10 border border-gold-deep/20 flex items-center justify-center shrink-0 text-gold-deep font-black text-sm">
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] font-bold text-slate-800">{c.nome}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{c.tipoPessoa === 'juridica' ? 'Pessoa Jurídica' : (c.cpf ?? '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {c.telefone && <span className="flex items-center gap-1 text-[9px] text-slate-500"><Phone className="w-2.5 h-2.5" />{formatPhone(c.telefone)}</span>}
                      {(c.cidade || c.estado) && <span className="flex items-center gap-1 text-[9px] text-slate-400"><MapPin className="w-2.5 h-2.5" />{[c.cidade, c.estado].filter(Boolean).join('/')}</span>}
                    </div>
                    {(c.seguradoraAtualId || c.produtoAtual) && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {c.seguradoraAtualId && <SeguradoraBadge seguradoraId={c.seguradoraAtualId} size="xs" />}
                        {c.produtoAtual && <span className="text-[9px] text-slate-400">{c.produtoAtual}</span>}
                      </div>
                    )}
                    {c.dataRenovacao && <div className="mt-1"><RenovacaoTag dataRenovacao={c.dataRenovacao} /></div>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="p-4 flex justify-center">
                <button
                  onClick={onLoadMore}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-all disabled:opacity-40"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Carregar mais'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
