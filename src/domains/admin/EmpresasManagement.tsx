import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2, Search, RefreshCw, CheckCircle2, XCircle, PauseCircle,
  AlertTriangle, Clock, ChevronUp, ChevronDown, Eye, ShieldCheck, ShieldOff,
  Users, Loader2, AlertCircle, X, Plus, Pencil, Trash2, Upload, Save,
  FileText, ShieldCheck as CertIcon, Briefcase, MapPin, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { EmpresaService } from '../../services/EmpresaService';
import { CompanyRegistration } from '../onboarding/CompanyRegistration';
import type {
  Empresa, StatusEmpresa, PlanSaas,
  FiscalSettings, CertificateInfo, FiscalService,
  RegimeTributario, NfseEnvironment, NfseProvider,
} from '../../types';
import { fetchCep, certDaysLeft, certStatusColor } from '../nfse/utils/nfse-utils';

// ─── helpers ────────────────────────────────────────────────────────────────

function cn(...c: (string | boolean | undefined | null)[]): string {
  return c.filter(Boolean).join(' ');
}
function formatCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length < 14) return raw;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}
function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function toDateInput(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}
function calcDaysLeft(iso?: string): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

const PLAN_LIMITS: Record<PlanSaas, { limiteUsuarios: number; limiteLeadsMes: number; limiteStorageMb: number }> = {
  basico:        { limiteUsuarios: 5,   limiteLeadsMes: 100,    limiteStorageMb: 500 },
  profissional:  { limiteUsuarios: 25,  limiteLeadsMes: 1000,   limiteStorageMb: 5120 },
  enterprise:    { limiteUsuarios: 999, limiteLeadsMes: 999999, limiteStorageMb: 102400 },
};

// ─── Status / Plan badges ────────────────────────────────────────────────────

const STATUS_CFG: Record<StatusEmpresa, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  trial:        { label:'Trial',        color:'#60A5FA', bg:'rgba(96,165,250,0.08)',  border:'rgba(96,165,250,0.25)',  Icon:Clock },
  ativo:        { label:'Ativo',        color:'#4ADE80', bg:'rgba(74,222,128,0.08)',  border:'rgba(74,222,128,0.25)',  Icon:CheckCircle2 },
  suspenso:     { label:'Suspenso',     color:'#FBBF24', bg:'rgba(251,191,36,0.08)',  border:'rgba(251,191,36,0.25)',  Icon:PauseCircle },
  inadimplente: { label:'Inadimplente', color:'#F87171', bg:'rgba(248,113,113,0.08)', border:'rgba(248,113,113,0.25)', Icon:AlertTriangle },
  cancelado:    { label:'Cancelado',    color:'#6B7280', bg:'rgba(107,114,128,0.08)', border:'rgba(107,114,128,0.25)', Icon:XCircle },
};
const PLAN_COLOR: Record<string, string> = { basico:'#8E8E93', profissional:'#D4A854', enterprise:'#5E85FF' };
const PLAN_LABEL: Record<string, string>  = { basico:'Básico', profissional:'Profissional', enterprise:'Enterprise' };

function StatusBadge({ status }: { status: StatusEmpresa }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.cancelado;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.12em]"
      style={{ color:c.color, background:c.bg, border:`1px solid ${c.border}` }}>
      <c.Icon className="w-3 h-3 flex-shrink-0" />{c.label}
    </span>
  );
}
function PlanBadge({ plan }: { plan: string }) {
  const color = PLAN_COLOR[plan] ?? '#8E8E93';
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.12em]"
      style={{ color, background:`${color}12`, border:`1px solid ${color}25` }}>
      {PLAN_LABEL[plan] ?? plan}
    </span>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-t border-white/[0.04]">
      <td className="px-4 py-3.5"><div className="h-3 rounded-full bg-white/[0.06] animate-pulse w-3/4" /></td>
      <td className="px-4 py-3.5 hidden sm:table-cell"><div className="h-3 rounded-full bg-white/[0.06] animate-pulse w-2/3" /></td>
      <td className="px-4 py-3.5 hidden md:table-cell"><div className="h-3 rounded-full bg-white/[0.06] animate-pulse w-1/2" /></td>
      <td className="px-4 py-3.5"><div className="h-3 rounded-full bg-white/[0.06] animate-pulse w-1/2" /></td>
      <td className="px-4 py-3.5 hidden lg:table-cell"><div className="h-3 rounded-full bg-white/[0.06] animate-pulse w-1/3" /></td>
      <td className="px-4 py-3.5 hidden lg:table-cell"><div className="h-3 rounded-full bg-white/[0.06] animate-pulse w-1/2" /></td>
      <td className="px-4 py-3.5"><div className="h-3 rounded-full bg-white/[0.06] animate-pulse w-1/4" /></td>
    </tr>
  );
}

// ─── Confirm status modal ─────────────────────────────────────────────────────

interface ConfirmStatusProps {
  open: boolean; empresa: Empresa | null; nextStatus: StatusEmpresa | null;
  onConfirm(): void; onCancel(): void; loading: boolean;
}
function ConfirmStatusModal({ open, empresa, nextStatus, onConfirm, onCancel, loading }: ConfirmStatusProps) {
  if (!open || !empresa || !nextStatus) return null;
  const cfg = STATUS_CFG[nextStatus];
  const label = nextStatus === 'ativo' ? 'ativar' : nextStatus === 'suspenso' ? 'suspender' : nextStatus === 'cancelado' ? 'cancelar' : nextStatus;
  return (
    <AnimatePresence>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
        <motion.div initial={{opacity:0,scale:.95,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.95,y:10}}
          className="relative w-full max-w-sm rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/95 backdrop-blur-xl p-6 shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/30 to-transparent rounded-t-[20px]" />
          <button onClick={onCancel} className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background:cfg.bg, border:`1px solid ${cfg.border}` }}>
            <cfg.Icon className="w-5 h-5" style={{ color:cfg.color }} />
          </div>
          <h3 className="text-[14px] font-black text-white mb-1">Alterar status?</h3>
          <p className="text-[12px] text-[#8E8E93]/70 mb-5">
            Você está prestes a <span className="text-white font-semibold">{label}</span>{' '}
            a empresa <span className="text-[#D4A854] font-semibold">{empresa.nomeRazaoSocial}</span>.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={loading}
              className="flex-1 h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-[#8E8E93]/80 hover:border-white/[0.15] hover:text-white transition-all disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={loading}
              className="flex-1 h-9 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background:cfg.color, color:nextStatus==='ativo'?'#050505':'#fff' }}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

