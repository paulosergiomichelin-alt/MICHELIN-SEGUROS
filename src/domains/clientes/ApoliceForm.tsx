import React, { useState, useEffect } from 'react';
import { Save, Loader2, FileText } from 'lucide-react';
import { Apolice, ApoliceStatus, ProdutoSeguro, PRODUTOS_SEGURO } from '../../types';
import { SEGURADORAS } from '../../lib/seguradoras';
import { Modal } from '../../components/Modal';
import { cn } from '../../lib/utils';
import { format, addDays, parseISO } from 'date-fns';

interface ApoliceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Apolice, 'id' | 'clienteId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  apolice?: Apolice | null;
}

const inputCls = "w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all placeholder:text-white/20";

const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-0.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

function fmtCurrency(v: string) {
  const n = v.replace(/\D/g, '');
  if (!n) return '';
  return (parseInt(n) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function parseCurrency(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
}

export const ApoliceForm: React.FC<ApoliceFormProps> = ({ isOpen, onClose, onSave, apolice }) => {
  const isEditing = !!apolice;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    produto: '' as ProdutoSeguro | '',
    seguradoraId: '',
    numeroApolice: '',
    inicioVigencia: '',
    fimVigencia: '',
    dataRenovacao: '',
    premioLiquido: '',
    valorTotal: '',
    comissao: '',
    corretoraOrigem: '',
    observacoes: '',
    status: 'ativo' as ApoliceStatus,
  });

  useEffect(() => {
    if (apolice) {
      setForm({
        produto: apolice.produto ?? '',
        seguradoraId: apolice.seguradoraId ?? '',
        numeroApolice: apolice.numeroApolice ?? '',
        inicioVigencia: apolice.inicioVigencia ? apolice.inicioVigencia.slice(0,10) : '',
        fimVigencia: apolice.fimVigencia ? apolice.fimVigencia.slice(0,10) : '',
        dataRenovacao: apolice.dataRenovacao ? apolice.dataRenovacao.slice(0,10) : '',
        premioLiquido: apolice.premioLiquido ? (apolice.premioLiquido / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
        valorTotal: apolice.valorTotal ? (apolice.valorTotal / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
        comissao: apolice.comissao ? (apolice.comissao / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
        corretoraOrigem: apolice.corretoraOrigem ?? '',
        observacoes: apolice.observacoes ?? '',
        status: apolice.status ?? 'ativo',
      });
    } else {
      setForm({
        produto: '', seguradoraId: '', numeroApolice: '',
        inicioVigencia: '', fimVigencia: '', dataRenovacao: '',
        premioLiquido: '', valorTotal: '', comissao: '',
        corretoraOrigem: '', observacoes: '', status: 'ativo',
      });
    }
  }, [apolice, isOpen]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Auto-compute dataRenovacao = fimVigencia - 30 days when fimVigencia changes
  const handleFimVigencia = (v: string) => {
    set('fimVigencia', v);
    if (v && !form.dataRenovacao) {
      try {
        const fim = parseISO(v);
        set('dataRenovacao', format(addDays(fim, -30), 'yyyy-MM-dd'));
      } catch {}
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.produto || !form.seguradoraId || !form.fimVigencia || !form.dataRenovacao) return;
    setSaving(true);
    try {
      await onSave({
        produto: form.produto as ProdutoSeguro,
        seguradoraId: form.seguradoraId,
        numeroApolice: form.numeroApolice,
        inicioVigencia: form.inicioVigencia || form.fimVigencia,
        fimVigencia: form.fimVigencia,
        dataRenovacao: form.dataRenovacao,
        premioLiquido: parseCurrency(form.premioLiquido) * 100,
        valorTotal: parseCurrency(form.valorTotal) * 100,
        comissao: parseCurrency(form.comissao) * 100,
        corretoraOrigem: form.corretoraOrigem || undefined,
        observacoes: form.observacoes || undefined,
        status: form.status,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Apólice' : 'Nova Apólice'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3">
          <FileText className="w-3.5 h-3.5 text-gold-deep" />
          <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Dados da Apólice</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Produto" required>
            <select className={inputCls} value={form.produto} onChange={e => set('produto', e.target.value)} required>
              <option value="">Selecionar...</option>
              {PRODUTOS_SEGURO.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Seguradora" required>
            <select className={inputCls} value={form.seguradoraId} onChange={e => set('seguradoraId', e.target.value)} required>
              <option value="">Selecionar...</option>
              {SEGURADORAS.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Field>
          <Field label="Número da apólice">
            <input className={inputCls} value={form.numeroApolice} onChange={e => set('numeroApolice', e.target.value)} placeholder="000.000.000-0" />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value as ApoliceStatus)}>
              <option value="ativo">Ativo</option>
              <option value="em_renovacao">Em renovação</option>
              <option value="expirado">Expirado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </Field>

          <Field label="Início de vigência">
            <input type="date" className={inputCls} value={form.inicioVigencia} onChange={e => set('inicioVigencia', e.target.value)} />
          </Field>
          <Field label="Fim de vigência" required>
            <input type="date" className={inputCls} value={form.fimVigencia} onChange={e => handleFimVigencia(e.target.value)} required />
          </Field>
          <Field label="Data de renovação" required>
            <input type="date" className={inputCls} value={form.dataRenovacao} onChange={e => set('dataRenovacao', e.target.value)} required />
          </Field>
          <Field label="Corretora origem">
            <input className={inputCls} value={form.corretoraOrigem} onChange={e => set('corretoraOrigem', e.target.value)} placeholder="Nome da corretora" />
          </Field>
        </div>

        <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3 mt-2">
          <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Valores</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Prêmio líquido">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-[11px]">R$</span>
              <input className={cn(inputCls, 'pl-8')} value={form.premioLiquido} onChange={e => set('premioLiquido', fmtCurrency(e.target.value))} placeholder="0,00" />
            </div>
          </Field>
          <Field label="Valor total">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-[11px]">R$</span>
              <input className={cn(inputCls, 'pl-8')} value={form.valorTotal} onChange={e => set('valorTotal', fmtCurrency(e.target.value))} placeholder="0,00" />
            </div>
          </Field>
          <Field label="Comissão">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-[11px]">R$</span>
              <input className={cn(inputCls, 'pl-8')} value={form.comissao} onChange={e => set('comissao', fmtCurrency(e.target.value))} placeholder="0,00" />
            </div>
          </Field>
        </div>

        <Field label="Observações">
          <textarea className={cn(inputCls, 'resize-none h-16')} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Observações sobre esta apólice..." />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !form.produto || !form.seguradoraId || !form.fimVigencia}
            className="flex items-center gap-2 px-5 py-2.5 bg-gold-deep text-brand-dark rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEditing ? 'Salvar' : 'Criar apólice'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
