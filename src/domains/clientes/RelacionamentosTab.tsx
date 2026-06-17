import React, { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, writeBatch, doc, getDocs,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Plus, Trash2, MessageCircle, ExternalLink, Search, X, Loader2, Users,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Cliente, ClienteRelacionamento } from '../../types';
import { useNavigate } from 'react-router-dom';

const TIPOS_RELACIONAMENTO = [
  'Pai', 'Mãe', 'Esposo', 'Esposa', 'Filho', 'Filha',
  'Avô', 'Avó', 'Neto', 'Neta', 'Irmão', 'Irmã',
  'Sogro', 'Sogra', 'Genro', 'Nora', 'Tio', 'Tia',
  'Sobrinho', 'Sobrinha', 'Primo', 'Prima',
  'Padrasto', 'Madrasta', 'Enteado', 'Enteada',
  'Cunhado', 'Cunhada', 'Outro',
];

// What is A to B, given that B chose `tipo` as their relationship type, and A's gender is genderA
function getInverseRelationship(tipo: string, genderA?: 'M' | 'F'): string {
  const map: Record<string, [string, string, string]> = {
    'Pai':      ['Filho',     'Filha',    'Filho(a)'],
    'Mãe':      ['Filho',     'Filha',    'Filho(a)'],
    'Filho':    ['Pai',       'Mãe',      'Pai/Mãe'],
    'Filha':    ['Pai',       'Mãe',      'Pai/Mãe'],
    'Esposo':   ['Esposo',    'Esposa',   'Cônjuge'],
    'Esposa':   ['Esposo',    'Esposa',   'Cônjuge'],
    'Avô':      ['Neto',      'Neta',     'Neto(a)'],
    'Avó':      ['Neto',      'Neta',     'Neto(a)'],
    'Neto':     ['Avô',       'Avó',      'Avô/Avó'],
    'Neta':     ['Avô',       'Avó',      'Avô/Avó'],
    'Irmão':    ['Irmão',     'Irmã',     'Irmão(ã)'],
    'Irmã':     ['Irmão',     'Irmã',     'Irmão(ã)'],
    'Sogro':    ['Genro',     'Nora',     'Genro/Nora'],
    'Sogra':    ['Genro',     'Nora',     'Genro/Nora'],
    'Genro':    ['Sogro',     'Sogra',    'Sogro(a)'],
    'Nora':     ['Sogro',     'Sogra',    'Sogro(a)'],
    'Tio':      ['Sobrinho',  'Sobrinha', 'Sobrinho(a)'],
    'Tia':      ['Sobrinho',  'Sobrinha', 'Sobrinho(a)'],
    'Sobrinho': ['Tio',       'Tia',      'Tio/Tia'],
    'Sobrinha': ['Tio',       'Tia',      'Tio/Tia'],
    'Primo':    ['Primo',     'Prima',    'Primo(a)'],
    'Prima':    ['Primo',     'Prima',    'Primo(a)'],
    'Padrasto': ['Enteado',   'Enteada',  'Enteado(a)'],
    'Madrasta': ['Enteado',   'Enteada',  'Enteado(a)'],
    'Enteado':  ['Padrasto',  'Madrasta', 'Padrasto/Madrasta'],
    'Enteada':  ['Padrasto',  'Madrasta', 'Padrasto/Madrasta'],
    'Cunhado':  ['Cunhado',   'Cunhada',  'Cunhado(a)'],
    'Cunhada':  ['Cunhado',   'Cunhada',  'Cunhado(a)'],
    'Outro':    ['Outro',     'Outro',    'Outro'],
  };
  const e = map[tipo];
  if (!e) return 'Outro';
  if (genderA === 'M') return e[0];
  if (genderA === 'F') return e[1];
  return e[2];
}

function fmtCPFMasked(cpf: string) {
  const n = (cpf ?? '').replace(/\D/g, '');
  if (n.length < 11) return cpf || '—';
  return `${n.slice(0, 3)}.***.*${n.slice(8, 9)}-${n.slice(9, 11)}`;
}

function fmtPhone(phone?: string) {
  const n = (phone ?? '').replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return phone ?? '';
}

// ─── Add Relationship Modal ────────────────────────────────────────────────────

