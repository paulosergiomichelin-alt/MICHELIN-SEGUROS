import React, { useState, useEffect } from 'react';
import { Save, Loader2, User, Phone, MapPin, Briefcase, X } from 'lucide-react';
import { Cliente, UserProfile } from '../../types';
import { cn, formatCPF, generateId } from '../../lib/utils';
import { Modal } from '../../components/Modal';

interface ClienteFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  cliente?: Cliente | null;
  users?: UserProfile[];
}

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'];

const SECTION = ({ label, icon: Icon }: { label: string; icon: React.ElementType }) => (
  <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3 mb-3">
    <Icon className="w-3.5 h-3.5 text-gold-deep" />
    <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">{label}</span>
  </div>
);

const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-0.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all placeholder:text-white/20";

function formatPhone(v: string) {
  const n = v.replace(/\D/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0,2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7,11)}`;
}

function fmtCPF(v: string) {
  const n = v.replace(/\D/g, '');
  let r = '';
  for (let i = 0; i < n.length && i < 11; i++) {
    if (i === 3 || i === 6) r += '.';
    if (i === 9) r += '-';
    r += n[i];
  }
  return r;
}

export const ClienteForm: React.FC<ClienteFormProps> = ({ isOpen, onClose, onSave, cliente, users = [] }) => {
  const isEditing = !!cliente;
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [form, setForm] = useState({
    nome: '', cpf: '', rg: '', dataNascimento: '', estadoCivil: '', profissao: '',
    telefone: '', whatsapp: '', email: '',
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
    responsavelId: '', observacoes: '',
  });

  useEffect(() => {
    if (cliente) {
      setForm({
        nome: cliente.nome ?? '',
        cpf: fmtCPF(cliente.cpf ?? ''),
        rg: cliente.rg ?? '',
        dataNascimento: cliente.dataNascimento ?? '',
        estadoCivil: cliente.estadoCivil ?? '',
        profissao: cliente.profissao ?? '',
        telefone: formatPhone(cliente.telefone ?? ''),
        whatsapp: formatPhone(cliente.whatsapp ?? ''),
        email: cliente.email ?? '',
        cep: cliente.cep ?? '',
        rua: cliente.rua ?? '',
        numero: cliente.numero ?? '',
        complemento: cliente.complemento ?? '',
        bairro: cliente.bairro ?? '',
        cidade: cliente.cidade ?? '',
        estado: cliente.estado ?? '',
        responsavelId: cliente.responsavelId ?? '',
        observacoes: cliente.observacoes ?? '',
      });
    } else {
      setForm({
        nome: '', cpf: '', rg: '', dataNascimento: '', estadoCivil: '', profissao: '',
        telefone: '', whatsapp: '', email: '',
        cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
        responsavelId: '', observacoes: '',
      });
    }
  }, [cliente, isOpen]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const fetchCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({
          ...f,
          rua: data.logradouro || f.rua,
          bairro: data.bairro || f.bairro,
          cidade: data.localidade || f.cidade,
          estado: data.uf || f.estado,
        }));
      }
    } catch {}
    finally { setLoadingCep(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.cpf.trim() || !form.telefone.trim()) return;
    setSaving(true);
    try {
      await onSave({
        nome: form.nome.trim(),
        cpf: form.cpf.replace(/\D/g, ''),
        rg: form.rg || undefined,
        dataNascimento: form.dataNascimento || undefined,
        estadoCivil: form.estadoCivil || undefined,
        profissao: form.profissao || undefined,
        telefone: form.telefone.replace(/\D/g, ''),
        whatsapp: form.whatsapp ? form.whatsapp.replace(/\D/g, '') : undefined,
        email: form.email || undefined,
        cep: form.cep.replace(/\D/g, '') || undefined,
        rua: form.rua || undefined,
        numero: form.numero || undefined,
        complemento: form.complemento || undefined,
        bairro: form.bairro || undefined,
        cidade: form.cidade || undefined,
        estado: form.estado || undefined,
        responsavelId: form.responsavelId || undefined,
        observacoes: form.observacoes || undefined,
        status: (cliente?.status as any) ?? 'ativo',
        leadOrigemId: cliente?.leadOrigemId,
        seguradoraAtualId: cliente?.seguradoraAtualId,
        produtoAtual: cliente?.produtoAtual,
        dataRenovacao: cliente?.dataRenovacao,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Cliente' : 'Novo Cliente'} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">

        {/* Dados pessoais */}
        <div>
          <SECTION label="Dados Pessoais" icon={User} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Field label="Nome completo" required>
                <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" required />
              </Field>
            </div>
            <Field label="CPF" required>
              <input className={inputCls} value={form.cpf} onChange={e => set('cpf', fmtCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} required />
            </Field>
            <Field label="RG">
              <input className={inputCls} value={form.rg} onChange={e => set('rg', e.target.value)} placeholder="RG" />
            </Field>
            <Field label="Data de nascimento">
              <input type="date" className={inputCls} value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} />
            </Field>
            <Field label="Estado civil">
              <select className={inputCls} value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)}>
                <option value="">Selecionar...</option>
                {ESTADO_CIVIL.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Profissão">
              <input className={inputCls} value={form.profissao} onChange={e => set('profissao', e.target.value)} placeholder="Profissão" />
            </Field>
          </div>
        </div>

        {/* Contato */}
        <div>
          <SECTION label="Contato" icon={Phone} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Telefone" required>
              <input className={inputCls} value={form.telefone} onChange={e => set('telefone', formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} required />
            </Field>
            <Field label="WhatsApp">
              <input className={inputCls} value={form.whatsapp} onChange={e => set('whatsapp', formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} />
            </Field>
            <div className="md:col-span-2">
              <Field label="E-mail">
                <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
              </Field>
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div>
          <SECTION label="Endereço" icon={MapPin} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="CEP">
              <div className="relative">
                <input
                  className={inputCls}
                  value={form.cep}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0,8);
                    set('cep', v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v);
                    if (v.length === 8) fetchCep(v);
                  }}
                  placeholder="00000-000"
                  maxLength={9}
                />
                {loadingCep && <Loader2 className="absolute right-2 top-2 w-4 h-4 text-gold-deep animate-spin" />}
              </div>
            </Field>
            <div className="md:col-span-2">
              <Field label="Rua / Logradouro">
                <input className={inputCls} value={form.rua} onChange={e => set('rua', e.target.value)} placeholder="Rua, Avenida..." />
              </Field>
            </div>
            <Field label="Número">
              <input className={inputCls} value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Nº" />
            </Field>
            <Field label="Complemento">
              <input className={inputCls} value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Apto, Bloco..." />
            </Field>
            <Field label="Bairro">
              <input className={inputCls} value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Cidade">
                <input className={inputCls} value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
              </Field>
            </div>
            <Field label="Estado">
              <select className={inputCls} value={form.estado} onChange={e => set('estado', e.target.value)}>
                <option value="">UF</option>
                {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Dados internos */}
        <div>
          <SECTION label="Dados Internos" icon={Briefcase} />
          <div className="grid grid-cols-1 gap-3">
            {users.length > 0 && (
              <Field label="Vendedor responsável">
                <select className={inputCls} value={form.responsavelId} onChange={e => set('responsavelId', e.target.value)}>
                  <option value="">Sem responsável</option>
                  {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Observações">
              <textarea
                className={cn(inputCls, 'resize-none h-20')}
                value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Observações internas..."
              />
            </Field>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !form.nome || !form.cpf || !form.telefone}
            className="flex items-center gap-2 px-5 py-2.5 bg-gold-deep text-brand-dark rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEditing ? 'Salvar alterações' : 'Criar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