interface DeleteModalProps {
  empresa: Empresa | null; onConfirm(): void; onCancel(): void; loading: boolean;
}
function DeleteModal({ empresa, onConfirm, onCancel, loading }: DeleteModalProps) {
  const [typed, setTyped] = useState('');
  const expectedWord = empresa?.nomeRazaoSocial.split(' ')[0] ?? '';
  const canDelete = typed === expectedWord;

  useEffect(() => { if (!empresa) setTyped(''); }, [empresa]);

  if (!empresa) return null;
  return (
    <AnimatePresence>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={!loading ? onCancel : undefined} />
        <motion.div initial={{opacity:0,scale:.95,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.95,y:10}}
          className="relative w-full max-w-sm rounded-[20px] border border-red-500/20 bg-[#0E0F11]/95 backdrop-blur-xl p-6 shadow-2xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent rounded-t-[20px]" />
          <button onClick={onCancel} disabled={loading} className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-4">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>

          <h3 className="text-[14px] font-black text-white mb-1">Excluir empresa?</h3>
          <p className="text-[12px] text-[#8E8E93]/70 mb-1">
            Esta ação é <span className="text-red-400 font-semibold">irreversível</span>.
            O documento da empresa <span className="text-white font-semibold">{empresa.nomeRazaoSocial}</span> será excluído.
          </p>
          <p className="text-[11px] text-[#8E8E93]/50 mb-4">
            Os usuários e dados de leads desta empresa <strong className="text-white/60">não</strong> serão removidos automaticamente.
          </p>

          <label className="block text-[10px] font-bold text-[#8E8E93]/70 uppercase tracking-widest mb-1.5">
            Digite <span className="text-red-400">{expectedWord}</span> para confirmar
          </label>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={expectedWord}
            className="w-full h-9 bg-[#16181B] border border-red-500/20 rounded-lg px-3 text-[12px] font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 mb-4"
          />

          <div className="flex gap-3">
            <button onClick={onCancel} disabled={loading}
              className="flex-1 h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-[#8E8E93]/80 hover:border-white/15 hover:text-white transition-all disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={loading || !canDelete}
              className="flex-1 h-9 rounded-lg bg-red-600 text-white text-[11px] font-black uppercase tracking-wide transition-all disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-red-500">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Trash2 className="w-3.5 h-3.5" />Excluir</>}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  empresa: Empresa | null; onClose(): void;
  onSaved(updated: Empresa): void;
}

type EditModalTab = 'dados_gerais' | 'dados_fiscais' | 'certificado' | 'servicos';

type EditForm = Pick<Empresa,
  'nomeRazaoSocial'|'nomeFantasia'|'emailCorporativo'|'telefone'|
  'planoSaas'|'status'|'limiteUsuarios'|'limiteLeadsMes'|'limiteStorageMb'|
  'trialExpiraEm'|'timezone'|'idioma'
>;