interface AddModalProps {
  cliente: Cliente;
  organizationId: string;
  clientes: Cliente[];
  existingRelIds: string[];
  onClose: () => void;
}

const AddRelacionamentoModal: React.FC<AddModalProps> = ({
  cliente, organizationId, clientes, existingRelIds, onClose,
}) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Cliente | null>(null);
  const [tipo, setTipo] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = search.trim().length < 2 ? [] : clientes
    .filter(c => c.id !== cliente.id && !existingRelIds.includes(c.id))
    .filter(c => {
      const q = search.toLowerCase();
      const digits = search.replace(/\D/g, '');
      return (
        c.nome.toLowerCase().includes(q) ||
        (digits && (c.cpf ?? '').includes(digits)) ||
        (digits && (c.telefone ?? '').includes(digits)) ||
        (digits && (c.whatsapp ?? '').includes(digits))
      );
    })
    .slice(0, 10);

  const handleSave = async () => {
    if (!selected || !tipo) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const inverseType = getInverseRelationship(tipo, cliente.sexo);
      const batch = writeBatch(db);

      const refA = doc(collection(db, 'cliente_relacionamentos'));
      batch.set(refA, {
        clienteId: cliente.id,
        relatedClienteId: selected.id,
        relatedClienteNome: selected.nome,
        relatedClienteTelefone: selected.telefone || null,
        relatedClienteWhatsapp: selected.whatsapp || null,
        relatedClienteCPF: selected.cpf || null,
        tipoRelacionamento: tipo,
        organizationId,
        createdAt: now,
        updatedAt: now,
      });

      const refB = doc(collection(db, 'cliente_relacionamentos'));
      batch.set(refB, {
        clienteId: selected.id,
        relatedClienteId: cliente.id,
        relatedClienteNome: cliente.nome,
        relatedClienteTelefone: cliente.telefone || null,
        relatedClienteWhatsapp: cliente.whatsapp || null,
        relatedClienteCPF: cliente.cpf || null,
        tipoRelacionamento: inverseType,
        organizationId,
        createdAt: now,
        updatedAt: now,
      });

      await batch.commit();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-brand-black border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <h2 className="text-[11px] font-black text-white uppercase tracking-widest">Adicionar Relacionamento</h2>
          <button onClick={onClose} className="p-1 text-white/30 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {/* Search */}
          {!selected ? (
            <div className="space-y-2">
              <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Buscar cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-brand-dark border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all placeholder:text-white/20"
                  placeholder="Nome, CPF ou telefone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {search.trim().length >= 2 && filtered.length === 0 && (
                <p className="text-[10px] text-white/30 text-center py-3">Nenhum cliente encontrado</p>
              )}
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelected(c); setSearch(''); }}
                  className="w-full flex items-start gap-3 p-3 bg-brand-dark/50 border border-white/5 hover:border-gold-deep/20 rounded-xl transition-all text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-gold-deep/10 border border-gold-deep/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-gold-deep">{c.nome.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white">{c.nome}</p>
                    <p className="text-[9px] text-white/30 font-mono">{fmtCPFMasked(c.cpf)}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Cliente selecionado</label>
              <div className="flex items-center gap-3 p-3 bg-gold-deep/5 border border-gold-deep/20 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-gold-deep/10 border border-gold-deep/20 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-gold-deep">{selected.nome.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white truncate">{selected.nome}</p>
                  <p className="text-[9px] text-white/30 font-mono">{fmtCPFMasked(selected.cpf)}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-1 text-white/30 hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Relationship type */}
          <div className="space-y-1">
            <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">
              Tipo de relacionamento
              <span className="ml-1 text-white/20 normal-case font-medium">(o que {selected?.nome?.split(' ')[0] ?? 'o cliente'} é para {cliente.nome.split(' ')[0]})</span>
            </label>
            <select
              className="w-full px-3 py-2 bg-brand-dark border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all"
              value={tipo}
              onChange={e => setTipo(e.target.value)}
            >
              <option value="">Selecionar...</option>
              {TIPOS_RELACIONAMENTO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Inverse preview */}
          {selected && tipo && (
            <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/5 rounded-xl">
              <span className="text-[9px] text-white/30 flex-1">
                {selected.nome.split(' ')[0]} verá: <span className="text-gold-light font-bold">
                  {cliente.nome.split(' ')[0]} é meu(minha) {getInverseRelationship(tipo, cliente.sexo)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/5 shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/50 hover:bg-white/10 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!selected || !tipo || saving}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
              selected && tipo && !saving
                ? 'bg-gold-deep text-brand-dark hover:bg-gold-light'
                : 'bg-white/5 text-white/20 cursor-not-allowed',
            )}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Tab ─────────────────────────────────────────────────────────────────

interface RelacionamentosTabProps {
  cliente: Cliente;
  organizationId: string;
  clientes: Cliente[];
}

export const RelacionamentosTab: React.FC<RelacionamentosTabProps> = ({
  cliente, organizationId, clientes,
}) => {
  const navigate = useNavigate();
  const [relacionamentos, setRelacionamentos] = useState<ClienteRelacionamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!cliente.id || !organizationId) return;
    const q = query(
      collection(db, 'cliente_relacionamentos'),
      where('clienteId', '==', cliente.id),
      where('organizationId', '==', organizationId),
    );
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClienteRelacionamento));
      docs.sort((a, b) => a.relatedClienteNome.localeCompare(b.relatedClienteNome, 'pt-BR'));
      setRelacionamentos(docs);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [cliente.id, organizationId]);

  const handleDelete = async (rel: ClienteRelacionamento) => {
    if (!window.confirm(`Remover relacionamento com ${rel.relatedClienteNome}?`)) return;
    setDeleting(rel.id);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'cliente_relacionamentos', rel.id));
      // Find and delete the inverse document
      const inverseQ = query(
        collection(db, 'cliente_relacionamentos'),
        where('clienteId', '==', rel.relatedClienteId),
        where('relatedClienteId', '==', cliente.id),
      );
      const inverseSnap = await getDocs(inverseQ);
      inverseSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } finally {
      setDeleting(null);
    }
  };

  const existingRelIds = relacionamentos.map(r => r.relatedClienteId);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3">
          <Users className="w-3.5 h-3.5 text-gold-deep" />
          <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Relacionamentos Familiares</span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-deep/10 border border-gold-deep/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-gold-light hover:bg-gold-deep/20 transition-colors"
        >
          <Plus className="w-3 h-3" /> Adicionar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 text-gold-deep animate-spin" />
        </div>
      ) : relacionamentos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Users className="w-10 h-10 text-white/10" />
          <p className="text-[11px] text-white/30">Nenhum relacionamento cadastrado</p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gold-deep/10 border border-gold-deep/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-gold-light hover:bg-gold-deep/20 transition-colors mt-1"
          >
            <Plus className="w-3 h-3" /> Adicionar relacionamento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {relacionamentos.map(rel => {
            const waNumber = (rel.relatedClienteWhatsapp || rel.relatedClienteTelefone || '').replace(/\D/g, '');
            return (
              <div key={rel.id} className="bg-brand-black/50 border border-white/5 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="inline-flex px-2 py-0.5 bg-gold-deep/10 border border-gold-deep/20 rounded text-[8px] font-black uppercase tracking-widest text-gold-light">
                      {rel.tipoRelacionamento}
                    </span>
                    <p className="text-[12px] font-bold text-white mt-1.5">{rel.relatedClienteNome}</p>
                    {rel.relatedClienteCPF && (
                      <p className="text-[9px] font-mono text-white/30 mt-0.5">{fmtCPFMasked(rel.relatedClienteCPF)}</p>
                    )}
                    {(rel.relatedClienteWhatsapp || rel.relatedClienteTelefone) && (
                      <p className="text-[9px] text-white/40 mt-0.5">
                        {fmtPhone(rel.relatedClienteWhatsapp || rel.relatedClienteTelefone)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(rel)}
                    disabled={deleting === rel.id}
                    className="p-1 text-white/20 hover:text-red-400 transition-colors shrink-0"
                  >
                    {deleting === rel.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                  {waNumber && (
                    <a
                      href={`https://wa.me/55${waNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => navigate(`/clientes/${rel.relatedClienteId}`)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Abrir Cadastro
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <AddRelacionamentoModal
          cliente={cliente}
          organizationId={organizationId}
          clientes={clientes}
          existingRelIds={existingRelIds}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
