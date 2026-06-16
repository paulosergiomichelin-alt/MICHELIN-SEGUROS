import React, { useState, useEffect, useRef } from 'react';
import {
  User, FileText, ExternalLink, ChevronRight, ChevronDown, ChevronUp,
  AlertTriangle, Briefcase, UserPlus, Save, X, Car, MapPin, Shield,
  TrendingUp, Search, Link2, Loader2,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { where } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { Lead, Cliente, Apolice } from '../../types';
import { DataService } from '../../services/DataService';
import { ClienteService } from '../../services/ClienteService';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { usePermissions } from '../../contexts/PermissionsContext';
import { LeadCRMPanel } from '../leads/LeadCRMPanel';

interface ContactSidePanelProps {
  phone: string;
  leadId?: string;
  clienteId?: string;
  contactName?: string;
  onLeadCreated?: (leadId: string) => void;
}

/** Remove DDI +55 de números brasileiros vindos do WhatsApp */
function stripDDI(phone: string): string {
  if (phone.startsWith('55') && phone.length >= 12) return phone.slice(2);
  return phone;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); } catch { return iso; }
}

function fmtMoney(cents?: number) {
  if (!cents) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCPF(cpf?: string) {
  if (!cpf) return '—';
  const n = cpf.replace(/\D/g, '');
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

const APOLICE_STATUS_COLOR: Record<string, string> = {
  ativo: 'text-emerald-400', em_renovacao: 'text-amber-300',
  expirado: 'text-red-400', cancelado: 'text-white/20',
};

// ─── Shared primitives ────────────────────────────────────────────────────────

const I = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors';
const L = 'block text-[9px] font-black text-white/30 uppercase tracking-widest mb-1';

const Field: React.FC<{ label: string; children: React.ReactNode; col?: boolean }> = ({ label, children, col }) => (
  <div className={col ? 'col-span-2' : ''}>
    <label className={L}>{label}</label>
    {children}
  </div>
);

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-[10px] text-white/50 font-bold">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-10 h-5 rounded-full transition-colors shrink-0',
        checked ? 'bg-gold-deep' : 'bg-white/10'
      )}
    >
      <span className={cn(
        'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
        checked ? 'left-5' : 'left-0.5'
      )} />
    </button>
  </div>
);

const Section: React.FC<{
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon: Icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white/3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-gold-deep" />
          <span className="text-[9px] font-black text-gold-deep uppercase tracking-widest">{title}</span>
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
      </button>
      {open && <div className="px-3 pb-3 pt-2 space-y-3">{children}</div>}
    </div>
  );
};

// ─── Lead Search / Link ───────────────────────────────────────────────────────

const LeadSearchPanel: React.FC<{
  onLinked: (leadId: string) => void;
  onCancel: () => void;
}> = ({ onLinked, onCancel }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(false);
    setResults([]);

    const cpf = q.replace(/\D/g, '');
    const isPhone = /^\d{8,13}$/.test(cpf);
    const isCpf = cpf.length === 11;

    const found = new Map<string, Lead>();

    const merge = (arr: any[]) => arr.forEach(l => { if (l?.id) found.set(l.id, l as Lead); });

    if (isCpf) {
      // Try both raw digits and formatted versions
      const cpfFormatted = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      merge(await DataService.listFromServer('lead', [where('cpf', '==', cpf)]).catch(() => []));
      merge(await DataService.listFromServer('lead', [where('cpf', '==', cpfFormatted)]).catch(() => []));
    }

    if (isPhone) {
      const stripped = cpf.startsWith('55') && cpf.length >= 12 ? cpf.slice(2) : cpf;
      merge(await DataService.listFromServer('lead', [where('phone', '==', stripped)]).catch(() => []));
      merge(await DataService.listFromServer('lead', [where('phone', '==', '55' + stripped)]).catch(() => []));
      merge(await DataService.listFromServer('lead', [where('phone', '==', cpf)]).catch(() => []));
    }

    if (!isCpf && !isPhone) {
      // Name prefix search — fetch org leads and filter client-side
      const all = await DataService.listFromServer('lead', []).catch(() => []) as Lead[];
      const lower = q.toLowerCase();
      all.filter(l => (l.name ?? '').toLowerCase().includes(lower)).forEach(l => found.set(l.id, l));
    }

    setResults(Array.from(found.values()).slice(0, 10));
    setSearched(true);
    setSearching(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Vincular Lead Existente</span>
        </div>
        <button onClick={onCancel} className="text-white/20 hover:text-white/60 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          className={cn(I, 'flex-1')}
          placeholder="Nome, CPF ou telefone..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-3 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-40"
        >
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        </button>
      </div>

      {searched && results.length === 0 && (
        <p className="text-[10px] text-white/30 text-center py-2">Nenhum lead encontrado</p>
      )}

      {results.map(l => (
        <div key={l.id} className="flex items-center justify-between gap-2 p-2.5 bg-white/5 border border-white/5 rounded-lg">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-white truncate">{l.name}</p>
            <p className="text-[9px] text-white/40 font-mono">{l.phone || l.cpf || '—'}</p>
          </div>
          <button
            onClick={() => onLinked(l.id)}
            className="shrink-0 px-2.5 py-1.5 bg-blue-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-blue-400 transition-all"
          >
            Vincular
          </button>
        </div>
      ))}
    </div>
  );
};