function EditModal({ empresa, onClose, onSaved }: EditModalProps) {
  const [tab, setTab]           = useState<EditModalTab>('dados_gerais');
  const [form, setForm]         = useState<EditForm | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef    = useRef<HTMLInputElement>(null);
  const certRef    = useRef<HTMLInputElement>(null);

  // ─── Fiscal ────────────────────────────────────────────────────────────────
  const [fiscal, setFiscal] = useState<FiscalSettings>({});
  const [fetchingCep, setFetchingCep] = useState(false);

  // ─── Certificate ───────────────────────────────────────────────────────────
  const [cert, setCert]     = useState<CertificateInfo>({ type: 'A1' });
  const [certFile, setCertFile] = useState<File | null>(null);

  // ─── Serviços ──────────────────────────────────────────────────────────────
  const [services, setServices] = useState<FiscalService[]>([]);
  const [editSvc, setEditSvc]   = useState<Partial<FiscalService> | null>(null);

  useEffect(() => {
    if (!empresa) { setForm(null); return; }
    setForm({
      nomeRazaoSocial: empresa.nomeRazaoSocial,
      nomeFantasia: empresa.nomeFantasia ?? '',
      emailCorporativo: empresa.emailCorporativo,
      telefone: empresa.telefone ?? '',
      planoSaas: empresa.planoSaas,
      status: empresa.status,
      limiteUsuarios: empresa.limiteUsuarios,
      limiteLeadsMes: empresa.limiteLeadsMes,
      limiteStorageMb: empresa.limiteStorageMb,
      trialExpiraEm: empresa.trialExpiraEm ?? '',
      timezone: empresa.timezone,
      idioma: empresa.idioma,
    });
    setFiscal(empresa.fiscalSettings ?? {});
    setCert(empresa.certificate ?? { type: 'A1' });
    setServices(empresa.fiscalServices ?? []);
    setLogoFile(null);
    setLogoPreview(null);
    setError(null);
    setTab('dados_gerais');
  }, [empresa]);

  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) =>
    setForm(f => f ? { ...f, [k]: v } : f);

  const setF = <K extends keyof FiscalSettings>(k: K, v: FiscalSettings[K]) =>
    setFiscal(f => ({ ...f, [k]: v }));

  const handlePlanChange = (plan: PlanSaas) => {
    const limits = PLAN_LIMITS[plan];
    setForm(f => f ? { ...f, planoSaas: plan, ...limits } : f);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleCepBlur = async () => {
    const cep = fiscal.enderecoFiscal?.cep ?? '';
    if (cep.replace(/\D/g, '').length !== 8) return;
    setFetchingCep(true);
    const data = await fetchCep(cep);
    if (data) {
      setFiscal(f => ({
        ...f,
        enderecoFiscal: {
          ...f.enderecoFiscal,
          cep: cep,
          logradouro: data.logradouro,
          bairro:     data.bairro,
          cidade:     data.localidade,
          estado:     data.uf,
          numero:     f.enderecoFiscal?.numero ?? '',
        },
      }));
    }
    setFetchingCep(false);
  };

  const handleCertSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertFile(file);
    setCert(c => ({ ...c, fileName: file.name }));
  };

  const handleSave = async () => {
    if (!empresa || !form) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<Empresa> = {
        nomeRazaoSocial:  form.nomeRazaoSocial.trim(),
        nomeFantasia:     form.nomeFantasia?.trim() || undefined,
        emailCorporativo: form.emailCorporativo.trim(),
        telefone:         form.telefone?.trim() || undefined,
        planoSaas:        form.planoSaas,
        status:           form.status,
        limiteUsuarios:   Number(form.limiteUsuarios),
        limiteLeadsMes:   Number(form.limiteLeadsMes),
        limiteStorageMb:  Number(form.limiteStorageMb),
        trialExpiraEm:    form.trialExpiraEm ? new Date(form.trialExpiraEm).toISOString() : undefined,
        timezone:         form.timezone.trim(),
        idioma:           form.idioma,
        fiscalSettings:   fiscal,
        certificate:      cert,
        fiscalServices:   services,
      };

      if (!patch.nomeRazaoSocial) throw new Error('Nome da empresa é obrigatório.');
      if (!patch.emailCorporativo) throw new Error('E-mail corporativo é obrigatório.');

      await EmpresaService.updateEmpresa(empresa.id, patch);

      if (logoFile) {
        setUploadingLogo(true);
        const url = await EmpresaService.uploadLogo(empresa.id, logoFile);
        (patch as any).logoUrl = url;
      }

      onSaved({ ...empresa, ...patch });
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  };

  if (!empresa || !form) return null;

  const inputCls  = "w-full h-9 bg-[#0E0F11] border border-white/[0.07] rounded-lg px-3 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4A854]/40 focus:ring-2 focus:ring-[#D4A854]/10 transition-all";
  const selectCls = inputCls + " appearance-none cursor-pointer";
  const labelCls  = "block text-[9px] font-black text-[#8E8E93]/60 uppercase tracking-[0.18em] mb-1.5";

  const Field = ({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) => (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );

  const modalTabs: { id: EditModalTab; label: string; Icon: React.ElementType }[] = [
    { id: 'dados_gerais',  label: 'Dados Gerais',  Icon: Building2 },
    { id: 'dados_fiscais', label: 'Dados Fiscais',  Icon: FileText },
    { id: 'certificado',   label: 'Certificado',    Icon: CertIcon },
    { id: 'servicos',      label: 'Serviços Fiscais', Icon: Briefcase },
  ];

  const certDays = certDaysLeft(cert.expirationDate);
  const certColor = certStatusColor(certDays);

  return (
    <AnimatePresence>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />

        <motion.div initial={{opacity:0,scale:.96,y:16}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.96,y:16}}
          className="relative w-full max-w-xl rounded-[22px] border border-white/[0.07] bg-[#0E0F11]/97 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          onClick={e => e.stopPropagation()}>

          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/40 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
                <Pencil className="w-4 h-4 text-[#D4A854]" />
              </div>
              <div>
                <p className="text-[13px] font-black text-white leading-tight">Editar Empresa</p>
                <p className="text-[10px] text-[#8E8E93]/50">{empresa.nomeRazaoSocial}</p>
              </div>
            </div>
            <button onClick={onClose} disabled={saving}
              className="p-1.5 rounded-lg text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="shrink-0 border-b border-white/[0.05] px-5 flex gap-0 overflow-x-auto">
            {modalTabs.map(t => {
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

            {/* ── Dados Gerais ── */}
            {tab === 'dados_gerais' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl border border-white/[0.07] bg-[#16181B] flex items-center justify-center overflow-hidden shrink-0">
                      {logoPreview || empresa.logoUrl
                        ? <img src={logoPreview ?? empresa.logoUrl} alt="logo" className="w-full h-full object-contain" />
                        : <Building2 className="w-6 h-6 text-[#8E8E93]/30" />}
                    </div>
                    <div>
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-[#8E8E93]/80 hover:border-[#D4A854]/30 hover:text-[#D4A854] transition-all flex items-center gap-1.5">
                        <Upload className="w-3 h-3" /> Alterar logo
                      </button>
                      <p className="text-[9.5px] text-[#8E8E93]/40 mt-1">PNG, JPG ou WebP · máx 2 MB</p>
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoSelect} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Razão Social" span2>
                    <input className={inputCls} value={form.nomeRazaoSocial} onChange={e => set('nomeRazaoSocial', e.target.value)} placeholder="Nome da empresa" />
                  </Field>
                  <Field label="Nome Fantasia" span2>
                    <input className={inputCls} value={form.nomeFantasia ?? ''} onChange={e => set('nomeFantasia', e.target.value)} placeholder="Opcional" />
                  </Field>
                  <Field label="CNPJ" span2>
                    <div className={cn(inputCls, "flex items-center opacity-50 cursor-not-allowed bg-white/[0.02]")}>
                      {formatCnpj(empresa.cnpj)}
                    </div>
                  </Field>
                  <Field label="E-mail Corporativo">
                    <input className={inputCls} type="email" value={form.emailCorporativo} onChange={e => set('emailCorporativo', e.target.value)} placeholder="contato@empresa.com" />
                  </Field>
                  <Field label="Telefone">
                    <input className={inputCls} value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-9999" />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plano">
                    <select className={selectCls} value={form.planoSaas} onChange={e => handlePlanChange(e.target.value as PlanSaas)}>
                      <option value="basico">Básico</option>
                      <option value="profissional">Profissional</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className={selectCls} value={form.status} onChange={e => set('status', e.target.value as StatusEmpresa)}>
                      <option value="trial">Trial</option>
                      <option value="ativo">Ativo</option>
                      <option value="suspenso">Suspenso</option>
                      <option value="inadimplente">Inadimplente</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </Field>
                </div>

                <div>
                  <p className={labelCls}>Limites do Plano</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: 'limiteUsuarios',  label: 'Usuários' },
                      { key: 'limiteLeadsMes',  label: 'Leads/Mês' },
                      { key: 'limiteStorageMb', label: 'Storage MB' },
                    ] as const).map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-[9px] text-[#8E8E93]/50 mb-1">{label}</label>
                        <input type="number" min={0} className={inputCls} value={form[key]}
                          onChange={e => set(key, Number(e.target.value))} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Trial expira em">
                    <input type="date" className={inputCls} value={toDateInput(form.trialExpiraEm)}
                      onChange={e => set('trialExpiraEm', e.target.value)} />
                  </Field>
                  <Field label="Idioma">
                    <select className={selectCls} value={form.idioma} onChange={e => set('idioma', e.target.value)}>
                      <option value="pt-BR">Português (BR)</option>
                      <option value="en-US">English (US)</option>
                      <option value="es-ES">Español</option>
                    </select>
                  </Field>
                  <Field label="Timezone" span2>
                    <input className={inputCls} value={form.timezone} onChange={e => set('timezone', e.target.value)} placeholder="America/Sao_Paulo" />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Dados Fiscais ── */}
            {tab === 'dados_fiscais' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Inscrição Municipal">
                    <input className={inputCls} value={fiscal.inscricaoMunicipal ?? ''} onChange={e => setF('inscricaoMunicipal', e.target.value)} placeholder="000000" />
                  </Field>
                  <Field label="Inscrição Estadual">
                    <input className={inputCls} value={fiscal.inscricaoEstadual ?? ''} onChange={e => setF('inscricaoEstadual', e.target.value)} placeholder="Opcional" />
                  </Field>
                  <Field label="Regime Tributário">
                    <select className={selectCls} value={fiscal.regimeTributario ?? ''} onChange={e => setF('regimeTributario', e.target.value as RegimeTributario)}>
                      <option value="">— Selecionar —</option>
                      <option value="simples_nacional">Simples Nacional</option>
                      <option value="lucro_presumido">Lucro Presumido</option>
                      <option value="lucro_real">Lucro Real</option>
                      <option value="mei">MEI</option>
                    </select>
                  </Field>
                  <Field label="CNAE Principal">
                    <input className={inputCls} value={fiscal.cnaePrincipal ?? ''} onChange={e => setF('cnaePrincipal', e.target.value)} placeholder="6622300" />
                  </Field>
                  <Field label="Código Serviço Padrão">
                    <input className={inputCls} value={fiscal.codigoServicoPadrao ?? ''} onChange={e => setF('codigoServicoPadrao', e.target.value)} placeholder="10.05" />
                  </Field>
                  <Field label="Alíquota ISS (%)">
                    <input className={inputCls} type="number" min={0} max={100} step={0.01} value={fiscal.aliquotaISS ?? ''} onChange={e => setF('aliquotaISS', parseFloat(e.target.value) || 0)} placeholder="2.00" />
                  </Field>
                  <Field label="Código Município IBGE" span2>
                    <input className={inputCls} value={fiscal.codigoMunicipioIBGE ?? ''} onChange={e => setF('codigoMunicipioIBGE', e.target.value)} placeholder="5005400 (Maracaju-MS)" />
                  </Field>
                </div>

                <div>
                  <button type="button" onClick={() => setFiscal(f => ({ ...f, simplesNacional: !f.simplesNacional }))}
                    className="flex items-center gap-2 text-[11px] font-semibold text-white/70 hover:text-white transition-colors">
                    {fiscal.simplesNacional
                      ? <ToggleRight className="w-5 h-5 text-[#D4A854]" />
                      : <ToggleLeft className="w-5 h-5 text-white/30" />}
                    Optante pelo Simples Nacional
                  </button>
                </div>

                <div>
                  <p className={labelCls + ' mt-2'}>Endereço Fiscal</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CEP">
                      <div className="relative">
                        <input className={inputCls + ' pr-8'} value={fiscal.enderecoFiscal?.cep ?? ''} placeholder="79000-000"
                          onChange={e => setFiscal(f => ({ ...f, enderecoFiscal: { ...f.enderecoFiscal, cep: e.target.value } as any }))}
                          onBlur={handleCepBlur} />
                        {fetchingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#D4A854] animate-spin" />}
                        {!fetchingCep && <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />}
                      </div>
                    </Field>
                    <Field label="Número">
                      <input className={inputCls} value={fiscal.enderecoFiscal?.numero ?? ''} placeholder="123"
                        onChange={e => setFiscal(f => ({ ...f, enderecoFiscal: { ...f.enderecoFiscal, numero: e.target.value } as any }))} />
                    </Field>
                    <Field label="Logradouro" span2>
                      <input className={inputCls} value={fiscal.enderecoFiscal?.logradouro ?? ''} placeholder="Rua, Av., ..."
                        onChange={e => setFiscal(f => ({ ...f, enderecoFiscal: { ...f.enderecoFiscal, logradouro: e.target.value } as any }))} />
                    </Field>
                    <Field label="Complemento">
                      <input className={inputCls} value={fiscal.enderecoFiscal?.complemento ?? ''} placeholder="Sala 1..."
                        onChange={e => setFiscal(f => ({ ...f, enderecoFiscal: { ...f.enderecoFiscal, complemento: e.target.value } as any }))} />
                    </Field>
                    <Field label="Bairro">
                      <input className={inputCls} value={fiscal.enderecoFiscal?.bairro ?? ''} placeholder="Bairro"
                        onChange={e => setFiscal(f => ({ ...f, enderecoFiscal: { ...f.enderecoFiscal, bairro: e.target.value } as any }))} />
                    </Field>
                    <Field label="Cidade">
                      <input className={inputCls} value={fiscal.enderecoFiscal?.cidade ?? ''} placeholder="Maracaju"
                        onChange={e => setFiscal(f => ({ ...f, enderecoFiscal: { ...f.enderecoFiscal, cidade: e.target.value } as any }))} />
                    </Field>
                    <Field label="Estado">
                      <input className={inputCls} value={fiscal.enderecoFiscal?.estado ?? ''} placeholder="MS" maxLength={2}
                        onChange={e => setFiscal(f => ({ ...f, enderecoFiscal: { ...f.enderecoFiscal, estado: e.target.value } as any }))} />
                    </Field>
                  </div>
                </div>

                <div>
                  <p className={labelCls + ' mt-2'}>Configurações NFS-e</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Ambiente</label>
                      <select className={selectCls} value={fiscal.nfseEnvironment ?? 'homologacao'} onChange={e => setF('nfseEnvironment', e.target.value as NfseEnvironment)}>
                        <option value="homologacao">Homologação (Testes)</option>
                        <option value="producao">Produção</option>
                      </select>
                      <div className="mt-1.5">
                        {fiscal.nfseEnvironment === 'producao'
                          ? <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">PRODUÇÃO</span>
                          : <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">HOMOLOGAÇÃO</span>}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Provedor</label>
                      <select className={selectCls} value={fiscal.nfseProvider ?? 'betha'} onChange={e => setF('nfseProvider', e.target.value as NfseProvider)}>
                        <option value="betha">Betha Sistemas</option>
                        <option value="ginfes" disabled>GINFES (em breve)</option>
                        <option value="webiss" disabled>WebISS (em breve)</option>
                        <option value="ipm" disabled>IPM (em breve)</option>
                        <option value="abrasf" disabled>ABRASF (em breve)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Certificado Digital ── */}
            {tab === 'certificado' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#D4A854]/15 bg-[#D4A854]/[0.04] p-4">
                  <p className="text-[10px] font-black text-[#D4A854]/80 uppercase tracking-widest mb-1">Certificado A1</p>
                  <p className="text-[11px] text-[#8E8E93]/60">Arquivo .pfx ou .p12 com a chave privada da empresa emissora. Utilizado para assinatura digital dos XMLs.</p>
                </div>

                {/* Upload */}
                <div>
                  <label className={labelCls}>Arquivo do Certificado (.pfx / .p12)</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-9 bg-[#0E0F11] border border-white/[0.07] rounded-lg px-3 flex items-center text-[11px] text-white/50 truncate">
                      {cert.fileName ?? certFile?.name ?? 'Nenhum arquivo selecionado'}
                    </div>
                    <button type="button" onClick={() => certRef.current?.click()}
                      className="h-9 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-[#8E8E93]/80 hover:border-[#D4A854]/30 hover:text-[#D4A854] transition-all flex items-center gap-1.5 shrink-0">
                      <Upload className="w-3.5 h-3.5" /> Selecionar
                    </button>
                    <input ref={certRef} type="file" accept=".pfx,.p12" className="hidden" onChange={handleCertSelect} />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className={labelCls}>Senha do Certificado</label>
                  <input type="password" className={inputCls} value={cert.password ?? ''} onChange={e => setCert(c => ({ ...c, password: e.target.value }))} placeholder="Senha do arquivo .pfx" />
                  <p className="text-[9.5px] text-[#8E8E93]/40 mt-1">A senha é armazenada de forma criptografada.</p>
                </div>

                {/* Validade */}
                <div>
                  <label className={labelCls}>Data de Validade</label>
                  <input type="date" className={inputCls} value={cert.expirationDate ? cert.expirationDate.slice(0, 10) : ''} onChange={e => setCert(c => ({ ...c, expirationDate: e.target.value }))} />
                </div>

                {/* Status card */}
                {cert.expirationDate && (
                  <div className="rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: `${certColor}30`, background: `${certColor}08` }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${certColor}15`, border: `1px solid ${certColor}30` }}>
                      <CertIcon className="w-4 h-4" style={{ color: certColor }} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-white">
                        {certDays !== null && certDays > 0
                          ? `Válido por mais ${certDays} dia${certDays !== 1 ? 's' : ''}`
                          : certDays === 0
                          ? 'Vence hoje!'
                          : 'Certificado vencido'}
                      </p>
                      <p className="text-[9.5px] text-[#8E8E93]/50">
                        Expira em {new Date(cert.expirationDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Serviços Fiscais ── */}
            {tab === 'servicos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-white/60">{services.length} serviço{services.length !== 1 ? 's' : ''} cadastrado{services.length !== 1 ? 's' : ''}</p>
                  <button type="button" onClick={() => setEditSvc({ id: crypto.randomUUID(), ativo: true, aliquotaISS: fiscal.aliquotaISS ?? 2 })}
                    className="h-8 px-3 rounded-lg border border-[#D4A854]/20 bg-[#D4A854]/[0.06] text-[10px] font-black text-[#D4A854]/80 hover:text-[#D4A854] transition-all flex items-center gap-1.5">
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>

                {/* Service form */}
                {editSvc && (
                  <div className="rounded-xl border border-[#D4A854]/20 bg-[#D4A854]/[0.04] p-4 space-y-3">
                    <p className="text-[10px] font-black text-[#D4A854]/80 uppercase tracking-widest">{editSvc.descricao ? 'Editar Serviço' : 'Novo Serviço'}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className={labelCls}>Descrição</label>
                        <input className={inputCls} value={editSvc.descricao ?? ''} onChange={e => setEditSvc(s => ({ ...s, descricao: e.target.value }))} placeholder="Corretagem de Seguros" />
                      </div>
                      <div>
                        <label className={labelCls}>Item Lista Serviço</label>
                        <input className={inputCls} value={editSvc.itemListaServico ?? ''} onChange={e => setEditSvc(s => ({ ...s, itemListaServico: e.target.value }))} placeholder="10.05" />
                      </div>
                      <div>
                        <label className={labelCls}>Código Serviço Municipal</label>
                        <input className={inputCls} value={editSvc.codigoServicoMunicipal ?? ''} onChange={e => setEditSvc(s => ({ ...s, codigoServicoMunicipal: e.target.value }))} placeholder="Opcional" />
                      </div>
                      <div>
                        <label className={labelCls}>CNAE</label>
                        <input className={inputCls} value={editSvc.cnae ?? ''} onChange={e => setEditSvc(s => ({ ...s, cnae: e.target.value }))} placeholder="6622300" />
                      </div>
                      <div>
                        <label className={labelCls}>Alíquota ISS (%)</label>
                        <input className={inputCls} type="number" min={0} max={100} step={0.01} value={editSvc.aliquotaISS ?? ''} onChange={e => setEditSvc(s => ({ ...s, aliquotaISS: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>Observações Padrão</label>
                        <input className={inputCls} value={editSvc.observacoesPadrao ?? ''} onChange={e => setEditSvc(s => ({ ...s, observacoesPadrao: e.target.value }))} placeholder="Texto que aparecerá automaticamente nas notas" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => {
                        if (!editSvc.descricao || !editSvc.itemListaServico) return;
                        const svc = editSvc as FiscalService;
                        setServices(prev => {
                          const exists = prev.findIndex(s => s.id === svc.id);
                          return exists >= 0
                            ? prev.map(s => s.id === svc.id ? svc : s)
                            : [...prev, svc];
                        });
                        setEditSvc(null);
                      }} className="h-8 px-4 rounded-lg bg-[#D4A854] text-[#050505] text-[10px] font-black uppercase tracking-wide hover:bg-[#C49844] transition-all">
                        Salvar Serviço
                      </button>
                      <button type="button" onClick={() => setEditSvc(null)}
                        className="h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold text-[#8E8E93]/80 hover:text-white transition-all">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Services list */}
                {services.length > 0 && (
                  <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                    {services.map(svc => (
                      <div key={svc.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-white truncate">{svc.descricao}</p>
                          <p className="text-[9.5px] text-[#8E8E93]/50">Item {svc.itemListaServico} · ISS {svc.aliquotaISS}%{svc.cnae ? ` · CNAE ${svc.cnae}` : ''}</p>
                        </div>
                        <button type="button" onClick={() => setServices(s => s.map(sv => sv.id === svc.id ? { ...sv, ativo: !sv.ativo } : sv))}
                          className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded transition-all',
                            svc.ativo ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-white/[0.03] text-white/30 border border-white/[0.07]',
                          )}>
                          {svc.ativo ? 'Ativo' : 'Inativo'}
                        </button>
                        <button type="button" onClick={() => setEditSvc(svc)}
                          className="w-6 h-6 rounded-lg border border-white/[0.07] flex items-center justify-center text-[#8E8E93]/50 hover:text-blue-400 hover:border-blue-400/30 transition-all">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => setServices(s => s.filter(sv => sv.id !== svc.id))}
                          className="w-6 h-6 rounded-lg border border-red-500/20 bg-red-500/[0.04] flex items-center justify-center text-red-400/60 hover:text-red-400 hover:border-red-500/40 transition-all">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {services.length === 0 && !editSvc && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Briefcase className="w-8 h-8 text-[#8E8E93]/20" />
                    <p className="text-[11px] text-white/30">Nenhum serviço cadastrado</p>
                    <p className="text-[10px] text-[#8E8E93]/30 text-center max-w-xs">Exemplo: Corretagem de Seguros · Item 10.05 · ISS 2%</p>
                  </div>
                )}
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
          <div className="px-5 py-4 border-t border-white/[0.05] shrink-0 flex items-center justify-end gap-3">
            <button onClick={onClose} disabled={saving}
              className="h-9 px-4 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-[#8E8E93]/80 hover:border-white/15 hover:text-white transition-all disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-5 rounded-lg bg-[#D4A854] text-[#050505] text-[11px] font-black uppercase tracking-wide flex items-center gap-2 hover:bg-[#C49844] transition-all disabled:opacity-60">
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{uploadingLogo ? 'Enviando logo...' : 'Salvando...'}</>
                : <><Save className="w-3.5 h-3.5" />Salvar alterações</>}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Detail drawer (read-only) ─────────────────────────────────────────────────

function DetailDrawer({ empresa, onClose, onEdit }: { empresa: Empresa|null; onClose(): void; onEdit(): void }) {
  if (!empresa) return null;
  const daysLeft = calcDaysLeft(empresa.trialExpiraEm);
  const rows = [
    { label:'CNPJ',            value: formatCnpj(empresa.cnpj) },
    { label:'E-mail',          value: empresa.emailCorporativo },
    { label:'Telefone',        value: empresa.telefone ?? '—' },
    { label:'Slug',            value: empresa.slug },
    { label:'Plano',           value: PLAN_LABEL[empresa.planoSaas] ?? empresa.planoSaas },
    { label:'Status',          value: empresa.status },
    { label:'Limite usuários', value: String(empresa.limiteUsuarios) },
    { label:'Limite leads/mês',value: empresa.limiteLeadsMes.toLocaleString('pt-BR') },
    { label:'Storage (MB)',    value: empresa.limiteStorageMb.toLocaleString('pt-BR') },
    { label:'Timezone',        value: empresa.timezone },
    { label:'Idioma',          value: empresa.idioma },
    { label:'Criado em',       value: formatDate(empresa.criadoEm) },
    { label:'Atualizado em',   value: formatDate(empresa.atualizadoEm) },
    ...(empresa.trialExpiraEm ? [{ label:'Trial expira', value:`${formatDate(empresa.trialExpiraEm)} (${daysLeft ?? 0}d)` }] : []),
  ];
  return (
    <AnimatePresence>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4">
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:30}}
          className="relative w-full max-w-md rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/40 to-transparent" />
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
                {empresa.logoUrl
                  ? <img src={empresa.logoUrl} alt="logo" className="w-full h-full object-contain rounded-lg" />
                  : <Building2 className="w-4 h-4 text-[#D4A854]" />}
              </div>
              <div>
                <p className="text-[12px] font-black text-white">{empresa.nomeRazaoSocial}</p>
                {empresa.nomeFantasia && <p className="text-[10px] text-[#8E8E93]/60">{empresa.nomeFantasia}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={onEdit}
                className="h-7 px-3 rounded-lg border border-[#D4A854]/20 bg-[#D4A854]/[0.06] text-[10px] font-black text-[#D4A854]/80 hover:text-[#D4A854] hover:border-[#D4A854]/40 transition-all flex items-center gap-1.5">
                <Pencil className="w-3 h-3" /> Editar
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg text-[#8E8E93]/60 hover:text-white hover:bg-white/[0.06] transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="p-5 space-y-2.5 max-h-[60vh] overflow-y-auto">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <span className="text-[9px] font-bold text-[#8E8E93]/60 uppercase tracking-[0.15em] shrink-0">{label}</span>
                <span className="text-[11px] font-semibold text-white/80 text-right truncate">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

type SortField = 'nomeRazaoSocial'|'status'|'planoSaas'|'criadoEm';

export function EmpresasManagement() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [userCounts, setUserCounts]   = useState<Record<string, number>>({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [sortField, setSortField]     = useState<SortField>('criadoEm');
  const [sortDir, setSortDir]         = useState<'asc'|'desc'>('desc');

  // modals
  const [confirmStatus, setConfirmStatus] = useState<{ empresa: Empresa; next: StatusEmpresa } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [detailEmpresa, setDetailEmpresa] = useState<Empresa | null>(null);
  const [editEmpresa,   setEditEmpresa]   = useState<Empresa | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<Empresa | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showNew,       setShowNew]       = useState(false);

  const fetchEmpresas = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await EmpresaService.listEmpresas();
      setEmpresas(list);
      // Fetch user counts in background
      const counts: Record<string, number> = {};
      await Promise.all(list.map(async e => {
        counts[e.id] = await EmpresaService.countUsuarios(e.organizationId);
      }));
      setUserCounts(counts);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmpresas(); }, [fetchEmpresas]);

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setSortDir('asc'); return field;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let r = empresas.filter(e =>
      !q || e.nomeRazaoSocial.toLowerCase().includes(q) ||
      (e.nomeFantasia ?? '').toLowerCase().includes(q) ||
      e.cnpj.replace(/\D/g,'').includes(q.replace(/\D/g,''))
    );
    r = [...r].sort((a, b) => {
      const av = a[sortField] ?? '', bv = b[sortField] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'pt-BR', { sensitivity:'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [empresas, search, sortField, sortDir]);

  // Status change
  const handleStatusConfirm = useCallback(async () => {
    if (!confirmStatus) return;
    setStatusLoading(true);
    try {
      await EmpresaService.setStatus(confirmStatus.empresa.id, confirmStatus.next);
      setEmpresas(prev => prev.map(e => e.id === confirmStatus.empresa.id ? { ...e, status: confirmStatus.next } : e));
      setConfirmStatus(null);
    } finally { setStatusLoading(false); }
  }, [confirmStatus]);

  // Edit saved
  const handleEditSaved = useCallback((updated: Empresa) => {
    setEmpresas(prev => prev.map(e => e.id === updated.id ? updated : e));
    setDetailEmpresa(null);
  }, []);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await EmpresaService.deleteEmpresa(deleteTarget.id);
      setEmpresas(prev => prev.filter(e => e.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: any) {
      console.error('[EmpresasManagement] delete error:', e);
    } finally { setDeleteLoading(false); }
  }, [deleteTarget]);

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button onClick={() => handleSort(field)} className="inline-flex items-center gap-1 group hover:text-white transition-colors">
      <span>{label}</span>
      <span className="flex flex-col -space-y-0.5">
        <ChevronUp className={cn('w-2.5 h-2.5', sortField===field&&sortDir==='asc' ? 'text-[#D4A854]' : 'text-white/20 group-hover:text-white/40')} />
        <ChevronDown className={cn('w-2.5 h-2.5', sortField===field&&sortDir==='desc' ? 'text-[#D4A854]' : 'text-white/20 group-hover:text-white/40')} />
      </span>
    </button>
  );

  if (showNew) {
    return (
      <CompanyRegistration
        pageMode
        onBack={() => setShowNew(false)}
        onSuccess={() => { setShowNew(false); fetchEmpresas(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#050505] overflow-hidden">
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <motion.div initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}} className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#D4A854]/[0.08] border border-[#D4A854]/15 flex items-center justify-center">
            <Building2 className="w-4.5 h-4.5 text-[#D4A854]" style={{width:18,height:18}} />
          </div>
          <h1 className="text-[18px] font-black text-white tracking-tight">Gestão de Empresas</h1>
        </div>
        <p className="text-[11px] text-[#8E8E93]/60 ml-12">
          {empresas.length} empresa{empresas.length!==1?'s':''} cadastrada{empresas.length!==1?'s':''}
        </p>
      </motion.div>

      {/* Toolbar */}
      <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:.05}} className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 pointer-events-none" />
          <input type="text" placeholder="Buscar por nome ou CNPJ..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 bg-[#16181B] border border-white/[0.07] rounded-lg pl-9 pr-3.5 text-[12px] font-medium text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4A854]/40 focus:ring-2 focus:ring-[#D4A854]/10 transition-all" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]/40 hover:text-white/60 transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <button onClick={fetchEmpresas} disabled={loading}
          className="h-9 px-3.5 rounded-lg border border-white/[0.07] bg-[#16181B] text-[#8E8E93]/70 hover:border-white/[0.15] hover:text-white transition-all disabled:opacity-50 flex items-center gap-2 text-[11px] font-semibold">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
        </button>
        <button onClick={() => setShowNew(true)}
          className="h-9 px-4 rounded-lg bg-[#D4A854] text-[#050505] text-[11px] font-black uppercase tracking-wide flex items-center gap-2 hover:bg-[#C49844] transition-all sm:ml-auto">
          <Plus className="w-3.5 h-3.5" /> Nova Empresa
        </button>
      </motion.div>

      {error && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] mb-4">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[12px] text-red-400">{error}</p>
          <button onClick={fetchEmpresas} className="ml-auto text-[11px] font-semibold text-red-400 hover:text-red-300 underline">Tentar novamente</button>
        </motion.div>
      )}

      {/* Table */}
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:.1}}
        className="rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/85 backdrop-blur-xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.4)]">

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#8E8E93]/30" />
            </div>
            <p className="text-[13px] font-semibold text-white/40">
              {search ? `Sem resultados para "${search}"` : 'Nenhuma empresa cadastrada'}
            </p>
            {search && <button onClick={() => setSearch('')} className="text-[11px] text-[#D4A854]/80 hover:text-[#D4A854] underline">Limpar busca</button>}
          </div>
        )}

        {(loading || filtered.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.015]">
                  {[
                    { col: <SortHeader field="nomeRazaoSocial" label="Empresa" />, cls: '' },
                    { col: 'CNPJ', cls: 'hidden sm:table-cell' },
                    { col: <SortHeader field="planoSaas" label="Plano" />, cls: 'hidden md:table-cell' },
                    { col: <SortHeader field="status" label="Status" />, cls: '' },
                    { col: 'Usuários', cls: 'hidden lg:table-cell' },
                    { col: 'Trial / Criação', cls: 'hidden lg:table-cell' },
                    { col: 'Ações', right: true, cls: '' },
                  ].map(({ col, right, cls }, i) => (
                    <th key={i} className={cn('px-4 py-3', right && 'text-right', cls)}>
                      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8E8E93]/70">{col}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({length:5}).map((_,i) => <SkeletonRow key={i} />)
                  : filtered.map((e, idx) => {
                    const daysLeft = calcDaysLeft(e.trialExpiraEm);
                    const expiring = e.status === 'trial' && daysLeft !== null && daysLeft <= 3;
                    return (
                      <motion.tr key={e.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:idx*.03}}
                        className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors group">

                        {/* Name */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-[#D4A854]/[0.06] border border-[#D4A854]/10 flex items-center justify-center shrink-0 overflow-hidden">
                              {e.logoUrl
                                ? <img src={e.logoUrl} alt={e.nomeRazaoSocial} className="w-full h-full object-contain" />
                                : <Building2 className="w-3.5 h-3.5 text-[#D4A854]/50" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold text-white truncate max-w-[180px]">{e.nomeRazaoSocial}</p>
                              {e.nomeFantasia && <p className="text-[10px] text-[#8E8E93]/50 truncate max-w-[180px]">{e.nomeFantasia}</p>}
                            </div>
                          </div>
                        </td>

                        {/* CNPJ */}
                        <td className="px-4 py-3.5 hidden sm:table-cell">
                          <span className="text-[11px] font-mono text-white/60">{formatCnpj(e.cnpj)}</span>
                        </td>

                        {/* Plan */}
                        <td className="px-4 py-3.5 hidden md:table-cell"><PlanBadge plan={e.planoSaas} /></td>

                        {/* Status */}
                        <td className="px-4 py-3.5"><StatusBadge status={e.status} /></td>

                        {/* Users */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                            <Users className="w-3 h-3 text-[#8E8E93]/40" />
                            <span>{userCounts[e.id] ?? '—'} / {e.limiteUsuarios}</span>
                          </div>
                        </td>

                        {/* Trial/Date */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          {e.status === 'trial' && e.trialExpiraEm ? (
                            <div className="space-y-0.5">
                              <p className={cn('text-[11px] font-semibold', expiring ? 'text-red-400' : 'text-[#FBBF24]/80')}>
                                {daysLeft !== null ? `${daysLeft}d restantes` : '—'}
                              </p>
                              <p className="text-[9.5px] text-[#8E8E93]/50">expira {formatDate(e.trialExpiraEm)}</p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-white/50">{formatDate(e.criadoEm)}</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setDetailEmpresa(e)} title="Ver detalhes"
                              className="w-7 h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] flex items-center justify-center text-[#8E8E93]/60 hover:border-[#D4A854]/30 hover:text-[#D4A854] transition-all">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditEmpresa(e)} title="Editar"
                              className="w-7 h-7 rounded-lg border border-white/[0.07] bg-white/[0.03] flex items-center justify-center text-[#8E8E93]/60 hover:border-blue-400/30 hover:text-blue-400 transition-all">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {e.status !== 'ativo' && (
                              <button onClick={() => setConfirmStatus({ empresa:e, next:'ativo' })} title="Ativar"
                                className="w-7 h-7 rounded-lg border border-green-500/20 bg-green-500/[0.06] flex items-center justify-center text-green-400/70 hover:text-green-400 hover:border-green-500/40 transition-all">
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {e.status !== 'suspenso' && e.status !== 'cancelado' && (
                              <button onClick={() => setConfirmStatus({ empresa:e, next:'suspenso' })} title="Suspender"
                                className="w-7 h-7 rounded-lg border border-yellow-500/20 bg-yellow-500/[0.06] flex items-center justify-center text-yellow-400/70 hover:text-yellow-400 hover:border-yellow-500/40 transition-all">
                                <ShieldOff className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => setDeleteTarget(e)} title="Excluir"
                              className="w-7 h-7 rounded-lg border border-red-500/20 bg-red-500/[0.06] flex items-center justify-center text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01]">
            <p className="text-[9.5px] text-[#8E8E93]/40">
              Exibindo {filtered.length} de {empresas.length} empresa{empresas.length!==1?'s':''}
            </p>
          </div>
        )}
      </motion.div>

      {/* ── Modals ── */}

      <ConfirmStatusModal
        open={!!confirmStatus} empresa={confirmStatus?.empresa ?? null} nextStatus={confirmStatus?.next ?? null}
        onConfirm={handleStatusConfirm} onCancel={() => !statusLoading && setConfirmStatus(null)} loading={statusLoading}
      />

      <DetailDrawer
        empresa={detailEmpresa} onClose={() => setDetailEmpresa(null)}
        onEdit={() => { setEditEmpresa(detailEmpresa); setDetailEmpresa(null); }}
      />

      <EditModal
        empresa={editEmpresa} onClose={() => setEditEmpresa(null)} onSaved={handleEditSaved}
      />

      <DeleteModal
        empresa={deleteTarget} onConfirm={handleDelete} onCancel={() => !deleteLoading && setDeleteTarget(null)} loading={deleteLoading}
      />

    </div>
    </div>
  );
}

export default EmpresasManagement;
