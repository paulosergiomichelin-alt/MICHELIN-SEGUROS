
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText, TrendingUp, CheckCircle2, X, Lock, Sparkles, Bot,
  User, Smartphone, Mail, Calendar, MapPin, ClipboardList, Flame,
  ShieldCheck, Upload, Loader2, Check, History, Tag, CreditCard,
  Briefcase, Users, Car, Hash, Navigation, Building2, Clock,
  ChevronDown, ChevronUp, Wrench, Eye, Download, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { Lead, Permissions, UserProfile } from '../../types';
import { cn, maskCPF, maskPhone } from '../../lib/utils';
import { SensitiveContent } from '../../components/SensitiveContent';
import { DataService } from '../../services/DataService';
import { StorageService } from '../../services/StorageService';
import { auth } from '../../lib/firebase';
import { logger } from '../../services/LoggerService';

interface LeadCRMPanelProps {
  leadId: string;
  permissions: Permissions;
  onClose?: () => void;
  isOpen?: boolean;
}

const TEMPS: Record<string, { label: string; color: string }> = {
  quente: { label: 'Quente', color: 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]' },
  morno:  { label: 'Morno',  color: 'bg-gold-deep text-brand-dark shadow-[0_0_10px_rgba(212,169,77,0.3)]' },
  frio:   { label: 'Frio',   color: 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' },
};

const STATUS_OPTIONS = [
  'Novo Lead', 'Em Atendimento', 'Aguardando Documento',
  'Em Cotação', 'Proposta Enviada', 'Fechado', 'Perdido',
];

const ORIGINS = [
  'WhatsApp', 'Instagram', 'Facebook', 'Google',
  'Indicação', 'Telefone', 'Site', 'Cadastro manual',
];

const CIVIL_STATUS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'];

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder-white/20 outline-none focus:border-gold-deep/50 focus:ring-1 focus:ring-gold-deep/20 transition-all [color-scheme:dark]";
const labelCls = "text-[9px] font-black text-white/30 uppercase tracking-widest";

// ─── Section header ────────────────────────────────────────────────────────
const Section = ({
  icon: Icon, title, children, collapsible = false,
}: {
  icon: React.ElementType; title: string; children: React.ReactNode; collapsible?: boolean;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between border-b border-white/5 pb-2",
          collapsible && "cursor-pointer hover:opacity-80"
        )}
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-3.5 h-3.5 text-gold-deep" />
          <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{title}</h4>
        </div>
        {collapsible && (open
          ? <ChevronUp className="w-3 h-3 text-white/20" />
          : <ChevronDown className="w-3 h-3 text-white/20" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {(!collapsible || open) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

// ─── Labelled field wrapper ─────────────────────────────────────────────────
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className={labelCls}>{label}</label>
    {children}
  </div>
);

export const LeadCRMPanel = React.memo(({
  leadId, permissions, onClose, isOpen,
}: LeadCRMPanelProps) => {
  const [lead, setLead]               = useState<Lead | null>(null);
  const [loading, setLoading]         = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers]             = useState<UserProfile[]>([]);

  // Local edits: text fields only; cleared on blur-save
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const focusedField = useRef<string | null>(null);

  useEffect(() => {
    if (!leadId) { setLoading(false); return; }

    const unsub = DataService.subscribe('lead', leadId, (data) => {
      setLead(data);
      setLoading(false);
    });

    const uid = auth.currentUser?.uid;
    if (uid) DataService.get('user', uid).then(setCurrentUser);
    DataService.list('users').then(u => setUsers(u as UserProfile[]));

    return () => { if (unsub) unsub(); };
  }, [leadId]);

  const updateLeadField = useCallback(async (field: string, value: any) => {
    if (!lead) return;
    try {
      await DataService.update('lead', leadId, { [field]: value, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error('[CRM_PANEL] Update failed:', err);
    }
  }, [lead, leadId]);

  // Text field helpers
  const fv = (field: string) =>
    field in localEdits ? localEdits[field] : ((lead as any)?.[field] ?? '');

  const setLocal = (field: string, value: string) => {
    setLocalEdits(prev => ({ ...prev, [field]: value }));
    focusedField.current = field;
  };

  const flush = async (field: string) => {
    focusedField.current = null;
    if (!(field in localEdits)) return;
    const value = localEdits[field];
    setLocalEdits(prev => { const n = { ...prev }; delete n[field]; return n; });
    await updateLeadField(field, value);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file || !lead) return;
    setUploadingDoc(type);
    try {
      const { url } = await StorageService.uploadFile(file, lead.id, `${type}_${file.name}`);
      const documents = { ...(lead.documents || {}), [type]: url };
      await updateLeadField('documents', documents);
      logger.info('STORAGE', 'DOC_UPLOADED', { leadId: lead.id, type });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploadingDoc(null);
    }
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-8 bg-brand-dark/50">
      <Loader2 className="w-8 h-8 text-gold-deep animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Carregando...</p>
    </div>
  );

  if (!lead) return null;

  const isAdmin = currentUser?.role === 'admin';
  const possuiSeguro = !!(lead.possuiSeguro ?? lead.hasInsurance);
  const tempCfg = TEMPS[lead.temperature || 'morno'];

  return (
    <div className={cn(
      "flex flex-col h-full bg-[#111b21] border-l border-white/5 overflow-hidden transition-all duration-300",
      isOpen ? "w-full md:w-[360px]" : "w-0 overflow-hidden"
    )}>
      {/* ── Header ── */}
      <div className="h-[50px] flex items-center justify-between px-4 bg-[#202c33] border-b border-white/5 shrink-0">
        <h3 className="text-[10px] font-black text-gold-deep uppercase tracking-[0.15rem] flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5" />
          Detalhes do Lead
        </h3>
        <button onClick={onClose} className="p-1.5 text-white/30 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

        {/* ── Avatar ── */}
        <section className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-gold-deep/10 flex items-center justify-center border-2 border-gold-deep/20 mb-3 text-xl font-black text-gold-deep relative">
            {(lead.name || '?').charAt(0)}
            <div className={cn("absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-[#111b21] flex items-center justify-center", tempCfg.color)}>
              <Flame className="w-2.5 h-2.5" />
            </div>
          </div>
          <h2 className="text-base font-bold text-white tracking-tight leading-tight">{lead.name}</h2>
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] mt-0.5">{maskPhone(lead.phone)}</p>
          <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-1.5">
            Criado em {new Date(lead.createdAt).toLocaleDateString()}
          </p>
        </section>

        {/* ── Status + Equipe ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Status</label>
            <select
              value={lead.status}
              onChange={e => updateLeadField('status', e.target.value)}
              className={inputCls}
            >
              {STATUS_OPTIONS.map(o => <option key={o} value={o} className="bg-[#202c33]">{o}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Responsável</label>
            <div className="relative">
              <select
                value={lead.ownerId || lead.responsibleUserId || ''}
                disabled={!isAdmin}
                onChange={e => {
                  const user = users.find(u => (u.uid || (u as any).id) === e.target.value);
                  updateLeadField('ownerId', e.target.value);
                  updateLeadField('responsibleUserId', e.target.value);
                  if (user) updateLeadField('responsibleAgentName', user.name || user.email);
                }}
                className={cn(inputCls, !isAdmin && "opacity-50 cursor-not-allowed")}
              >
                <option value="" className="bg-[#202c33]">— Nenhum —</option>
                {users.map(u => {
                  const uid = u.uid || (u as any).id || '';
                  return <option key={uid} value={uid} className="bg-[#202c33]">{u.name || u.email}</option>;
                })}
              </select>
              {!isAdmin && <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-white/20" />}
            </div>
          </div>
        </div>

        {/* ── Atendimento ── */}
        <section className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-black text-gold-deep uppercase tracking-widest">Atendimento</h4>
            <ShieldCheck className="w-3.5 h-3.5 text-gold-deep" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
              <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mb-1.5">Fervor</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(TEMPS).map(([t, cfg]) => (
                  <button key={t} onClick={() => updateLeadField('temperature', t)}
                    className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase transition-all",
                      lead.temperature === t ? cfg.color : "bg-white/5 text-white/20 hover:text-white")}
                  >{cfg.label}</button>
                ))}
              </div>
            </div>
            <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
              <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mb-1">Score IA</p>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-emerald-500">{lead.score || 0}</span>
                <span className="text-[8px] font-bold text-white/20">/100</span>
              </div>
            </div>
          </div>

          <Field label="Origem do Contato">
            <select value={lead.origin || ''} onChange={e => updateLeadField('origin', e.target.value)} className={inputCls}>
              {ORIGINS.map(o => <option key={o} value={o} className="bg-[#202c33]">{o}</option>)}
            </select>
          </Field>

          <Field label="Perfil do Lead">
            <div className="flex gap-1.5">
              {['Residencial', 'Comercial', 'Frota'].map(p => (
                <button key={p} onClick={() => updateLeadField('profileType', p.toLowerCase())}
                  className={cn("flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-tight border transition-all",
                    lead.profileType === p.toLowerCase()
                      ? "bg-gold-deep text-brand-dark border-gold-deep"
                      : "bg-white/5 text-white/30 border-white/5 hover:border-white/20")}
                >{p}</button>
              ))}
            </div>
          </Field>

          {/* IA toggle */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">IA Ativa</span>
            </div>
            <button onClick={() => updateLeadField('iaActive', !lead.iaActive)}
              className={cn("w-10 h-5 rounded-full transition-all relative border",
                lead.iaActive ? "bg-emerald-500 border-emerald-500" : "bg-white/10 border-white/10")}
            >
              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                lead.iaActive ? "left-5" : "left-0.5")} />
            </button>
          </div>
        </section>

        {/* ── Dados Pessoais ── */}
        <Section icon={User} title="Dados Pessoais" collapsible>
          <div className="space-y-3">
            <Field label="Nome Completo">
              <input value={fv('name')} onChange={e => setLocal('name', e.target.value.toUpperCase())}
                onBlur={() => flush('name')} placeholder="Nome do cliente" className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone">
                <input value={fv('phone')} onChange={e => setLocal('phone', e.target.value)}
                  onBlur={() => flush('phone')} placeholder="(11) 99999-9999" className={inputCls} />
              </Field>
              <Field label="Telefone 2">
                <input value={fv('phone2')} onChange={e => setLocal('phone2', e.target.value)}
                  onBlur={() => flush('phone2')} placeholder="Opcional" className={inputCls} />
              </Field>
            </div>

            <Field label="E-mail">
              <input type="email" value={fv('email')} onChange={e => setLocal('email', e.target.value)}
                onBlur={() => flush('email')} placeholder="email@exemplo.com" className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="CPF / CNPJ">
                <input value={fv('cpf')} onChange={e => setLocal('cpf', e.target.value)}
                  onBlur={() => flush('cpf')} placeholder="000.000.000-00" className={inputCls} />
              </Field>
              <Field label="Data Nascimento">
                <input type="date" value={fv('birthDate')} onChange={e => setLocal('birthDate', e.target.value)}
                  onBlur={() => flush('birthDate')} className={inputCls} />
              </Field>
            </div>

            <Field label="Estado Civil">
              <select value={lead.maritalStatus || lead.civilStatus || ''}
                onChange={e => updateLeadField('maritalStatus', e.target.value)}
                className={inputCls}
              >
                <option value="" className="bg-[#202c33]">— Selecione —</option>
                {CIVIL_STATUS.map(s => <option key={s} value={s} className="bg-[#202c33]">{s}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        {/* ── Veículo ── */}
        <Section icon={Car} title="Veículo" collapsible>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Placa">
                <input value={fv('plate')} onChange={e => setLocal('plate', e.target.value.toUpperCase())}
                  onBlur={() => flush('plate')} placeholder="ABC1D23" className={inputCls} />
              </Field>
              <Field label="Chassi">
                <input value={fv('chassi') || fv('chassis')}
                  onChange={e => setLocal('chassi', e.target.value.toUpperCase())}
                  onBlur={() => flush('chassi')} placeholder="17 caracteres" className={inputCls} />
              </Field>
            </div>
            <Field label="Marca / Modelo">
              <input value={fv('brandModel')} onChange={e => setLocal('brandModel', e.target.value.toUpperCase())}
                onBlur={() => flush('brandModel')} placeholder="Ex: VW GOL 1.0" className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="RENAVAM">
                <input value={fv('renavam')} onChange={e => setLocal('renavam', e.target.value)}
                  onBlur={() => flush('renavam')} placeholder="11 dígitos" className={inputCls} />
              </Field>
              <Field label="Categoria CNH">
                <input value={fv('licenseCategory')} onChange={e => setLocal('licenseCategory', e.target.value.toUpperCase())}
                  onBlur={() => flush('licenseCategory')} placeholder="B, C, D..." className={inputCls} />
              </Field>
            </div>
            <Field label="Vencimento CNH">
              <input type="date" value={fv('licenseExpiry')} onChange={e => setLocal('licenseExpiry', e.target.value)}
                onBlur={() => flush('licenseExpiry')} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* ── Endereço ── */}
        <Section icon={MapPin} title="Endereço (Pernoite)" collapsible>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="CEP">
                  <input value={fv('cepPernoite') || fv('zipCodeOvernight')}
                    onChange={e => setLocal('cepPernoite', e.target.value.replace(/\D/g, '').substring(0, 8))}
                    onBlur={() => flush('cepPernoite')} placeholder="00000-000" className={inputCls} />
                </Field>
              </div>
              <Field label="Nº">
                <input value={fv('numeroPernoite') || fv('numberOvernight')}
                  onChange={e => setLocal('numeroPernoite', e.target.value)}
                  onBlur={() => flush('numeroPernoite')} placeholder="000" className={inputCls} />
              </Field>
            </div>
            <Field label="Logradouro">
              <input value={fv('logradouroPernoite')} onChange={e => setLocal('logradouroPernoite', e.target.value)}
                onBlur={() => flush('logradouroPernoite')} placeholder="Rua / Av." className={inputCls} />
            </Field>
            <Field label="Bairro">
              <input value={fv('bairroPernoite')} onChange={e => setLocal('bairroPernoite', e.target.value)}
                onBlur={() => flush('bairroPernoite')} placeholder="Bairro" className={inputCls} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Cidade">
                  <input value={fv('cidadePernoite')} onChange={e => setLocal('cidadePernoite', e.target.value)}
                    onBlur={() => flush('cidadePernoite')} placeholder="Cidade" className={inputCls} />
                </Field>
              </div>
              <Field label="UF">
                <input value={fv('estadoPernoite')} onChange={e => setLocal('estadoPernoite', e.target.value.toUpperCase().substring(0, 2))}
                  onBlur={() => flush('estadoPernoite')} placeholder="SP" className={inputCls} />
              </Field>
            </div>
          </div>
        </Section>

        {/* ── Seguro ── */}
        <Section icon={ShieldCheck} title="Seguro" collapsible>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Já possui seguro ativo?</span>
              <button onClick={() => updateLeadField('possuiSeguro', !possuiSeguro)}
                className={cn("w-10 h-5 rounded-full transition-all relative border",
                  possuiSeguro ? "bg-gold-deep border-gold-deep" : "bg-white/10 border-white/10")}
              >
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                  possuiSeguro ? "left-5" : "left-0.5")} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {possuiSeguro && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Seguradora">
                      <input value={fv('insurer')} onChange={e => setLocal('insurer', e.target.value)}
                        onBlur={() => flush('insurer')} placeholder="Ex: Porto Seguro" className={inputCls} />
                    </Field>
                    <Field label="Corretora">
                      <input value={fv('brokerName')} onChange={e => setLocal('brokerName', e.target.value)}
                        onBlur={() => flush('brokerName')} placeholder="Nome" className={inputCls} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Início Vigência">
                      <input type="date" value={fv('startDate')} onChange={e => setLocal('startDate', e.target.value)}
                        onBlur={() => flush('startDate')} className={inputCls} />
                    </Field>
                    <Field label="Fim Vigência">
                      <input type="date" value={fv('insuranceExpiry')} onChange={e => setLocal('insuranceExpiry', e.target.value)}
                        onBlur={() => flush('insuranceExpiry')} className={inputCls} />
                    </Field>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Section>

        {/* ── Perfil de Uso ── */}
        <Section icon={TrendingUp} title="Perfil de Uso" collapsible>
          <div className="space-y-2">
            {([
              { key: 'serviceUsage',          icon: Briefcase,   label: 'Uso Comercial / App' },
              { key: 'youngDriverHousehold',   icon: Users,       label: 'Condutor Jovem na Residência' },
              { key: 'isOwnerDriver',          icon: User,        label: 'Proprietário é o Condutor?' },
              { key: 'fiduciaryAlienation',    icon: CreditCard,  label: 'Alienação Fiduciária' },
            ] as const).map(item => (
              <button key={item.key}
                onClick={() => updateLeadField(item.key, !(lead as any)[item.key])}
                className={cn("w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                  (lead as any)[item.key]
                    ? "bg-gold-deep/10 border-gold-deep/20"
                    : "bg-white/5 border-white/5 opacity-50 hover:opacity-100")}
              >
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                  (lead as any)[item.key] ? "bg-gold-deep text-brand-dark" : "bg-white/5 text-white/30")}>
                  <item.icon className="w-4 h-4" />
                </div>
                <span className={cn("text-[10px] font-black uppercase tracking-tight text-left",
                  (lead as any)[item.key] ? "text-white" : "text-white/30")}>{item.label}</span>
                <div className="ml-auto shrink-0">
                  {(lead as any)[item.key]
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <div className="w-4 h-4 rounded-full border border-white/10" />}
                </div>
              </button>
            ))}
          </div>

          <AnimatePresence>
            {!lead.isOwnerDriver && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-3">
                <div className="p-4 bg-black/40 border border-gold-deep/20 rounded-xl space-y-3">
                  <p className="text-[9px] font-black text-gold-deep uppercase tracking-widest flex items-center gap-2">
                    <User className="w-3 h-3" /> Dados do Proprietário
                  </p>
                  <Field label="Nome do Proprietário">
                    <input value={fv('nomeProprietario') || fv('ownerName')}
                      onChange={e => setLocal('nomeProprietario', e.target.value.toUpperCase())}
                      onBlur={() => flush('nomeProprietario')} className={inputCls} />
                  </Field>
                  <Field label="CPF / CNPJ Proprietário">
                    <input value={fv('cpfProprietario') || fv('ownerCpfCnpj')}
                      onChange={e => setLocal('cpfProprietario', e.target.value.replace(/\D/g, ''))}
                      onBlur={() => flush('cpfProprietario')} className={inputCls} />
                  </Field>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* ── Agendamento ── */}
        <Section icon={Clock} title="Agendamento" collapsible>
          <Field label="Próximo Retorno">
            <input type="datetime-local"
              value={(lead.proximoRetorno || lead.nextReturnAt || '').substring(0, 16)}
              onChange={e => updateLeadField('proximoRetorno', e.target.value)}
              className={inputCls} />
          </Field>
        </Section>

        {/* ── Documentos ── */}
        <Section icon={FileText} title="Documentos">
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'cnh',    label: 'CNH Condutor', icon: User },
              { id: 'crv',    label: 'CRV / CRLV',   icon: Car },
              { id: 'policy', label: 'Apólice Atual', icon: ShieldCheck },
              { id: 'quote',  label: 'Cotação PDF',   icon: FileText },
            ] as const).map(doc => {
              const docs = (lead.documents || {}) as Record<string, string | null>;
              const fileUrl = docs[doc.id] || null;
              const hasFile = !!fileUrl;
              const isUploading = uploadingDoc === doc.id;
              return (
                <div key={doc.id} className="group relative">
                  <input type="file" id={`crm-file-${doc.id}`} className="hidden"
                    onChange={e => handleFileUpload(e, doc.id)}
                    accept=".pdf,.png,.jpg,.jpeg,.webp" />

                  <div
                    onClick={() => !hasFile && !isUploading && document.getElementById(`crm-file-${doc.id}`)?.click()}
                    className={cn(
                      "relative cursor-pointer p-4 h-36 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center text-center gap-2.5 overflow-hidden",
                      hasFile
                        ? "border-[#25D36630] bg-[#25D36605]"
                        : "border-white/5 bg-white/[0.02] hover:border-gold-deep/40 hover:bg-gold-deep/[0.04]"
                    )}
                  >
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-gold-deep" />
                        <span className="text-[8px] font-black uppercase text-gold-deep animate-pulse">Enviando...</span>
                      </div>
                    ) : (
                      <>
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300",
                          hasFile
                            ? "bg-[#25D366] text-white scale-110"
                            : "bg-white/5 text-white/30 group-hover:bg-gold-deep group-hover:text-black group-hover:rotate-6"
                        )}>
                          {hasFile ? <CheckCircle2 className="w-5 h-5" /> : <doc.icon className="w-5 h-5" />}
                        </div>
                        <div className="space-y-0.5 w-full px-1">
                          <span className="text-[9px] font-black uppercase tracking-widest block text-white/90 truncate">{doc.label}</span>
                          <p className="text-[7.5px] text-white/30 font-bold uppercase tracking-wider truncate">
                            {hasFile ? 'Digitalizado' : 'Clique para subir'}
                          </p>
                        </div>
                      </>
                    )}

                    {/* Overlay de ações ao hover quando tem arquivo */}
                    {hasFile && !isUploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/90 opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm gap-2">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); window.open(fileUrl!, '_blank', 'noopener,noreferrer'); }}
                          className="p-2.5 bg-white/10 hover:bg-gold-deep hover:text-black rounded-xl text-white transition-all shadow-xl"
                          title="Ver arquivo"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <a
                          href={fileUrl!}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="p-2.5 bg-white/10 hover:bg-gold-deep hover:text-black rounded-xl text-white transition-all shadow-xl"
                          title="Baixar arquivo"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); updateLeadField('documents', { ...(lead.documents || {}), [doc.id]: null }); }}
                          className="p-2.5 bg-red-500/10 hover:bg-red-500 text-white rounded-xl transition-all shadow-xl"
                          title="Remover arquivo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Cotações geradas pelo sistema ── */}
          {(lead.cotacaoFiles ?? []).length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Cotações Geradas</p>
              {lead.cotacaoFiles!.map((file, idx) => (
                <div
                  key={file.url || idx}
                  className="p-3 bg-white/[0.03] border border-white/5 rounded-xl flex items-center justify-between group hover:border-gold-deep/20 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gold-deep/10 flex items-center justify-center text-gold-deep shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-white/90 truncate">{file.fileName}</p>
                      <p className="text-[7.5px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                        {file.uploadedAt ? format(new Date(file.uploadedAt), 'dd/MM/yy HH:mm') : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                      className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:bg-gold-deep hover:text-black transition-all"
                      title="Ver cotação"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={file.url}
                      download={file.fileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:bg-gold-deep hover:text-black transition-all"
                      title="Baixar cotação"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        const updated = [...(lead.cotacaoFiles || [])];
                        updated.splice(idx, 1);
                        updateLeadField('cotacaoFiles', updated);
                      }}
                      className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:bg-red-500 hover:text-white transition-all"
                      title="Remover cotação"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Observações ── */}
        <Section icon={ClipboardList} title="Observações" collapsible>
          <textarea
            rows={3}
            value={fv('contextSummary')}
            onChange={e => setLocal('contextSummary', e.target.value)}
            onBlur={() => flush('contextSummary')}
            placeholder="Anotações sobre o cliente, preferências, detalhes do atendimento..."
            className={cn(inputCls, "resize-none leading-relaxed")}
          />
        </Section>

        {/* ── Ações ── */}
        <section className="pt-2 space-y-2.5">
          <button className="w-full px-3 py-3.5 bg-gold-deep text-brand-dark rounded-xl text-[9px] font-black uppercase tracking-[0.15em] shadow-lg shadow-gold-deep/20 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2.5">
            <Bot className="w-3.5 h-3.5" /> Cotar Michelin IA
          </button>
        </section>

        <div className="h-20" />
      </div>
    </div>
  );
});

LeadCRMPanel.displayName = 'LeadCRMPanel';