// ─── Full Lead Form ───────────────────────────────────────────────────────────

interface FormState {
  name: string; email: string; cpf: string; birthDate: string; civilStatus: string;
  origin: string; originDetails: string;
  plate: string; chassis: string; brandModel: string; fiduciaryAlienation: boolean;
  zipCodeOvernight: string; numberOvernight: string;
  isDifferentResidenceZip: boolean; zipCodeResidence: string; numberResidence: string;
  serviceUsage: boolean; youngDriverHousehold: boolean;
  isOwnerDriver: boolean; ownerName: string; ownerCpfCnpj: string;
  hasInsurance: boolean; insuranceExpiry: string;
}

const ORIGINS = ['WhatsApp', 'Indicação', 'Instagram', 'Facebook', 'Google', 'Agger', 'Manual', 'Outro'];
const CIVIL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'];

const EMPTY: FormState = {
  name: '', email: '', cpf: '', birthDate: '', civilStatus: '',
  origin: 'WhatsApp', originDetails: '',
  plate: '', chassis: '', brandModel: '', fiduciaryAlienation: false,
  zipCodeOvernight: '', numberOvernight: '',
  isDifferentResidenceZip: false, zipCodeResidence: '', numberResidence: '',
  serviceUsage: false, youngDriverHousehold: false,
  isOwnerDriver: true, ownerName: '', ownerCpfCnpj: '',
  hasInsurance: false, insuranceExpiry: '',
};

