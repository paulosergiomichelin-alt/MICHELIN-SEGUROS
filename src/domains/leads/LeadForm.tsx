
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  X, Save, Trash2, FileUp, Loader2, MapPin, Sparkles, CheckCircle2, 
  AlertCircle, Download, Eye, Users, ChevronDown, ChevronUp, 
  Flame, Thermometer, Bot, User as UserIcon, Calendar, Clock, Lock as LockIcon,
  FilePlus, PhoneCall, Smartphone, ShieldCheck, Mail, ClipboardList, Info,
  GripVertical, UserCheck, Briefcase, Car, Wallet, FileText, Upload, Filter,
  Target, TrendingUp, Search, FileCheck, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PDFViewer } from '../../components/PDFViewer';
import { useViewport } from '../../hooks/useAppContexts';
import { Lead, LeadStatus, LeadTemperature, AgentConfig, UserProfile, LeadDocument, DocumentProcessingStage } from '../../types';
import { agentService } from '../../services/agentService';
import { validateLead } from '../../lib/validation';
import { cn, formatCPF, validateCPF, generateId } from '../../lib/utils';
import { format, differenceInYears, differenceInMonths, differenceInDays, addYears, addMonths, isValid, parseISO } from 'date-fns';
import { StorageService } from '../../services/StorageService';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { logger } from '../../services/LoggerService';
import { standardizeLeadData } from '../../lib/lead-utils';
import { DataService } from '../../services/DataService';
import { auth } from '../../lib/firebase';
import { OCRService } from '../../services/OCRService';
import { DocumentSessionController, DocumentPipelineState } from '../../services/document-engine/DocumentSessionController';
import { UniversalDocumentViewer } from '../../components/UniversalDocumentViewer';
import { buildAggerQuoteUrl, buildAggerPayload } from '../../lib/agger-quote';
import { useAggerUserscriptInstalled, EXTENSION_ID } from '../../lib/agger-userscript';

interface LeadFormProps {
  lead?: Lead | null;
  onSave: (lead: Lead, options?: { silent?: boolean }) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  onNavigateToLead?: (lead: Lead) => void;
  agentConfig?: AgentConfig;
  pageMode?: boolean;
}

const INITIAL_LEAD: Partial<Lead> = {
  status: 'Novo Lead',
  temperature: 'morno',
  hasInsurance: false,
  isDifferentResidenceZip: false,
  fiduciaryAlienation: false,
  serviceUsage: false,
  youngDriverHousehold: false,
  isOwnerDriver: true,
  iaActive: true,
  phone: '',
  origin: 'Manual',
  documents: {},
  perfilUso: { comercial: false, condutorJovem: false },
};

// --- HELPER WRAPPERS ---

const formatPhone = (value: string) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength <= 2) return phoneNumber;
  if (phoneNumberLength <= 6) {
    return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2)}`;
  }
  if (phoneNumberLength <= 10) {
    return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2, 6)}-${phoneNumber.slice(6)}`;
  }
  return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2, 7)}-${phoneNumber.slice(7, 11)}`;
};

const formatCpf = (value: string) => {
  if (!value) return value;
  const numbers = value.replace(/\D/g, '');
  let result = '';
  for (let i = 0; i < numbers.length && i < 11; i++) {
    if (i === 3 || i === 6) result += '.';
    if (i === 9) result += '-';
    result += numbers[i];
  }
  return result;
};

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '---';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, 'dd/MM/yyyy');
  } catch (e) {
    return dateStr;
  }
};

/** Parse "YYYY-MM-DD" or ISO into a Date or null. */
const parseSafeDate = (raw?: string | null): Date | null => {
  if (!raw) return null;
  try {
    const d = raw.length === 10 ? parseISO(raw) : new Date(raw);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
};

/** "31 anos" — based on the given birth date string. */
const calculateAge = (birthDate?: string | null): string => {
  const d = parseSafeDate(birthDate);
  if (!d) return '';
  const years = differenceInYears(new Date(), d);
  if (years < 0 || years > 130) return '';
  return `${years} anos`;
};

/**
 * "10 meses e 11 dias" — time remaining until the next anniversary (birthday or
 * vigência end). When the target is today, returns "Hoje". When it has already
 * passed within the current year window, returns the next cycle's countdown.
 */
const formatCountdownToNext = (targetDate?: string | null, options: { recurringYearly?: boolean } = {}): string => {
  const target = parseSafeDate(targetDate);
  if (!target) return '';

  const now = new Date();
  let next = target;

  if (options.recurringYearly) {
    next = new Date(now.getFullYear(), target.getMonth(), target.getDate());
    if (next.getTime() < now.getTime()) {
      next = addYears(next, 1);
    }
  }

  const diffMs = next.getTime() - now.getTime();
  if (diffMs <= 0) return options.recurringYearly ? 'Hoje' : 'Vencido';

  // Use date-fns diffs anchored on the wall clock, not raw ms, so DST doesn't
  // shift the month/day counts by one.
  const months = differenceInMonths(next, now);
  const monthsAnchor = addMonths(now, months);
  const days = differenceInDays(next, monthsAnchor);

  const monthLabel = months === 1 ? 'mês' : 'meses';
  const dayLabel = days === 1 ? 'dia' : 'dias';

  if (months === 0) return `${days} ${dayLabel}`;
  if (days === 0) return `${months} ${monthLabel}`;
  return `${months} ${monthLabel} e ${days} ${dayLabel}`;
};

// --- UI COMPONENTS ---

const PremiumSection = React.memo(({ title, subtitle, icon: Icon, children, badge }: any) => (
  <div className="relative rounded-[20px] border border-white/[0.06] bg-[#0E0F11]/85 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-hidden mb-5 transition-colors hover:border-[#D4A854]/20 ring-1 ring-[#D4A854]/[0.04]">
    {/* Subtle gold gradient sheen on the very top edge for premium feel */}
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A854]/30 to-transparent" />
    <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/[0.04] bg-gradient-to-r from-[#D4A854]/[0.03] to-transparent">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#D4A854]/[0.08] text-[#D4A854] ring-1 ring-[#D4A854]/15 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col leading-tight">
          <h4 className="text-[10.5px] font-black uppercase tracking-[0.22em] text-[#D4A854]/95 flex items-center gap-2">
            {title}
          </h4>
          {subtitle && (
            <p className="text-[8.5px] text-[#8E8E93]/70 font-semibold uppercase tracking-[0.18em] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {badge}
    </div>
    <div className="p-5">
      {children}
    </div>
  </div>
));

const PremiumInput = React.memo(({ label, icon: Icon, required, readOnly, ...props }: any) => (
  <div className="space-y-1 w-full group">
    <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5 group-focus-within:text-[#D4A854] transition-colors">
      {label} {required && <span className="text-red-500/80">*</span>}
    </label>
    <div className="relative">
      <input
        {...props}
        className={cn(
          "w-full h-10 bg-[#16181B] border border-white/[0.07] rounded-lg px-3.5 text-[12px] font-medium text-white transition-all duration-200 focus:ring-2 focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)] hover:border-white/15 placeholder:text-white/15 outline-none",
          props.className,
          Icon && "pl-10",
          readOnly && "opacity-60 cursor-not-allowed bg-white/[0.015]"
        )}
        readOnly={readOnly}
      />
      {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 group-focus-within:text-[#D4A854]/70 transition-colors pointer-events-none" />}
    </div>
  </div>
));

const PremiumSelect = React.memo(({ label, icon: Icon, required, options, ...props }: any) => (
  <div className="space-y-1 w-full group">
    <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5 group-focus-within:text-[#D4A854] transition-colors">
      {label} {required && <span className="text-red-500/80">*</span>}
    </label>
    <div className="relative">
      <select
        {...props}
        className={cn(
          "w-full h-10 bg-[#16181B] border border-white/[0.07] rounded-lg px-3.5 pr-9 text-[12px] font-medium text-white transition-all duration-200 focus:ring-2 focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)] hover:border-white/15 outline-none appearance-none cursor-pointer",
          props.className,
          Icon && "pl-10"
        )}
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value} className="bg-[#111214]">{opt.label}</option>
        ))}
      </select>
      {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 group-focus-within:text-[#D4A854]/70 transition-colors pointer-events-none" />}
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E8E93]/40 pointer-events-none" />
    </div>
  </div>
));

/**
 * CPF input com máscara em tempo real e validação mod-11 inline.
 * Borda verde quando válido, vermelha quando incompleto/inválido, neutra quando vazio.
 */
const PremiumCpfInput = React.memo(({ label, name, value, onChange, onBlur, required, placeholder }: any) => {
  const digits = (value || '').replace(/\D/g, '');
  const hasContent = digits.length > 0;
  const isComplete = digits.length === 11;
  const isValidCpf = isComplete && validateCPF(digits);
  const status: 'idle' | 'partial' | 'invalid' | 'valid' = !hasContent
    ? 'idle'
    : !isComplete
      ? 'partial'
      : isValidCpf
        ? 'valid'
        : 'invalid';

  return (
    <div className="space-y-1 w-full group">
      <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5 group-focus-within:text-[#D4A854] transition-colors flex items-center gap-2">
        <span>{label} {required && <span className="text-red-500/80">*</span>}</span>
        {status === 'valid' && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full bg-emerald-500/10 text-[8px] font-bold uppercase tracking-wide text-emerald-300/90 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> OK
          </span>
        )}
        {status === 'invalid' && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full bg-red-500/10 text-[8px] font-bold uppercase tracking-wide text-red-300/90 border border-red-500/20">
            <AlertCircle className="w-2.5 h-2.5" /> Inválido
          </span>
        )}
      </label>
      <div className="relative">
        <input
          name={name}
          value={value || ''}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          placeholder={placeholder || '000.000.000-00'}
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          className={cn(
            'w-full h-10 bg-[#16181B] border rounded-lg px-3.5 pr-9 text-[12px] font-medium text-white tracking-wider transition-all duration-200 focus:ring-2 outline-none placeholder:text-white/15 hover:border-white/15',
            status === 'idle' && 'border-white/[0.07] focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)]',
            status === 'partial' && 'border-white/[0.07] focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)]',
            status === 'valid' && 'border-emerald-500/50 focus:ring-emerald-500/25 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.06)]',
            status === 'invalid' && 'border-red-500/50 focus:ring-red-500/25 focus:shadow-[0_0_0_4px_rgba(239,68,68,0.06)]'
          )}
        />
        {status === 'valid' && (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400" />
        )}
        {status === 'invalid' && (
          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-400" />
        )}
      </div>
    </div>
  );
});

/**
 * Campo readonly enxuto para valores auto-calculados (idade, aniversário, fim
 * de vigência). Mostra placeholder discreto quando vazio.
 */
const PremiumComputedField = React.memo(({ label, value, icon: Icon, tone = 'gold', emptyLabel }: any) => {
  const isEmpty = !value;
  return (
    <div className="space-y-1 w-full">
      <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5">{label}</label>
      <div
        className={cn(
          'w-full h-10 rounded-lg px-3.5 flex items-center justify-between gap-2 border transition-colors',
          tone === 'gold' && 'bg-[#D4A854]/[0.05] border-[#D4A854]/15',
          tone === 'mint' && 'bg-emerald-500/[0.06] border-emerald-500/15',
          tone === 'sky' && 'bg-sky-500/[0.06] border-sky-500/15',
          isEmpty && 'opacity-50'
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && (
            <Icon
              className={cn(
                'w-3 h-3 shrink-0',
                tone === 'gold' && 'text-[#D4A854]',
                tone === 'mint' && 'text-emerald-400',
                tone === 'sky' && 'text-sky-400'
              )}
            />
          )}
          <span
            className={cn(
              'text-[11.5px] font-bold tracking-wide truncate',
              tone === 'gold' && 'text-[#D4A854]',
              tone === 'mint' && 'text-emerald-300',
              tone === 'sky' && 'text-sky-300'
            )}
          >
            {value || emptyLabel || '—'}
          </span>
        </div>
        <LockIcon className="w-2.5 h-2.5 text-white/15 shrink-0" />
      </div>
    </div>
  );
});

/**
 * Linha "LABEL: [dropdown]" — usado para Status e Temperatura em layout
 * horizontal compacto. Substitui o card vertical antigo.
 */
const PremiumInlineSelect = React.memo(({ label, icon: Icon, name, value, onChange, options, accent }: any) => (
  <div
    className={cn(
      'h-11 bg-[#0E0F11]/85 backdrop-blur-xl border border-white/[0.06] rounded-xl px-3 flex items-center gap-2.5 transition-all hover:border-[#D4A854]/20 shadow-[0_4px_18px_rgba(0,0,0,0.25)] ring-1 ring-[#D4A854]/[0.03]',
      accent
    )}
  >
    {Icon && (
      <div className="w-6 h-6 rounded-md bg-[#D4A854]/[0.1] text-[#D4A854] flex items-center justify-center shrink-0 ring-1 ring-[#D4A854]/15">
        <Icon className="w-3 h-3" />
      </div>
    )}
    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#D4A854]/85 whitespace-nowrap">
      {label}
    </span>
    <div className="relative flex-1 min-w-0">
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="w-full h-8 bg-[#16181B] border border-white/[0.07] rounded-md pl-2.5 pr-7 text-[11.5px] font-semibold text-white outline-none appearance-none cursor-pointer transition-all focus:ring-2 focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40 hover:border-white/15"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value} className="bg-[#111214]">{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8E8E93]/60 pointer-events-none" />
    </div>
  </div>
));

const PremiumCardToggle = React.memo(({ label, description, icon: Icon, active, onChange }: any) => (
  <button
    type="button"
    onClick={() => onChange(!active)}
    aria-pressed={!!active}
    className={cn(
      "p-4 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer group select-none relative overflow-hidden text-left h-[120px] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A85460]",
      active
        ? "bg-[#D4A85408] border-[#D4A85440] ring-1 ring-[#D4A85420] shadow-[0_0_20px_rgba(212,168,84,0.05)]"
        : "bg-[#1A1C1E] border-white/5 hover:border-white/10 hover:bg-[#1C1E20]"
    )}
  >
    <div className={cn(
      "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0",
      active ? "bg-[#D4A854] text-black scale-105" : "bg-white/5 text-[#8E8E93]/40 group-hover:bg-white/10"
    )}>
      <Icon className="w-4.5 h-4.5" />
    </div>
    <div className="flex-1 min-w-0 pr-7">
      <p className={cn("text-[10.5px] font-black uppercase tracking-tight transition-colors leading-tight", active ? "text-[#D4A854]" : "text-white")}>{label}</p>
      <p className="text-[9px] text-[#8E8E93] font-medium leading-snug mt-1 opacity-70 line-clamp-3">{description}</p>
    </div>
    <div className={cn(
      "absolute top-4 right-4 w-5 h-5 rounded-md border transition-all flex items-center justify-center",
      active ? "bg-[#D4A854] border-[#D4A854]" : "border-white/10 bg-black/20"
    )}>
      {active && <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />}
    </div>
  </button>
));

// --- COMPONENTS ---
// --- COMPONENTS ---

const DocUploadCard = React.memo(({ label, type, icon: Icon, hasFile, fileName, fileUrl, onUpload, onView, onDelete, loading, error }: any) => (
  <div 
    onClick={() => !hasFile && !loading && onUpload(type)}
    className={cn(
      "relative group cursor-pointer p-5 h-36 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center text-center gap-3 overflow-hidden", 
      error ? "border-red-500/50 bg-red-500/5 shadow-inner" :
      hasFile 
        ? "border-[#25D36630] bg-[#25D36605] shadow-inner" 
        : "border-white/5 bg-[#1A1C1E] hover:border-[#D4A85440] hover:bg-[#D4A85408]"
    )}
  >
    {loading ? (
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="w-10 h-10 animate-spin text-[#D4A854]" />
        <span className="text-[8px] font-black uppercase text-[#D4A854] animate-pulse">Processando...</span>
      </div>
    ) : error ? (
      <div className="flex flex-col items-center gap-1">
        <AlertCircle className="w-8 h-8 text-red-500 mb-1" />
        <span className="text-[7px] font-black uppercase text-red-500 leading-tight">Falha Técnica</span>
        <p className="text-[6px] text-red-400 font-bold uppercase tracking-tighter max-w-[100px] line-clamp-2">{error}</p>
      </div>
    ) : (
      <>
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all duration-500", 
          hasFile ? "bg-[#25D366] text-white scale-110" : "bg-white/5 text-[#8E8E93] group-hover:bg-[#D4A854] group-hover:text-black group-hover:rotate-6"
        )}>
           {hasFile ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
        </div>
        <div className="space-y-1 w-full px-2">
          <span className="text-[10px] font-black uppercase tracking-widest block text-white/90 truncate">{label}</span>
          <p className="text-[8px] text-[#8E8E93] font-bold uppercase tracking-[0.2em] truncate">
            {hasFile ? (fileName || 'Digitalizado') : 'Clique para subir'}
          </p>
        </div>
      </>
    )}
    
    {hasFile && !loading && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/90 opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm gap-2">
        <button type="button" onClick={() => onView(type)} className="p-2.5 bg-white/10 hover:bg-[#D4A854] hover:text-black rounded-xl text-white transition-all shadow-xl">
          <Eye className="w-5 h-5" />
        </button>
        <a 
          href={fileUrl} 
          download={fileName || 'document'} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-2.5 bg-white/10 hover:bg-[#D4A854] hover:text-black rounded-xl text-white transition-all shadow-xl"
        >
          <Download className="w-5 h-5" />
        </a>
        <button type="button" onClick={(e) => onDelete(e, type)} className="p-2.5 bg-red-500/10 hover:bg-red-500 text-white rounded-xl transition-all shadow-xl">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    )}
  </div>
));

const PremiumUserSelect = ({ label, required, users, value, onChange, disabled }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedUser = users.find((u: any) => u.uid === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-1.5 w-full group relative" ref={containerRef}>
      <label className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-widest ml-1 group-focus-within:text-[#D4A854] transition-colors">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full h-11 bg-[#1A1C1E] border border-white/10 rounded-xl px-4 flex items-center justify-between cursor-pointer transition-all hover:border-white/20",
          disabled && "opacity-50 cursor-not-allowed bg-white/[0.02]",
          isOpen && "ring-2 ring-[#D4A85420] border-[#D4A85440]"
        )}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {selectedUser ? (
            <>
              {selectedUser.photoURL ? (
                <img src={selectedUser.photoURL} alt="" className="w-6 h-6 rounded-lg object-cover ring-1 ring-white/10" />
              ) : (
                <div className="w-6 h-6 rounded-lg bg-[#D4A85420] flex items-center justify-center text-[#D4A854]">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              )}
              <span className="text-[12px] font-medium text-white truncate">{selectedUser.name || selectedUser.email}</span>
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[#8E8E93]/40">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
              <span className="text-[12px] font-medium text-[#8E8E93]/40 tracking-wide uppercase">Selecione...</span>
            </>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-[#8E8E93]/40 transition-transform duration-300", isOpen && "rotate-180")} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#1A1C1E] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-xl"
          >
            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
              {users.length === 0 && (
                <div className="p-4 text-center text-[10px] text-[#8E8E93] uppercase font-bold tracking-widest">Nenhum usuário encontrado</div>
              )}
              {users.map((user: any) => (
                <div 
                  key={user.uid}
                  onClick={() => {
                    onChange(user.uid);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer group/item",
                    value === user.uid ? "bg-[#D4A854] text-black" : "hover:bg-white/5 text-white"
                  )}
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/10" />
                  ) : (
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      value === user.uid ? "bg-black/20 text-black" : "bg-white/5 text-[#D4A854] group-hover/item:bg-[#D4A85420]"
                    )}>
                      <UserIcon className="w-4.5 h-4.5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[11px] font-black uppercase tracking-tight truncate", value === user.uid ? "text-black" : "text-white")}>{user.name || user.email}</p>
                    <p className={cn("text-[8px] font-bold uppercase tracking-widest opacity-60 truncate", value === user.uid ? "text-black/80" : "text-[#8E8E93]")}>{user.role || 'Vendedor'}</p>
                  </div>
                  {value === user.uid && <CheckCircle2 className="w-4 h-4 text-black" />}
                </div>
              ))}
            </div>
            {auth.currentUser?.email !== 'paulosergio.michelin@gmail.com' && auth.currentUser?.uid !== 'paulomichelin' && (
              <div className="p-3 bg-black/40 border-t border-white/5">
                <p className="text-[8px] text-center text-[#8E8E93] font-bold uppercase tracking-widest">Apenas administradores podem alterar este campo.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const getDocUrl = (doc: any): string => {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  return doc.url || '';
};

const getDocPath = (doc: any): string => {
  if (!doc || typeof doc === 'string') return '';
  return doc.storagePath || '';
};

const getDocName = (doc: any, fallback: string = 'Digitalizado'): string => {
  if (!doc) return '';
  if (typeof doc === 'string') return fallback;
  return doc.fileName || fallback;
};

const QuoteItem = React.memo(({ file, index, onPreview, onDelete }: any) => {
  console.log('[QUOTE_RENDERED]', file.fileName);
  return (
    <div className="p-4 bg-[#111214] border border-white/5 rounded-2xl flex items-center justify-between group hover:border-[#D4A85420] transition-all">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#D4A85410] flex items-center justify-center text-[#D4A854]">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-tight text-white/90 truncate max-w-[200px]">{file.fileName}</p>
          <p className="text-[8px] text-[#8E8E93] font-bold uppercase tracking-widest mt-1">
            {file.uploadedAt ? format(new Date(file.uploadedAt), 'dd/MM/yyyy HH:mm') : 'Data desconhecida'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button 
          type="button" 
          onClick={() => onPreview(file)}
          className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-[#D4A854] hover:text-black transition-all"
        >
          <Eye className="w-4 h-4" />
        </button>
        <a 
          href={file.url} 
          download={file.fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-[#D4A854] hover:text-black transition-all"
        >
          <Download className="w-4 h-4" />
        </a>
        <button 
          type="button" 
          onClick={() => onDelete(index)}
          className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-red-500 hover:text-white transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

// --- MAIN COMPONENT ---

export const LeadForm = React.memo(({ lead, onSave, onCancel, onDelete, onNavigateToLead, agentConfig: externalAgentConfig, pageMode = false }: LeadFormProps) => {
  const viewport = useViewport();
  const [formData, setFormData] = useState<Partial<Lead>>(() => {
    const initial = lead ? { ...INITIAL_LEAD, ...lead } : {
      ...INITIAL_LEAD,
      id: generateId()
    };
    if (initial.phone) initial.phone = formatPhone(initial.phone as string);
    console.log('[LEAD_FORM_INIT]', { id: initial.id, hasDocuments: !!initial.documents, hasQuotes: !!initial.cotacaoFiles });
    return initial;
  });

  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const handleToggleComercial = useCallback((active: boolean) => {
    setFormData(p => ({ ...p, perfilUso: { ...(p.perfilUso || {}), comercial: active }, serviceUsage: active }));
    setIsDirty(true);
  }, []);

  const handleToggleCondutorJovem = useCallback((active: boolean) => {
    setFormData(p => ({ ...p, perfilUso: { ...(p.perfilUso || {}), condutorJovem: active }, youngDriverHousehold: active }));
    setIsDirty(true);
  }, []);

  const handleToggleProprietarioCondutor = useCallback((active: boolean) => {
    setFormData(p => ({ ...p, proprietarioEhCondutor: active, isOwnerDriver: active }));
    setIsDirty(true);
  }, []);

  const handleToggleAlienacao = useCallback((active: boolean) => {
    setFormData(p => ({ ...p, alienacaoFiduciaria: active, fiduciaryAlienation: active }));
    setIsDirty(true);
  }, []);
  const [errors, setErrors] = useState<{ field: string, message: string }[]>([]);
  const [duplicateAlert, setDuplicateAlert] = useState<{ lead: Lead; field: 'cpf' | 'phone' } | null>(null);
  const [crmUsers, setCrmUsers] = useState<UserProfile[]>([]);
  const [viewerState, setViewerState] = useState<{
    isOpen: boolean;
    url?: string;
    storagePath?: string;
    type?: string;
    title?: string;
    data?: any;
    debug?: any;
    onConfirm?: (data: any) => void;
  }>({ isOpen: false });

  const [processingStage, setProcessingStage] = useState<DocumentProcessingStage>(DocumentProcessingStage.IDLE);
  const [activeSession, setActiveSession] = useState<any>(null);
  const controller = useMemo(() => DocumentSessionController.getInstance(), []);

  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<{[key: string]: string | null}>({});
  const hydrationLockRef = useRef<Set<string>>(new Set());
  const isSavingRef = useRef<boolean>(false);
  const isConfirmingRef = useRef<boolean>(false);
  const initialLoadDoneRef = useRef<boolean>(false);
  const processedRef = useRef<Set<string>>(new Set());

  // Block double execution on handleSave
  const handleSaveInternal = useCallback(async (data: Lead, options?: any) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await onSave(data, options);
    } finally {
      setTimeout(() => { isSavingRef.current = false; }, 1000);
    }
  }, [onSave]);

  const confirmExtraction = useCallback(async (validatedData: any) => {
    const session = controller.getSession();
    if (!session || !session.file || isConfirmingRef.current) {
       console.warn('[PIPELINE_CONFIRM_BLOCKED] Session inactive or already confirming');
       return;
    }
    
    isConfirmingRef.current = true;
    const { type, file, leadId } = session;
    console.log(`[PIPELINE_CONFIRM_START] Persisting ${type} for lead ${leadId}`);
    
    controller.updateState(DocumentPipelineState.CONFIRMED);

    try {
      // 1. UPLOAD
      controller.updateState(DocumentPipelineState.UPLOADING);
      const { url, path: storagePath } = await StorageService.uploadFile(file, leadId, `doc_${type}_${Date.now()}_${file.name}`);
      console.log(`[DOCUMENT_STORAGE_SUCCESS] URL: ${url}`);

      // 2. PREPARE OBJECT
      const docObject: LeadDocument = {
        url: url,
        storagePath: storagePath,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        extractedData: validatedData,
        aiStatus: 'validated',
        documentType: type,
        processingStage: DocumentProcessingStage.FINALIZED,
        validatedAt: new Date().toISOString(),
        validatedBy: auth.currentUser?.uid || 'system',
        finalizedAt: new Date().toISOString()
      };

      // 3. PERSIST FIRESTORE
      controller.updateState(DocumentPipelineState.PERSISTING);

      // Prepare flattened data for lead
      const flattenedData = { ...validatedData };
      if (validatedData.broker) {
        flattenedData.brokerName = validatedData.broker.name;
        flattenedData.brokerSusep = validatedData.broker.susep;
        flattenedData.brokerPhone = validatedData.broker.phone;
        flattenedData.brokerEmail = validatedData.broker.email;
        delete flattenedData.broker;
      }

      // Never overwrite an existing valid CPF with an invalid/incomplete one from OCR.
      const existingCpf = (formData.cpf || '').replace(/\D/g, '');
      const incomingCpf = (flattenedData.cpf || '').replace(/\D/g, '');
      if (existingCpf.length === 11 && incomingCpf.length !== 11) {
        delete flattenedData.cpf;
      }

      const updated: Lead = {
        ...formData,
        ...flattenedData,
        documents: {
          ...(formData.documents || {}),
          [type]: docObject
        },
        updatedAt: new Date().toISOString()
      } as Lead;
      
      setFormData(updated);
      setIsDirty(true);
      
      if (lead?.id) {
        await handleSaveInternal(updated, { silent: true });
        console.log(`[DOCUMENT_FIRESTORE_SAVE] Lead ${lead.id} synced`);
      }

      // 4. COMPLETE
      controller.updateState(DocumentPipelineState.COMPLETED);
      console.log(`[PIPELINE_COMPLETE] All steps successful`);
      
      // Cleanup UI
      setTimeout(() => {
        controller.release();
        hydrationLockRef.current.delete(type);
        isConfirmingRef.current = false;
      }, 300);

    } catch (err: any) {
      console.error(`[PIPELINE_FATAL_ERROR]`, err);
      controller.updateState(DocumentPipelineState.FAILED, null, err.message);
      setAnalysisErrorMessage(prev => ({ ...prev, [type]: 'Falha crítica na persistência do documento.' }));
      isConfirmingRef.current = false;
    }
  }, [controller, formData, handleSaveInternal, lead]);

  // Sync Global Session to Local State
  useEffect(() => {
    const unsub = controller.subscribe((session) => {
      setActiveSession(session);
      if (session) {
        // Automatically open the viewer if in validation state
        if (session.state === DocumentPipelineState.VALIDATING) {
          setViewerState({
            isOpen: true,
            url: session.fileUrl,
            type: session.type,
            title: `Confirmar Extração: ${session.type.toUpperCase()}`,
            data: session.data,
            debug: session.debug,
            onConfirm: confirmExtraction
          });
        }
        
        // Finalized states
        if (session.state === DocumentPipelineState.COMPLETED) {
           setViewerState(prev => ({ ...prev, isOpen: false }));
        }

        // Sync stage for backward compat
        setProcessingStage(prev => {
          if (session.state === DocumentPipelineState.VALIDATING) return DocumentProcessingStage.VALIDATION_OPEN;
          if (session.state === DocumentPipelineState.PROCESSING) return DocumentProcessingStage.OCR_PROCESSING;
          if (session.state === DocumentPipelineState.FAILED) return DocumentProcessingStage.FAILED;
          return prev;
        });
      }
    });

    return () => unsub();
  }, [controller, confirmExtraction]);

  useEffect(() => {
    if (lead) {
      // 1. Processing Guard: Ignore external snapshots if session is active
      if (controller.isActive() || hydrationLockRef.current.size > 0) {
        console.warn('[HYDRATION_BLOCKED_BY_SESSION]', { 
          locked: Array.from(hydrationLockRef.current), 
          session: controller.getSession()?.sessionId 
        });
        return;
      }

      // 2. Snapshot Versioning: Lead snapshots from Firestore should only apply if they are newer than our current state
      // We use updatedAt as the source of truth for versioning
      if (formData.updatedAt && lead.updatedAt) {
        const localTs = new Date(formData.updatedAt).getTime();
        const remoteTs = new Date(lead.updatedAt).getTime();
        if (remoteTs <= localTs) {
          console.log('[SNAPSHOT_IGNORED_STALE]', { remoteTs, localTs });
          return;
        }
      }

      console.log(`[REALTIME_RECONCILED] Syncing lead ${lead.id} | Remote is newer`);
      
      const docs = lead.documents || {};
      // Defer state update to next microtask to avoid synchronous cascade render warning
      Promise.resolve().then(() => {
        setFormData(prev => ({
          ...prev,
          ...lead,
          phone: formatPhone(lead.phone || ''),
          documents: {
            ...(prev.documents || {}),
            ...docs
          },
          cotacaoFiles: lead.cotacaoFiles || prev.cotacaoFiles || []
        }));
      });
    }
  }, [lead, formData.updatedAt, processingStage, controller]);

  const handleDeleteDocument = useCallback(async (type: string) => {
    console.log(`[DOCUMENT_REMOVED] Deleting ${type} from lead ${formData.id}`);
    const updatedDocs = { ...(formData.documents || {}) } as any;
    delete updatedDocs[type];
    delete updatedDocs[`${type}Metadata`];

    const updated = {
      ...formData,
      documents: updatedDocs
    };
    setFormData(updated);
    setIsDirty(true);

    if (lead?.id) {
      await handleSaveInternal(updated as Lead, { silent: true });
    }
  }, [formData, lead?.id, handleSaveInternal]);

  const handleDeleteQuote = useCallback(async (index: number) => {
    console.log(`[QUOTE_REMOVED] Deleting quote index ${index} from lead ${formData.id}`);
    const updatedQuotes = [...(formData.cotacaoFiles || [])];
    updatedQuotes.splice(index, 1);

    const updated = {
      ...formData,
      cotacaoFiles: updatedQuotes,
      quoteAttachment: updatedQuotes.length > 0 ? updatedQuotes[0] as any : undefined
    };
    setFormData(updated);
    setIsDirty(true);

    if (lead?.id) {
      await handleSaveInternal(updated as Lead, { silent: true });
    }
  }, [formData, lead?.id, handleSaveInternal]);

  const crvInputRef = useRef<HTMLInputElement>(null);
  const cnhInputRef = useRef<HTMLInputElement>(null);
  const policyInputRef = useRef<HTMLInputElement>(null);
  const quoteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    DataService.list('users').then(users => {
      setCrmUsers(users as UserProfile[]);
    });
  }, []);


  const handleCepLookup = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        const address = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
        setFormData(prev => ({
          ...prev,
          logradouroPernoite: data.logradouro || '',
          bairroPernoite: data.bairro || '',
          cidadePernoite: data.localidade || '',
          estadoPernoite: data.uf || '',
          enderecoAuto: address,
          addressOvernight: address
        }));
      }
    } catch (error) {
      console.error('Error fetching CEP:', error);
    } finally {
      setLoadingCep(false);
    }
  }, []);

  const checkDuplicate = useCallback(async (field: 'cpf' | 'phone', rawValue: string) => {
    if (!rawValue) { setDuplicateAlert(null); return; }
    const clean = rawValue.replace(/\D/g, '');
    if (field === 'phone' && clean.length < 10) { setDuplicateAlert(null); return; }
    if (field === 'cpf' && clean.length !== 11) { setDuplicateAlert(null); return; }
    // Query only leads matching the exact formatted value — avoids full-collection scan
    const { where } = await import('firebase/firestore');
    const matches = await DataService.list('leads', [where(field, '==', rawValue)]) as Lead[];
    const duplicate = matches.find(l => l.id !== formData.id);
    setDuplicateAlert(duplicate ? { lead: duplicate, field } : null);
  }, [formData.id]);

  const handlePhoneBlur = useCallback(() => {
    checkDuplicate('phone', formData.phone || '');
  }, [formData.phone, checkDuplicate]);

  const handleCpfBlur = useCallback(() => {
    checkDuplicate('cpf', formData.cpf || '');
  }, [formData.cpf, checkDuplicate]);

  const handleChange = useCallback((e: any) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;

    if (name === 'phone') val = formatPhone(value);
    if (name === 'cpf' || name === 'cpfProprietario') val = formatCpf(value);
    if (name === 'name' || name === 'nomeProprietario' || name === 'plate' || name === 'chassi') {
      val = typeof val === 'string' ? val.toUpperCase() : val;
    }

    setFormData(prev => ({ ...prev, [name]: val }));
    setIsDirty(true);

    if (name === 'cepPernoite' && typeof value === 'string' && value.replace(/\D/g, '').length === 8) {
      handleCepLookup(value);
    }
  }, [handleCepLookup]);

  // Auto-calculated fields. Recompute only when their inputs change, and refresh
  // on a 60s tick so countdowns stay live without forcing a render every frame.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const ageDisplay = useMemo(() => calculateAge(formData.birthDate || ''), [formData.birthDate, nowTick]);
  const birthdayCountdown = useMemo(
    () => formatCountdownToNext(formData.birthDate || '', { recurringYearly: true }),
    [formData.birthDate, nowTick]
  );
  const vigenciaCountdown = useMemo(
    () => formatCountdownToNext(formData.insuranceExpiry || (formData as any).fimVigencia || ''),
    [formData.insuranceExpiry, (formData as any).fimVigencia, nowTick]
  );
  const possuiSeguro = !!(formData.possuiSeguro ?? formData.hasInsurance);


  const renderQuotesList = useMemo(() => {
    return formData.cotacaoFiles?.map((file: any, idx: number) => (
      <QuoteItem 
        key={`${file.url || idx}`} 
        file={file} 
        index={idx}
        onPreview={(file: any) => setViewerState({
          isOpen: true,
          url: file.url,
          storagePath: file.storagePath,
          type: 'COTACAO',
          title: `Cotação: ${file.fileName || 'Documento'}`
        })}
        onDelete={handleDeleteQuote}
      />
    ));
  }, [formData.cotacaoFiles, handleDeleteQuote]);

  const handleDocView = useCallback((type: string) => {
    const doc = (formData.documents as any)?.[type];
    const url = getDocUrl(doc);
    const path = getDocPath(doc);
    if (!url) return;
    
    setViewerState({
      isOpen: true,
      url,
      storagePath: path,
      type: type.toUpperCase(),
      title: `Visualizar ${type.toUpperCase()}`
    });
  }, [formData.documents]);

  const handleDocDeleteStable = useCallback((e: any, type: string) => {
    e.stopPropagation();
    handleDeleteDocument(type);
  }, [handleDeleteDocument]);

  const handleDocUploadTrigger = useCallback((type: 'cnh' | 'crv' | 'policy') => {
    if (type === 'crv') crvInputRef.current?.click();
    if (type === 'cnh') cnhInputRef.current?.click();
    if (type === 'policy') policyInputRef.current?.click();
  }, []);

  const handleDocUpload = useCallback(async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (controller.isActive()) {
      console.warn('[PIPELINE_BLOCKED] Process already in progress');
      return;
    }

    const type = e.target.id as 'cnh' | 'crv' | 'policy';
    const leadId = lead?.id || formData.id || 'temp-doc';

    try {
      const { session, signal } = controller.startSession(type, leadId, file);
      setAnalysisErrorMessage(prev => ({ ...prev, [type]: null }));
      hydrationLockRef.current.add(type);
      console.log(`[OCR_PIPELINE_START] Type: ${type} | Session: ${session.sessionId}`);
      
      const { structuredData, debug } = await OCRService.processDocument(file, {
        leadId,
        mimeType: file.type,
        onStatus: (status) => console.log(`[OCR_STATUS] ${status}`),
        hintType: type
      });

      if (debug) {
        controller.updateDebug(debug);
      }

      // FAIL FAST: If structuredData is empty (DeterministicParser returned {}), the pipeline FAILED.
      const hasData = structuredData && Object.keys(structuredData).length > 0;

      if (!hasData) {
        throw new Error('PIPELINE_FAILED: Extração estrutural não retornou dados válidos para este documento.');
      }

      const mappedData = standardizeLeadData(structuredData);

      // Keep the session's original fileUrl (created in startSession via createObjectURL)
      // instead of the OCRService blob — the OCRService blob is revoked after processing.
      controller.updateState(DocumentPipelineState.VALIDATING, mappedData);
      console.log(`[OCR_PIPELINE_VALIDATION_OPEN] Extraction success`);
    } catch (error: any) {
      console.error('[OCR_PIPELINE_FAILED]', error);
      const userMsg = error.message.includes('PIPELINE_FAILED') 
        ? error.message.split(': ')[1] 
        : 'Falha técnica no pipeline de extração regional.';
      
      hydrationLockRef.current.delete(type);
      controller.updateState(DocumentPipelineState.FAILED, null, userMsg);
    }
  }, [controller, formData.id, lead?.id]);

  const handleQuoteUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSaving(true);
      const leadId = lead?.id || formData.id || 'temp-quote';
      const { url, path } = await StorageService.uploadFile(file, leadId, `quote_${file.name}`);
      
      const newFile = { 
        url, 
        storagePath: path,
        fileName: file.name, 
        uploadedAt: new Date().toISOString(),
        uploadedBy: auth.currentUser?.uid || 'system'
      };

      const updated = {
        ...formData,
        cotacaoFiles: [...(formData.cotacaoFiles || []), newFile],
        quoteAttachment: newFile as any // Backward compat
      };

      setFormData(updated);
      setIsDirty(true);

      // Auto-save if lead exists to ensure persistence
      if (lead?.id) {
        await onSave(updated as Lead, { silent: true });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [formData, lead?.id, onSave]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setIsSaving(true);

    const finalLead = {
      ...formData,
      status: formData.statusLead || formData.status, // Sync
      temperature: formData.temperatura || formData.temperature,
      classificationReason: formData.justificativa || formData.classificationReason,
      iaActive: formData.iaEnabled ?? formData.iaActive,
      hasInsurance: formData.possuiSeguro ?? formData.hasInsurance,
      zipCodeOvernight: formData.cepPernoite || formData.zipCodeOvernight,
      numberOvernight: formData.numeroPernoite || formData.numberOvernight,
      addressOvernight: (() => {
        const parts = [
          formData.logradouroPernoite,
          formData.numeroPernoite ? `nº ${formData.numeroPernoite}` : null,
          formData.bairroPernoite,
          formData.cidadePernoite,
          formData.estadoPernoite
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : (formData.enderecoAuto || formData.addressOvernight || '');
      })(),
      civilStatus: formData.maritalStatus || formData.civilStatus,
      isOwnerDriver: formData.proprietarioEhCondutor ?? formData.isOwnerDriver,
      ownerName: formData.nomeProprietario || formData.ownerName,
      ownerCpfCnpj: formData.cpfProprietario || formData.ownerCpfCnpj,
      fiduciaryAlienation: formData.alienacaoFiduciaria ?? formData.fiduciaryAlienation,
      nextReturnAt: formData.proximoRetorno || formData.nextReturnAt,
      responsibleAgentId: formData.responsibleUserId || formData.responsibleAgentId,
      responsibleAgentName: formData.responsibleAgentName || crmUsers.find(u => (u.uid || (u as any).id) === (formData.responsibleUserId || formData.responsibleAgentId))?.name || 'Sem agente',
      updatedAt: new Date().toISOString()
    } as Lead;

    const validation = validateLead(finalLead);
    if (validation.length > 0) {
      setErrors(validation);
      setIsSaving(false);
      return;
    }

    try {
      await onSave(finalLead);
      setIsDirty(false);
      setIsSaving(false);
    } catch (err) {
      setIsSaving(false);
    }
  }, [formData, crmUsers, onSave]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className={pageMode
          ? "flex-1 flex flex-col bg-[#050505] text-white overflow-hidden relative"
          : "fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-6"
        }
      >
        {/* Backdrop — only in modal mode */}
        {!pageMode && (
          <div
            onClick={() => isDirty ? setShowExitConfirm(true) : onCancel()}
            className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
            aria-hidden="true"
          />
        )}

        {/* Card: bounded modal or full-height page */}
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.985 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className={pageMode
            ? "flex-1 flex flex-col bg-[#050505] text-white overflow-hidden"
            : "relative w-full max-w-[1100px] max-h-[92vh] flex flex-col bg-[#050505] text-white rounded-3xl border border-white/10 shadow-[0_50px_120px_rgba(0,0,0,0.75)] overflow-hidden isolate"
          }
        >
      {/* Header - Always Fixed at Top */}
      <div className="shrink-0 h-16 border-b border-white/5 bg-[#0B0B0D]/90 backdrop-blur-2xl px-6 md:px-8 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.8)] z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D4A854] to-[#B8860B] flex items-center justify-center shadow-[0_0_20px_rgba(212,168,84,0.3)] border border-white/10">
            <UserIcon className="w-5 h-5 text-black" />
          </div>
          <div className="flex flex-col -space-y-1">
            <h2 className="text-[11px] font-black uppercase tracking-[0.4em] font-display text-[#D4A854] drop-shadow-sm">{lead?.id ? 'Editar Lead' : 'Novo Cadastro'}</h2>
            <p className="text-[9px] text-[#8E8E93] font-bold uppercase tracking-widest opacity-60">CRM Michelin Seguros</p>
          </div>
        </div>
        <button 
          type="button"
          onClick={() => isDirty ? setShowExitConfirm(true) : onCancel()}
          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all duration-300 text-white/40 hover:text-white group border border-white/5 hover:border-white/20 active:scale-95"
        >
          <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* Form Content - Robust Scroll Area */}
      <form
        id="lead-form"
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#050505] selection:bg-[#D4A85420] selection:text-[#D4A854] min-h-0"
      >
        <div className="w-full py-6 px-5 md:px-7 lg:px-9 space-y-5 pb-20">
          
          {duplicateAlert && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-4 shadow-[0_8px_30px_rgba(245,158,11,0.08)]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">Lead duplicado detectado</p>
                  <p className="text-[9.5px] text-amber-300/70 font-medium mt-0.5 truncate">
                    Já existe um lead com {duplicateAlert.field === 'phone' ? 'este telefone' : 'este CPF'}: <span className="font-bold text-amber-300">{duplicateAlert.lead.name}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { onNavigateToLead?.(duplicateAlert.lead); }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-[9px] font-black uppercase tracking-[0.15em] rounded-lg transition-all"
              >
                Editar lead <ArrowRight className="w-3 h-3" />
              </button>
            </motion.div>
          )}

          {errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-start gap-5 shadow-[0_10px_40px_rgba(239,68,68,0.1)] backdrop-blur-md"
            >
              <div className="p-2 bg-red-500/20 rounded-xl">
                <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-red-500">Erros de Validação Detectados</p>
                <p className="text-[10px] text-red-400/70 font-medium tracking-wide">Por favor, corrija os itens abaixo para prosseguir com o salvamento:</p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 mt-3">
                  {errors.map((e, idx) => (
                    <li key={idx} className="text-[10px] text-red-400 font-bold uppercase tracking-tight flex items-center gap-2">
                       <span className="w-1 h-1 rounded-full bg-red-500/40" />
                       {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Section 1: Contato e Condutor — layout premium horizontal compacto */}
          <PremiumSection title="Informações de Contato e Condutor" icon={UserIcon} subtitle="Identificação e localização do segurado">
            <div className="space-y-4">
              {/* Linha 1: Nome + Telefone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PremiumInput label="Nome Completo" name="name" value={formData.name || ''} onChange={handleChange} required placeholder="Digite o nome completo" icon={UserIcon} />
                <PremiumInput label="Telefone (WhatsApp)" name="phone" value={formData.phone || ''} onChange={handleChange} onBlur={handlePhoneBlur} required placeholder="(00) 00000-0000" icon={Smartphone} inputMode="tel" maxLength={15} />
              </div>

              {/* Linha 2: CPF + Data Nascimento + Idade + Aniversário */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <PremiumCpfInput
                  label="CPF"
                  name="cpf"
                  value={formData.cpf || ''}
                  onChange={handleChange}
                  onBlur={handleCpfBlur}
                  placeholder="000.000.000-00"
                />
                <PremiumInput
                  label="Data de Nascimento"
                  name="birthDate"
                  type="date"
                  value={formData.birthDate || ''}
                  onChange={handleChange}
                  className="[color-scheme:dark]"
                />
                <PremiumComputedField
                  label="Idade"
                  value={ageDisplay}
                  icon={Calendar}
                  tone="gold"
                  emptyLabel="—"
                />
                <PremiumComputedField
                  label="Falta p/ Aniversário"
                  value={birthdayCountdown}
                  icon={Clock}
                  tone="mint"
                  emptyLabel="—"
                />
              </div>

              {/* Linha 2b: RG + Data Expedição + Órgão Emissor */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PremiumInput
                  label="RG"
                  name="rg"
                  value={formData.rg || ''}
                  onChange={handleChange}
                  placeholder="RG"
                  icon={FileCheck}
                />
                <PremiumInput
                  label="Data de Expedição (RG)"
                  name="rgDataExpedicao"
                  type="date"
                  value={formData.rgDataExpedicao || ''}
                  onChange={handleChange}
                  className="[color-scheme:dark]"
                />
                <PremiumInput
                  label="Órgão Emissor (RG)"
                  name="rgOrgaoEmissor"
                  value={formData.rgOrgaoEmissor || ''}
                  onChange={handleChange}
                  placeholder="Ex: SSP/SP"
                />
              </div>

              {/* Linha 3: E-mail + Estado Civil + CEP Pernoite */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PremiumInput
                  label="E-mail"
                  name="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  placeholder="seu@email.com"
                  icon={Mail}
                />
                <PremiumSelect
                  label="Estado Civil"
                  name="maritalStatus"
                  value={formData.maritalStatus || formData.civilStatus || ''}
                  onChange={handleChange}
                  options={[
                    { value: '', label: 'Selecione...' },
                    { value: 'Solteiro', label: 'Solteiro(a)' },
                    { value: 'Casado', label: 'Casado(a)' },
                    { value: 'Divorciado', label: 'Divorciado(a)' },
                    { value: 'Viuvo', label: 'Viúvo(a)' },
                  ]}
                />
                <div className="relative group">
                  <PremiumInput
                    label="CEP Pernoite"
                    name="cepPernoite"
                    value={formData.cepPernoite || formData.zipCodeOvernight || ''}
                    onChange={handleChange}
                    placeholder="00000-000"
                    icon={MapPin}
                  />
                  {loadingCep && <Loader2 className="absolute right-3 top-[34px] w-3.5 h-3.5 animate-spin text-[#D4A854]" />}
                </div>
              </div>

              {/* Linha 4: Endereço desmembrado */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                <PremiumInput
                  label="Logradouro"
                  name="logradouroPernoite"
                  value={formData.logradouroPernoite || ''}
                  onChange={handleChange}
                  placeholder="Rua / Av. / Alameda..."
                  icon={MapPin}
                />
                <PremiumInput
                  label="Número"
                  name="numeroPernoite"
                  value={formData.numeroPernoite || formData.numberOvernight || ''}
                  onChange={handleChange}
                  placeholder="S/N"
                  className="w-28"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PremiumInput
                  label="Bairro"
                  name="bairroPernoite"
                  value={formData.bairroPernoite || ''}
                  onChange={handleChange}
                  placeholder="Bairro"
                />
                <PremiumInput
                  label="Cidade"
                  name="cidadePernoite"
                  value={formData.cidadePernoite || ''}
                  onChange={handleChange}
                  placeholder="Cidade"
                />
                <PremiumInput
                  label="Estado (UF)"
                  name="estadoPernoite"
                  value={formData.estadoPernoite || ''}
                  onChange={handleChange}
                  placeholder="SP"
                />
              </div>
            </div>
          </PremiumSection>

          {/* Inteligência Comercial — dropdowns inline compactos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PremiumInlineSelect
              label="Status do Lead:"
              icon={Flame}
              name="statusLead"
              value={formData.statusLead || formData.status || 'Novo Lead'}
              onChange={handleChange}
              options={[
                { value: 'Novo Lead', label: 'Novo Lead' },
                { value: 'Em Atendimento', label: 'Em Atendimento' },
                { value: 'Em Cotação', label: 'Em Cotação' },
                { value: 'Proposta Enviada', label: 'Proposta Enviada' },
                { value: 'Negociação', label: 'Negociação' },
                { value: 'Fechado', label: 'Fechado' },
                { value: 'Perdido', label: 'Perdido' },
              ]}
            />
            <PremiumInlineSelect
              label="Temperatura:"
              icon={Thermometer}
              name="temperatura"
              value={formData.temperatura || formData.temperature || 'morno'}
              onChange={handleChange}
              options={[
                { value: 'frio', label: 'Frio' },
                { value: 'morno', label: 'Morno' },
                { value: 'quente', label: 'Quente' },
              ]}
            />
          </div>

          {/* Classificação — grid compacto horizontal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PremiumSelect
              label="Origem" name="origin" value={formData.origin || ''} onChange={handleChange}
              icon={Filter}
              options={[
                { value: 'Manual', label: 'Manual' },
                { value: 'WhatsApp', label: 'WhatsApp' },
                { value: 'Importado', label: 'Importado' },
                { value: 'Instagram', label: 'Instagram' },
              ]}
            />
            <PremiumSelect
              label="Perfil do Lead" name="perfilLead" value={formData.perfilLead || ''} onChange={handleChange}
              icon={Target}
              options={[
                { value: '', label: 'Não identificado' },
                { value: 'residencial', label: 'Residencial' },
                { value: 'comercial', label: 'Comercial' },
                { value: 'frota', label: 'Frota' },
              ]}
            />
            <PremiumInput
              label="Score (0-10)"
              type="number"
              min="0"
              max="10"
              name="score"
              value={formData.score || 0}
              onChange={handleChange}
              icon={TrendingUp}
            />
            <div className="space-y-1">
              <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] ml-0.5">IA Inteligente</label>
              <div className="h-10 flex items-center justify-between px-3 bg-[#16181B] border border-white/[0.07] rounded-lg group hover:border-[#D4A854]/30 transition-all">
                <div className="flex items-center gap-1.5">
                  <Bot className={cn('w-3 h-3 transition-colors', (formData.iaEnabled ?? formData.iaActive) ? 'text-[#D4A854]' : 'text-white/30')} />
                  <span className={cn('text-[9.5px] font-bold uppercase tracking-wider transition-colors', (formData.iaEnabled ?? formData.iaActive) ? 'text-[#D4A854]' : 'text-white/40')}>
                    {(formData.iaEnabled ?? formData.iaActive) ? 'Ativada' : 'Desativada'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="iaEnabled" checked={!!(formData.iaEnabled ?? formData.iaActive)} onChange={handleChange} className="sr-only peer" />
                  <div className="w-8 h-4 bg-white/5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[#D4A854] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#D4A854]" />
                </label>
              </div>
            </div>
          </div>

          {/* Justificativa — textarea refinada */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-0.5">
              <label className="text-[8.5px] font-bold text-[#8E8E93]/80 uppercase tracking-[0.18em] flex items-center gap-1.5">
                <ClipboardList className="w-3 h-3" /> Justificativa da Classificação
              </label>
              <span className="text-[8px] text-[#8E8E93]/40 font-mono tabular-nums">
                {(formData.justificativa || '').length}/500
              </span>
            </div>
            <textarea
              name="justificativa"
              value={formData.justificativa || formData.classificationReason || ''}
              onChange={handleChange}
              rows={3}
              maxLength={500}
              placeholder="Descreva brevemente o motivo da pontuação e temperatura atribuídas…"
              className="w-full p-3.5 bg-[#16181B] border border-white/[0.07] rounded-xl text-[12px] font-medium text-white leading-relaxed transition-all duration-200 focus:ring-2 focus:ring-[#D4A854]/20 focus:border-[#D4A854]/40 focus:shadow-[0_0_0_4px_rgba(212,168,84,0.04)] hover:border-white/15 outline-none placeholder:text-white/15 resize-none"
            />
          </div>


          {/* Veículo e Seguro */}
          <PremiumSection title="Veículo e Seguro" icon={ShieldCheck} subtitle="Dados técnicos do bem segurado">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <PremiumInput label="Placa" name="plate" value={formData.plate || ''} onChange={handleChange} placeholder="ABC1D23" icon={Car} />
              <PremiumInput label="Chassi" name="chassi" value={formData.chassi || formData.chassis || ''} onChange={handleChange} placeholder="17 caracteres alfanuméricos" />
            </div>

            <div className="mt-5 flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl transition-colors hover:border-[#D4A85420]">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  possuiSeguro ? "bg-[#D4A854] shadow-[0_0_10px_rgba(212,168,84,0.6)]" : "bg-white/10"
                )} />
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Já possui seguro ativo?</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="possuiSeguro"
                  checked={possuiSeguro}
                  onChange={handleChange}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[#D4A854] after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#D4A854]" />
              </label>
            </div>

            {/* Campos expandidos inline — sem nova aba/seção/modal */}
            <AnimatePresence initial={false}>
              {possuiSeguro && (
                <motion.div
                  key="active-insurance-fields"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 p-5 bg-[#0E0F11] border border-[#D4A85420] rounded-2xl space-y-5">
                    <div className="flex items-center gap-2 text-[#D4A854]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <p className="text-[9px] font-black uppercase tracking-[0.2em]">Apólice Vigente</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <PremiumInput
                        label="Seguradora"
                        name="insurer"
                        value={formData.insurer || ''}
                        onChange={handleChange}
                        placeholder="Ex: Porto Seguro"
                      />
                      <PremiumInput
                        label="Corretora"
                        name="brokerName"
                        value={formData.brokerName || ''}
                        onChange={handleChange}
                        placeholder="Nome da corretora"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <PremiumInput
                        label="Início da Vigência"
                        type="date"
                        name="startDate"
                        value={formData.startDate || ''}
                        onChange={handleChange}
                        className="[color-scheme:dark]"
                      />
                      <PremiumInput
                        label="Fim da Vigência"
                        type="date"
                        name="insuranceExpiry"
                        value={formData.insuranceExpiry || ''}
                        onChange={handleChange}
                        className="[color-scheme:dark]"
                      />
                      <PremiumComputedField
                        label="Falta para o Fim da Vigência"
                        value={vigenciaCountdown}
                        icon={Clock}
                        tone="sky"
                        emptyLabel="Informe o fim da vigência"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </PremiumSection>

          {/* Perfil de Uso */}
          <PremiumSection title="Perfil de Uso" icon={TrendingUp} subtitle="Hábito de utilização do veículo">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <PremiumCardToggle 
                label="Uso Comercial" 
                description="Uso do veículo 2+ dias da semana para visitas ou serviços" 
                icon={Briefcase} 
                active={formData.perfilUso?.comercial ?? formData.serviceUsage} 
                onChange={handleToggleComercial} 
              />
              <PremiumCardToggle 
                label="Condutor Jovem" 
                description="Residem pessoas com idade entre 18 e 24 anos no local" 
                icon={Users} 
                active={formData.perfilUso?.condutorJovem ?? formData.youngDriverHousehold} 
                onChange={handleToggleCondutorJovem} 
              />
              <PremiumCardToggle 
                label="Proprietário é o Condutor?" 
                description="Veículo em nome de quem vai dirigir" 
                icon={UserCheck} 
                active={formData.proprietarioEhCondutor ?? formData.isOwnerDriver} 
                onChange={handleToggleProprietarioCondutor} 
              />
              <PremiumCardToggle 
                label="Alienação Fiduciária?" 
                description="Veículo financiado / arrendado" 
                icon={Wallet} 
                active={formData.alienacaoFiduciaria ?? formData.fiduciaryAlienation} 
                onChange={handleToggleAlienacao} 
              />
            </div>

            <AnimatePresence>
              {!(formData.proprietarioEhCondutor ?? formData.isOwnerDriver) && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }} 
                  animate={{ height: 'auto', opacity: 1 }} 
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 p-6 bg-white/[0.02] border border-white/5 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
                    <PremiumInput label="Nome do Proprietário" name="nomeProprietario" value={formData.nomeProprietario || formData.ownerName || ''} onChange={handleChange} placeholder="Digite o nome completo do proprietário" />
                    <PremiumInput label="CPF/CNPJ do Proprietário" name="cpfProprietario" value={formData.cpfProprietario || formData.ownerCpfCnpj || ''} onChange={handleChange} placeholder="000.000.000-00" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </PremiumSection>

          {/* Agenda e Responsável */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PremiumInput 
                label="Próximo Retorno Agendado" 
                type="datetime-local" 
                name="proximoRetorno" 
                value={formData.proximoRetorno ? formData.proximoRetorno.substring(0, 16) : ''} 
                onChange={handleChange} 
                className="[color-scheme:dark]"
                icon={Clock}
              />
              <PremiumUserSelect 
                label="Responsável (Criador/Importador)" 
                users={crmUsers}
                value={formData.responsibleUserId || formData.responsibleAgentId || auth.currentUser?.uid || ''} 
                onChange={(uid: string) => {
                  const user = crmUsers.find(u => u.uid === uid);
                  setFormData(p => ({ 
                    ...p, 
                    responsibleUserId: uid, 
                    responsibleAgentId: uid,
                    responsibleAgentName: user?.name || user?.email || 'N/A'
                  }));
                }}
                disabled={
                  auth.currentUser?.email !== 'paulosergio.michelin@gmail.com' && 
                  auth.currentUser?.uid !== 'paulomichelin' && 
                  auth.currentUser?.uid !== lead?.responsibleUserId && 
                  lead?.id
                } 
              />
          </div>

          {/* Documentação e Extração IA — largura total */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-[#D4A854]" />
                <p className="text-[10px] font-black uppercase tracking-widest">Documentação e Extração IA</p>
              </div>
              <span className="text-[9px] font-bold text-[#8E8E93] uppercase">{Object.keys(formData.documents || {}).length} anexos</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input type="file" id="crv" ref={crvInputRef} className="hidden" onChange={handleDocUpload} accept="image/*,application/pdf" />
              <input type="file" id="cnh" ref={cnhInputRef} className="hidden" onChange={handleDocUpload} accept="image/*,application/pdf" />
              <input type="file" id="policy" ref={policyInputRef} className="hidden" onChange={handleDocUpload} accept="image/*,application/pdf" />

              <DocUploadCard
                label="CRV / CRLV"
                type="crv"
                icon={Car}
                hasFile={!!getDocUrl(formData.documents?.crv)}
                fileUrl={getDocUrl(formData.documents?.crv)}
                fileName={getDocName(formData.documents?.crv, (formData.documents as any)?.crvMetadata?.fileName)}
                onUpload={handleDocUploadTrigger}
                onView={handleDocView}
                onDelete={handleDocDeleteStable}
                loading={activeSession?.type === 'crv' && activeSession?.state === DocumentPipelineState.PROCESSING}
                error={analysisErrorMessage['crv']}
              />
              <DocUploadCard
                label="CNH Condutor"
                type="cnh"
                icon={UserIcon}
                hasFile={!!getDocUrl(formData.documents?.cnh)}
                fileUrl={getDocUrl(formData.documents?.cnh)}
                fileName={getDocName(formData.documents?.cnh, (formData.documents as any)?.cnhMetadata?.fileName)}
                onUpload={handleDocUploadTrigger}
                onView={handleDocView}
                onDelete={handleDocDeleteStable}
                loading={activeSession?.type === 'cnh' && activeSession?.state === DocumentPipelineState.PROCESSING}
                error={analysisErrorMessage['cnh']}
              />
              <DocUploadCard
                label="Apólice Atual"
                type="policy"
                icon={ShieldCheck}
                hasFile={!!getDocUrl(formData.documents?.policy)}
                fileUrl={getDocUrl(formData.documents?.policy)}
                fileName={getDocName(formData.documents?.policy, (formData.documents as any)?.policyMetadata?.fileName)}
                onUpload={handleDocUploadTrigger}
                onView={handleDocView}
                onDelete={handleDocDeleteStable}
                loading={activeSession?.type === 'policy' && activeSession?.state === DocumentPipelineState.PROCESSING}
                error={analysisErrorMessage['policy']}
              />
            </div>
          </div>

          {/* Cotação apresentada ao cliente — agora ABAIXO da Documentação */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-[#D4A854]" />
                <p className="text-[10px] font-black uppercase tracking-widest">Cotação apresentada ao cliente</p>
              </div>
              <span className="text-[9px] font-bold text-[#8E8E93] uppercase">{formData.cotacaoFiles?.length || 0} anexos</span>
            </div>
            <div
              onClick={() => quoteInputRef.current?.click()}
              className="h-32 border-2 border-dashed border-white/5 bg-[#1A1C1E] hover:border-[#D4A85440] hover:bg-[#D4A85408] rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group cursor-pointer"
            >
              <input type="file" ref={quoteInputRef} className="hidden" onChange={handleQuoteUpload} accept="image/*,application/pdf" />
              <div className="w-11 h-11 bg-white/5 rounded-xl flex items-center justify-center text-[#8E8E93] group-hover:bg-[#D4A854] group-hover:text-black transition-all">
                <FilePlus className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase text-white tracking-widest">Anexar Nova Cotação</p>
                <p className="text-[8px] text-[#8E8E93] font-bold uppercase tracking-[0.2em] mt-1">PDF, JPG ou PNG até 10MB</p>
              </div>
            </div>
            {(formData.cotacaoFiles?.length ?? 0) > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderQuotesList}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <section className="pt-6 border-t border-white/5">
            <AggerQuoteButton formData={formData} />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onCancel()}
                className="flex-1 h-12 bg-[#1A1C1E] border border-white/5 rounded-xl text-[#8E8E93] font-black uppercase text-[10px] tracking-[0.3em] hover:bg-[#1C1E20] hover:text-white transition-all active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-[2] h-12 bg-gradient-to-r from-[#D4A854] to-[#CFA764] text-black rounded-xl font-black uppercase text-[11px] tracking-[0.35em] flex items-center justify-center gap-2.5 shadow-[0_10px_40px_rgba(212,168,84,0.22)] hover:brightness-110 active:scale-[0.98] transition-all border-b-2 border-[#8B6B2D] relative overflow-hidden group/save disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-4 h-4 group-hover/save:scale-110 transition-transform" />}
                <span>{isSaving ? 'Processando...' : 'Salvar Cadastro'}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
              </button>
            </div>
            <p className="text-center text-[9px] text-[#8E8E93]/40 font-bold uppercase tracking-[0.3em] mt-4">CRM Michelin Seguros • v1.0 • 2026</p>
          </section>
        </div>
      </form>

        </motion.div>

        {/* Exit confirm — rendered inside the z-[9999] container so it sits above the backdrop */}
        <AnimatePresence>
          {showExitConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setShowExitConfirm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 12 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="bg-[#0B0B0D] border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                <p className="text-sm font-black text-white uppercase tracking-widest">Alterações não salvas</p>
                <p className="text-[11px] text-[#8E8E93] mt-2 mb-8 leading-relaxed">
                  Campos foram alterados mas não foram salvos.<br />Deseja sair sem salvar?
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setShowExitConfirm(false)}
                    className="h-12 bg-gradient-to-r from-[#D4A854] to-[#CFA764] text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:brightness-110 transition-all active:scale-[0.98]"
                  >
                    Continuar Editando
                  </button>
                  <button
                    onClick={() => { setShowExitConfirm(false); onCancel(); }}
                    className="h-12 bg-white/5 border border-white/10 text-red-400 font-bold uppercase text-[10px] tracking-widest rounded-xl hover:bg-red-500/10 hover:border-red-500/30 transition-all active:scale-[0.98]"
                  >
                    Sair sem salvar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Universal Document Viewer & Validator */}
      <UniversalDocumentViewer
        isOpen={viewerState.isOpen}
        url={viewerState.url}
        storagePath={viewerState.storagePath}
        type={viewerState.type}
        title={viewerState.title}
        data={viewerState.data}
        debug={viewerState.debug}
        onConfirm={viewerState.onConfirm}
        onClose={() => {
          controller.release();
          hydrationLockRef.current.clear();
          setViewerState({ isOpen: false });
        }}
      />
    </>
  );
});

const AggerQuoteButton: React.FC<{ formData: Partial<Lead> }> = ({ formData }) => {
  const { installed } = useAggerUserscriptInstalled();
  const [sending, setSending] = useState(false);
  const canQuote = !!formData.name && !!formData.cpf && !!formData.plate;

  const handleClick = async () => {
    if (!canQuote || sending) return;

    if (installed) {
      setSending(true);
      try {
        const rt = (window as any).chrome?.runtime;
        const payload = buildAggerPayload(formData as Lead);
        await new Promise<void>((resolve, reject) => {
          rt.sendMessage(EXTENSION_ID, { acao: 'preencher_form', dados: payload }, (response: any) => {
            const err = rt.lastError;
            if (err || !response?.ok) {
              reject(new Error((err as any)?.message || 'Falha ao enviar para a extensão'));
            } else {
              resolve();
            }
          });
        });
      } catch {
        // Fallback: abre via URL caso a extensão falhe
        const url = buildAggerQuoteUrl(formData as Lead);
        window.open(url, '_blank', 'noopener,noreferrer');
      } finally {
        setSending(false);
      }
    } else {
      const url = buildAggerQuoteUrl(formData as Lead);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canQuote || sending}
        className={cn(
          "w-full h-12 rounded-xl font-black uppercase text-[11px] tracking-[0.3em] flex items-center justify-center gap-2.5 transition-all border-b-2",
          canQuote && !sending
            ? "bg-gradient-to-r from-amber-500 to-gold-deep text-brand-dark border-amber-700 hover:brightness-110 active:scale-[0.99] shadow-[0_8px_30px_rgba(212,168,84,0.18)]"
            : "bg-white/5 text-white/30 border-transparent cursor-not-allowed"
        )}
        title={
          !canQuote
            ? 'Preencha nome, CPF e placa para cotar'
            : installed
            ? 'Envia os dados para a extensão Michelin Seguros abrir o Aggilizador'
            : 'Abre o Aggilizador com os dados deste lead'
        }
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        <span>{sending ? 'Enviando...' : 'Cotar no Agger'}</span>
      </button>
      {!installed && canQuote && (
        <p className="text-center text-[9px] text-amber-300/60 font-bold uppercase tracking-[0.2em] mt-2">
          Instale a extensão Michelin Seguros no Chrome para preenchimento automático
        </p>
      )}
    </div>
  );
};