const FullLeadForm: React.FC<{
  phone: string;
  contactName?: string;
  onSave: (leadId: string) => void;
  onCancel: () => void;
  userProfile: any;
}> = ({ phone, contactName, onSave, onCancel, userProfile }) => {
  const phoneLocal = stripDDI(phone);
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    name: contactName && !contactName.includes('@') ? contactName : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  const tog = (k: keyof FormState) => (v: boolean) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true); setError(null);
    try {
      const now = new Date().toISOString();
      const newId = await DataService.create('lead', {
        name: form.name.trim(),
        phone: phoneLocal,
        phone2: '',
        email: form.email.trim(),
        cpf: form.cpf.replace(/\D/g, ''),
        birthDate: form.birthDate,
        civilStatus: form.civilStatus,
        rg: '',
        plate: form.plate.trim().toUpperCase(),
        chassis: form.chassis.trim().toUpperCase(),
        brandModel: form.brandModel.trim(),
        zipCodeOvernight: form.zipCodeOvernight,
        numberOvernight: form.numberOvernight,
        isDifferentResidenceZip: form.isDifferentResidenceZip,
        zipCodeResidence: form.isDifferentResidenceZip ? form.zipCodeResidence : '',
        numberResidence: form.isDifferentResidenceZip ? form.numberResidence : '',
        fiduciaryAlienation: form.fiduciaryAlienation,
        serviceUsage: form.serviceUsage,
        youngDriverHousehold: form.youngDriverHousehold,
        isOwnerDriver: form.isOwnerDriver,
        ownerName: form.isOwnerDriver ? '' : form.ownerName,
        ownerCpfCnpj: form.isOwnerDriver ? '' : form.ownerCpfCnpj,
        hasInsurance: form.hasInsurance,
        insuranceExpiry: form.hasInsurance ? form.insuranceExpiry : '',
        origin: form.origin,
        originDetails: form.originDetails,
        status: 'Novo Lead',
        iaActive: false,
        responsibleAgentType: 'humano',
        organizationId: userProfile?.organizationId,
        vendedorId: userProfile?.uid,
        documents: {},
        createdAt: now,
        updatedAt: now,
      });
      onSave(String(newId));
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao criar lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Novo Lead</span>
        </div>
        <button onClick={onCancel} className="text-white/20 hover:text-white/60 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Seção: Informações Pessoais */}
      <Section title="Informações Pessoais" icon={User}>
        <Field label="Telefone (WhatsApp)">
          <input className={cn(I, 'opacity-50 cursor-not-allowed')} value={phoneLocal} readOnly />
        </Field>
        <Field label="Nome Completo *">
          <input className={I} placeholder="Nome completo" value={form.name} onChange={set('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="CPF">
            <input className={I} placeholder="000.000.000-00" value={form.cpf} onChange={set('cpf')} maxLength={14} />
          </Field>
          <Field label="Nascimento">
            <input className={I} type="date" value={form.birthDate} onChange={set('birthDate')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Estado Civil">
            <select className={I} value={form.civilStatus} onChange={set('civilStatus')}>
              <option value="">—</option>
              {CIVIL.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="E-mail">
            <input className={I} type="email" placeholder="email@..." value={form.email} onChange={set('email')} />
          </Field>
        </div>
      </Section>

      {/* Seção: Aquisição */}
      <Section title="Aquisição" icon={TrendingUp} defaultOpen={false}>
        <Field label="Origem">
          <select className={I} value={form.origin} onChange={set('origin')}>
            {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Detalhes">
          <input className={I} placeholder="Campanha, UTM, indicação de quem..." value={form.originDetails} onChange={set('originDetails')} />
        </Field>
      </Section>

      {/* Seção: Veículo */}
      <Section title="Veículo" icon={Car} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Placa">
            <input className={I} placeholder="ABC-1234" value={form.plate} onChange={set('plate')} maxLength={8} />
          </Field>
          <Field label="Marca / Modelo">
            <input className={I} placeholder="Ex: Toyota Corolla" value={form.brandModel} onChange={set('brandModel')} />
          </Field>
        </div>
        <Field label="Chassis">
          <input className={I} placeholder="9BWZZZ377VT004251" value={form.chassis} onChange={set('chassis')} maxLength={17} />
        </Field>
        <Toggle label="Alienação Fiduciária" checked={form.fiduciaryAlienation} onChange={tog('fiduciaryAlienation')} />
      </Section>

      {/* Seção: Pernoite e Residência */}
      <Section title="Pernoite e Residência" icon={MapPin} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="CEP Pernoite">
            <input className={I} placeholder="00000-000" value={form.zipCodeOvernight} onChange={set('zipCodeOvernight')} maxLength={9} />
          </Field>
          <Field label="Número">
            <input className={I} placeholder="Nº" value={form.numberOvernight} onChange={set('numberOvernight')} />
          </Field>
        </div>
        <Toggle label="Residência diferente do pernoite?" checked={form.isDifferentResidenceZip} onChange={tog('isDifferentResidenceZip')} />
        {form.isDifferentResidenceZip && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Field label="CEP Residência">
              <input className={I} placeholder="00000-000" value={form.zipCodeResidence} onChange={set('zipCodeResidence')} maxLength={9} />
            </Field>
            <Field label="Número">
              <input className={I} placeholder="Nº" value={form.numberResidence} onChange={set('numberResidence')} />
            </Field>
          </div>
        )}
      </Section>

      {/* Seção: Uso do Veículo */}
      <Section title="Uso do Veículo" icon={Car} defaultOpen={false}>
        <Toggle label="Uso para trabalho (2+ dias/semana)" checked={form.serviceUsage} onChange={tog('serviceUsage')} />
        <Toggle label="Residente de 18 a 24 anos na casa" checked={form.youngDriverHousehold} onChange={tog('youngDriverHousehold')} />
      </Section>

      {/* Seção: Proprietário */}
      <Section title="Proprietário do Veículo" icon={User} defaultOpen={false}>
        <Toggle label="Lead é o proprietário do veículo" checked={form.isOwnerDriver} onChange={tog('isOwnerDriver')} />
        {!form.isOwnerDriver && (
          <div className="space-y-3 pt-1">
            <Field label="Nome do Proprietário">
              <input className={I} placeholder="Nome completo" value={form.ownerName} onChange={set('ownerName')} />
            </Field>
            <Field label="CPF / CNPJ do Proprietário">
              <input className={I} placeholder="000.000.000-00" value={form.ownerCpfCnpj} onChange={set('ownerCpfCnpj')} />
            </Field>
          </div>
        )}
      </Section>

      {/* Seção: Seguro Atual */}
      <Section title="Seguro Atual" icon={Shield} defaultOpen={false}>
        <Toggle label="Possui seguro ativo" checked={form.hasInsurance} onChange={tog('hasInsurance')} />
        {form.hasInsurance && (
          <Field label="Vencimento do Seguro">
            <input className={I} type="date" value={form.insuranceExpiry} onChange={set('insuranceExpiry')} />
          </Field>
        )}
      </Section>

      {error && <p className="text-[10px] text-red-400 px-1">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gold-deep text-brand-dark rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all disabled:opacity-50 sticky bottom-0"
      >
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Salvando...' : 'Salvar Lead'}
      </button>
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

export const ContactSidePanel: React.FC<ContactSidePanelProps> = ({
  phone, leadId, clienteId, contactName, onLeadCreated,
}) => {
  const navigate = useNavigate();
  const { userProfile, permissions } = usePermissions();
  const [lead, setLead] = useState<Lead | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [apolices, setApolices] = useState<Apolice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLead(null); setCliente(null); setApolices([]);
    setShowForm(false); setShowSearch(false);

    async function load() {
      const phoneLocal = stripDDI(phone);

      if (leadId) {
        const l = await DataService.get('lead', leadId).catch(() => null);
        if (!cancelled && l) setLead(l as Lead);
      } else if (phone) {
        // Try all phone variants — bypass cache so we get live Firestore data
        const phonesToTry = Array.from(new Set([
          phoneLocal,           // without DDI (e.g. 6793202442)
          '55' + phoneLocal,    // with DDI for leads saved before stripping (e.g. 556793202442)
          phone,                // raw conv.phone as last resort
        ]));
        let found: any[] = [];
        for (const p of phonesToTry) {
          found = await DataService.listFromServer('lead', [where('phone', '==', p)]).catch(() => [] as any[]);
          if (found.length > 0) break;
        }
        if (!cancelled && found.length > 0) setLead(found[0] as Lead);
      }

      if (clienteId) {
        const c = await DataService.get('cliente', clienteId).catch(() => null);
        if (!cancelled && c) setCliente(c as Cliente);
      } else if (phone) {
        const byWa = await DataService.listFromServer('cliente', [where('whatsapp', '==', phoneLocal)]).catch(() => [] as any[]);
        if (!cancelled && byWa.length > 0) {
          setCliente(byWa[0] as Cliente);
        } else {
          const byTel = await DataService.listFromServer('cliente', [where('telefone', '==', phoneLocal)]).catch(() => [] as any[]);
          if (!cancelled && byTel.length > 0) setCliente(byTel[0] as Cliente);
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [leadId, clienteId, phone]);

  useEffect(() => {
    if (!clienteId) { setApolices([]); return; }
    return ClienteService.subscribeApolices(clienteId, setApolices);
  }, [clienteId]);

  const handleLeadSaved = (newLeadId: string) => {
    setShowForm(false);
    setShowSearch(false);
    DataService.get('lead', newLeadId).then(l => { if (l) setLead(l as Lead); }).catch(() => {});
    onLeadCreated?.(newLeadId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#111b21]">
        <div className="w-5 h-5 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
      </div>
    );
  }

  // Lead found → show LeadCRMPanel identically to WhatsApp IA
  if (lead && !showForm && !showSearch) {
    return (
      <LeadCRMPanel
        leadId={lead.id}
        permissions={permissions}
        isOpen
        onClose={() => { setLead(null); setShowSearch(true); }}
      />
    );
  }

  const hasContact = lead || cliente;

  return (
    <div className="flex flex-col h-full bg-[#111b21]">
      {/* Contact header */}
      <div className="h-[50px] flex items-center gap-3 px-4 bg-[#202c33] border-b border-white/5 shrink-0">
        <div className="w-7 h-7 rounded-full bg-gold-deep/10 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-gold-deep" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-[#e9edef] truncate leading-tight">{contactName || phone}</p>
          <p className="text-[9px] text-[#8696a0] font-mono leading-none mt-0.5">{stripDDI(phone)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Inline form */}
        {showForm && (
          <FullLeadForm
            phone={phone}
            contactName={contactName}
            onSave={handleLeadSaved}
            onCancel={() => setShowForm(false)}
            userProfile={userProfile}
          />
        )}

        {/* Lead search / link */}
        {showSearch && (
          <LeadSearchPanel
            onLinked={handleLeadSaved}
            onCancel={() => setShowSearch(false)}
          />
        )}

        {/* No contact */}
        {!hasContact && !showForm && !showSearch && (
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-white/10 mx-auto" />
            <p className="text-[10px] text-[#8696a0]">Contato não identificado no CRM</p>
            <button
              onClick={() => setShowSearch(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/30 transition-all"
            >
              <Link2 className="w-3.5 h-3.5" />
              Vincular Lead Existente
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gold-deep text-brand-dark rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Criar Lead
            </button>
          </div>
        )}

        {/* Lead handled above via LeadCRMPanel early return */}

        {/* Cliente info */}
        {cliente && (
          <div className="bg-brand-black/50 border border-emerald-500/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Cliente</span>
              </div>
              <button onClick={() => navigate(`/clientes/${cliente.id}`)} className="text-white/20 hover:text-gold-deep transition-colors">
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div>
              <p className="text-[12px] font-bold text-white">{cliente.nome}</p>
              <p className="text-[10px] text-white/40 font-mono mt-0.5">{fmtCPF(cliente.cpf)}</p>
            </div>
            {[
              ['E-mail', cliente.email],
              ['Cidade', [cliente.cidade, cliente.estado].filter(Boolean).join(' / ')],
            ].map(([k, v]) => v ? (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-[9px] text-white/30 uppercase font-black tracking-widest">{k}</span>
                <span className="text-[10px] text-white/70 font-medium text-right">{v}</span>
              </div>
            ) : null)}
            <button
              onClick={() => navigate(`/clientes/${cliente.id}`)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              <span>Ver Cadastro Completo</span><ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Apólices */}
        {apolices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-gold-deep" />
              <span className="text-[9px] font-black text-gold-light uppercase tracking-widest">Apólices ({apolices.length})</span>
            </div>
            {apolices.map(a => {
              const daysToRenew = a.dataRenovacao ? differenceInDays(parseISO(a.dataRenovacao), new Date()) : null;
              return (
                <div key={a.id} className="bg-brand-black/50 border border-white/5 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-white">{a.produto}</p>
                    <SeguradoraBadge seguradoraId={a.seguradoraId} size="xs" />
                  </div>
                  {a.numeroApolice && <p className="text-[9px] text-white/30 font-mono">#{a.numeroApolice}</p>}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      ['Vigência', fmtDate(a.fimVigencia)],
                      ['Renovação', fmtDate(a.dataRenovacao)],
                      ['Prêmio', fmtMoney(a.valorTotal)],
                      ['Status', a.status?.replace('_', ' ')],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[8px] text-white/20 uppercase font-black">{k}</p>
                        <p className={cn('text-[9px] font-bold', k === 'Status' ? APOLICE_STATUS_COLOR[a.status] : 'text-white/60')}>{v}</p>
                      </div>
                    ))}
                  </div>
                  {daysToRenew !== null && daysToRenew <= 30 && daysToRenew >= 0 && (
                    <div className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[9px] font-black',
                      daysToRenew <= 7 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-300'
                    )}>
                      <AlertTriangle className="w-3 h-3" />
                      Renovação em {daysToRenew === 0 ? 'HOJE' : `${daysToRenew} dias`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Quick actions */}
        {hasContact && (
          <div className="space-y-2">
            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Ações Rápidas</p>
            {cliente && (
              <button
                onClick={() => navigate(`/clientes/${cliente.id}?tab=apolices`)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <span>Nova Apólice</span><ChevronRight className="w-3 h-3" />
              </button>
            )}
            {lead && !cliente && (
              <button
                onClick={() => navigate(`/leads/${lead.id}`)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <span>Converter em Cliente</span><ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
