
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X, Save, Trash2, FileUp, Loader2, MapPin, Sparkles, CheckCircle2,
  AlertCircle, Download, Eye, Users, ChevronDown, ChevronUp,
  Flame, Thermometer, Bot, User as UserIcon, Calendar, Clock, Lock as LockIcon,
  FilePlus, PhoneCall, Smartphone, ShieldCheck, Mail, ClipboardList, Info,
  GripVertical, UserCheck, Briefcase, Car, Wallet, FileText, Upload, Filter,
  Target, TrendingUp, Search, FileCheck, ArrowRight, Building2, Timer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PDFViewer } from '../../components/PDFViewer';
import { Modal } from '../../components/Modal';
import { useViewport } from '../../hooks/useAppContexts';
import { Lead, LeadStatus, LeadTemperature, AgentConfig, UserProfile, LeadDocument, DocumentProcessingStage } from '../../types';
import { agentService } from '../../services/agentService';
import { validateLead } from '../../lib/validation';
import { cn, formatCPF, validateCPF, generateId } from '../../lib/utils';
import { format } from 'date-fns';
import { StorageService } from '../../services/StorageService';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { logger } from '../../services/LoggerService';
import { standardizeLeadData } from '../../lib/lead-utils';
import { DataService } from '../../services/DataService';
import { auth } from '../../lib/firebase';
import { OCRService } from '../../services/OCRService';
import { DocumentSessionController, DocumentPipelineState } from '../../services/document-engine/DocumentSessionController';
import { UniversalDocumentViewer } from '../../components/UniversalDocumentViewer';

interface LeadFormProps {
  lead?: Lead | null;
  onSave: (lead: Lead, options?: { silent?: boolean }) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  agentConfig?: AgentConfig;
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

const normalizePhone = (phone: string) => phone.replace(/\D/g, '');

const INSURANCE_COMPANIES = [
  'Porto', 'Azul', 'Tokio Marine', 'Allianz', 'HDI', 'Mapfre',
  'Bradesco', 'SulAmérica', 'Itaú', 'Liberty', 'Yelum', 'Mitsui', 'Suhai',
];

type CountdownColor = 'green' | 'yellow' | 'red';

const calculateInsuranceCountdown = (dateStr: string): { label: string; color: CountdownColor } => {
  if (!dateStr) return { label: '', color: 'green' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return { label: `Apólice vencida há ${abs} dia${abs !== 1 ? 's' : ''}`, color: 'red' };
  }
  if (diffDays === 0) return { label: 'Vence hoje', color: 'red' };

  const base = new Date(today);
  let months = (expiry.getFullYear() - base.getFullYear()) * 12 + (expiry.getMonth() - base.getMonth());
  if (expiry.getDate() < base.getDate()) months--;
  const afterMonths = new Date(base);
  afterMonths.setMonth(afterMonths.getMonth() + months);
  const remainDays = Math.round((expiry.getTime() - afterMonths.getTime()) / 86400000);

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);
  if (remainDays > 0) parts.push(`${remainDays} dia${remainDays !== 1 ? 's' : ''}`);
  const label = parts.length > 0 ? `Faltam ${parts.join(' e ')}` : 'Vence hoje';
  const color: CountdownColor = diffDays > 60 ? 'green' : diffDays > 30 ? 'yellow' : 'red';
  return { label, color };
};

// --- UI COMPONENTS ---

const PremiumSection = React.memo(({ title, subtitle, icon: Icon, children, badge }: any) => (
  <div className="bg-[#111214] rounded-2xl border border-white/5 overflow-hidden mb-6 group transition-all hover:border-[#D4A85420]">
    <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent">
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-[#D4A85410] text-[#D4A854] ring-1 ring-[#D4A85420]">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-white flex items-center gap-2">
            {title}
          </h4>
          {subtitle && <p className="text-[9px] text-[#8E8E93] font-medium uppercase tracking-widest mt-1 opacity-70">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>
    <div className="p-6">
      {children}
    </div>
  </div>
));

const PremiumInput = React.memo(({ label, icon: Icon, required, readOnly, ...props }: any) => (
  <div className="space-y-1.5 w-full group">
    <label className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-widest ml-1 group-focus-within:text-[#D4A854] transition-colors">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      <input
        {...props}
        className={cn(
          "w-full h-11 bg-[#1A1C1E] border border-white/10 rounded-xl px-4 text-[12px] font-medium text-white transition-all focus:ring-2 focus:ring-[#D4A85420] focus:border-[#D4A85440] placeholder:text-white/10 outline-none",
          props.className,
          Icon && "pl-11",
          readOnly && "opacity-50 cursor-not-allowed bg-white/[0.02]"
        )}
        readOnly={readOnly}
      />
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]/40 group-focus-within:text-[#D4A854]/60 transition-colors" />}
    </div>
  </div>
));

const PremiumSelect = React.memo(({ label, icon: Icon, required, options, ...props }: any) => (
  <div className="space-y-1.5 w-full group">
    <label className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-widest ml-1 group-focus-within:text-[#D4A854] transition-colors">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      <select
        {...props}
        className={cn(
          "w-full h-11 bg-[#1A1C1E] border border-white/10 rounded-xl px-4 pr-10 text-[12px] font-medium text-white transition-all focus:ring-2 focus:ring-[#D4A85420] focus:border-[#D4A85440] outline-none appearance-none cursor-pointer",
          props.className,
          Icon && "pl-11"
        )}
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value} className="bg-[#111214]">{opt.label}</option>
        ))}
      </select>
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]/40 group-focus-within:text-[#D4A854]/60 transition-colors pointer-events-none" />}
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]/40 pointer-events-none" />
    </div>
  </div>
));

const PremiumCardToggle = React.memo(({ label, description, icon: Icon, active, onChange }: any) => (
  <div 
    onClick={() => onChange(!active)}
    className={cn(
      "p-5 rounded-2xl border transition-all flex items-start gap-4 cursor-pointer group select-none relative overflow-hidden",
      active 
        ? "bg-[#D4A85408] border-[#D4A85440] ring-1 ring-[#D4A85420] shadow-[0_0_20px_rgba(212,168,84,0.05)]" 
        : "bg-[#1A1C1E] border-white/5 hover:border-white/10 hover:bg-[#1C1E20]"
    )}
  >
    <div className={cn(
      "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
      active ? "bg-[#D4A854] text-black scale-105" : "bg-white/5 text-[#8E8E93]/40 group-hover:bg-white/10"
    )}>
      <Icon className="w-5 h-5" />
    </div>
    <div className="flex-1 min-w-0 pr-8">
      <p className={cn("text-[11px] font-black uppercase tracking-tight transition-colors", active ? "text-[#D4A854]" : "text-white")}>{label}</p>
      <p className="text-[9px] text-[#8E8E93] font-medium leading-relaxed mt-1 opacity-70">{description}</p>
    </div>
    <div className={cn(
      "absolute top-5 right-5 w-5 h-5 rounded-md border transition-all flex items-center justify-center",
      active ? "bg-[#D4A854] border-[#D4A854]" : "border-white/10 bg-black/20"
    )}>
      {active && <CheckCircle2 className="w-3 h-3 text-black" strokeWidth={3} />}
    </div>
  </div>
));

const InsuranceCompanySelect = React.memo(({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [query, setQuery] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = INSURANCE_COMPANIES.filter(c =>
    c.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (company: string) => {
    setQuery(company);
    onChange(company);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    setIsOpen(true);
  };

  return (
    <div className="space-y-1.5 w-full group relative" ref={ref}>
      <label className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-widest ml-1 group-focus-within:text-[#D4A854] transition-colors">
        Seguradora Atual
      </label>
      <div className="relative">
        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]/40 group-focus-within:text-[#D4A854]/60 transition-colors pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="Ex: Porto, Allianz..."
          className="w-full h-11 bg-[#1A1C1E] border border-white/10 rounded-xl pl-11 pr-10 text-[12px] font-medium text-white transition-all focus:ring-2 focus:ring-[#D4A85420] focus:border-[#D4A85440] placeholder:text-white/10 outline-none"
        />
        <ChevronDown className={cn("absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]/40 transition-transform pointer-events-none", isOpen && "rotate-180")} />
      </div>
      <AnimatePresence>
        {isOpen && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 bg-[#111214] border border-white/10 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          >
            {filtered.map(company => (
              <button
                key={company}
                type="button"
                onClick={() => handleSelect(company)}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-[11px] font-medium transition-all flex items-center gap-3",
                  value === company
                    ? "bg-[#D4A85420] text-[#D4A854]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                {value === company && <CheckCircle2 className="w-3 h-3 text-[#D4A854] shrink-0" />}
                {company}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const InsuranceCountdownBadge = React.memo(({ dateStr }: { dateStr: string }) => {
  const { label, color } = useMemo(() => calculateInsuranceCountdown(dateStr), [dateStr]);
  if (!label) return null;

  const colorMap = {
    green: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'shadow-[0_0_12px_rgba(52,211,153,0.15)]' },
    yellow: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.15)]' },
  }[color];

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wide shrink-0",
      colorMap.bg, colorMap.border, colorMap.text, colorMap.glow
    )}>
      <Timer className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
});

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

export const LeadForm = React.memo(({ lead, onSave, onCancel, onDelete, agentConfig: externalAgentConfig }: LeadFormProps) => {
  const viewport = useViewport();
  const [formData, setFormData] = useState<Partial<Lead>>(() => {
    const initial = lead ? { ...INITIAL_LEAD, ...lead } : {
      ...INITIAL_LEAD,
      id: generateId()
    };
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


  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;

    if (name === 'phone') {
      const formatted = formatPhone(value);
      setFormData(prev => ({ ...prev, phone: formatted, normalizedPhone: normalizePhone(formatted) }));
      setIsDirty(true);
      return;
    }
    if (name === 'cpf' || name === 'cpfProprietario') val = formatCpf(value);
    if (name === 'name' || name === 'nomeProprietario' || name === 'plate' || name === 'chassi') {
      val = typeof val === 'string' ? val.toUpperCase() : val;
    }
    if (name === 'possuiSeguro' && val === false) {
      setFormData(prev => ({
        ...prev,
        possuiSeguro: false,
        hasInsurance: false,
        insuranceBroker: '',
        insuranceCompany: '',
        insuranceExpirationDate: '',
      }));
      setIsDirty(true);
      return;
    }

    setFormData(prev => ({ ...prev, [name]: val }));
    setIsDirty(true);

    if (name === 'cepPernoite' && value.replace(/\D/g, '').length === 8) {
      handleCepLookup(value);
    }
  };

  const handleCepLookup = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        const address = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
        setFormData(prev => ({ ...prev, enderecoAuto: address }));
      }
    } catch (error) {
      console.error('Error fetching CEP:', error);
    } finally {
      setLoadingCep(false);
    }
  };


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

  const handleDocUpload = async (e: any) => {
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
      
      const { structuredData, debug, fileUrl } = await OCRService.processDocument(file, { 
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
      
      // Update session with data and move to validating
      controller.updateState(DocumentPipelineState.VALIDATING, mappedData, undefined, fileUrl);
      console.log(`[OCR_PIPELINE_VALIDATION_OPEN] Extraction success`);
    } catch (error: any) {
      console.error('[OCR_PIPELINE_FAILED]', error);
      const userMsg = error.message.includes('PIPELINE_FAILED') 
        ? error.message.split(': ')[1] 
        : 'Falha técnica no pipeline de extração regional.';
      
      hydrationLockRef.current.delete(type);
      controller.updateState(DocumentPipelineState.FAILED, null, userMsg);
    }
  };

  const handleQuoteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
      addressOvernight: formData.enderecoAuto || formData.addressOvernight,
      civilStatus: formData.maritalStatus || formData.civilStatus,
      isOwnerDriver: formData.proprietarioEhCondutor ?? formData.isOwnerDriver,
      ownerName: formData.nomeProprietario || formData.ownerName,
      ownerCpfCnpj: formData.cpfProprietario || formData.ownerCpfCnpj,
      fiduciaryAlienation: formData.alienacaoFiduciaria ?? formData.fiduciaryAlienation,
      nextReturnAt: formData.proximoRetorno || formData.nextReturnAt,
      responsibleAgentId: formData.responsibleUserId || formData.responsibleAgentId,
      responsibleAgentName: formData.responsibleAgentName || crmUsers.find(u => u.uid === (formData.responsibleUserId || formData.responsibleAgentId))?.name || 'Sem agente',
      normalizedPhone: normalizePhone(formData.phone || ''),
      insuranceBroker: (formData.possuiSeguro ?? formData.hasInsurance) ? (formData.insuranceBroker || '') : '',
      insuranceCompany: (formData.possuiSeguro ?? formData.hasInsurance) ? (formData.insuranceCompany || '') : '',
      insuranceExpirationDate: (formData.possuiSeguro ?? formData.hasInsurance) ? (formData.insuranceExpirationDate || '') : '',
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
  };

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] z-[9999] flex flex-col bg-[#050505] text-white overflow-hidden isolate">
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
        <div className="w-full max-w-5xl mx-auto py-12 px-6 md:px-12 space-y-16 pb-40">
          
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

          {/* Section 1: Contato e Condutor */}
          <PremiumSection title="Informações de Contato e Condutor" icon={UserIcon} subtitle="Identificação e localização do segurado">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PremiumInput label="Nome Completo" name="name" value={formData.name || ''} onChange={handleChange} required placeholder="Digite o nome completo" />
              <PremiumInput label="Telefone (WhatsApp)" name="phone" value={formData.phone || ''} onChange={handleChange} required placeholder="(00) 00000-0000" icon={Smartphone} />
              
              <div className="grid grid-cols-2 gap-6">
                <PremiumInput label="CPF" name="cpf" value={formData.cpf || ''} onChange={handleChange} required placeholder="000.000.000-00" />
                <PremiumInput label="Data de Nascimento" name="birthDate" type="date" value={formData.birthDate || ''} onChange={handleChange} required className="[color-scheme:dark]" />
              </div>
              
              <PremiumInput label="E-mail" name="email" value={formData.email || ''} onChange={handleChange} placeholder="seu@email.com" icon={Mail} />
              
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:col-span-2">
                <div className="relative group">
                  <PremiumInput label="CEP Pernoite" name="cepPernoite" value={formData.cepPernoite || formData.zipCodeOvernight || ''} onChange={handleChange} placeholder="00000-000" icon={MapPin} />
                  {loadingCep && <Loader2 className="absolute right-4 top-10 w-4 h-4 animate-spin text-[#D4A854]" />}
                </div>
                <PremiumInput label="Endereço Auto-preenchido" name="enderecoAuto" value={formData.enderecoAuto || formData.addressOvernight || ''} readOnly placeholder="Informe o CEP acima" />
              </div>
            </div>
          </PremiumSection>

          {/* Section 2: Inteligência Comercial */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-[#111214] rounded-2xl border border-white/5 p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Flame className="w-5 h-5 text-[#D4A854]" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Status do Lead</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-[#D4A85410] border border-[#D4A85420] text-[#D4A854] text-[8px] font-black uppercase tracking-tighter shadow-[0_0_10px_rgba(212,168,84,0.1)]">
                  {formData.statusLead || formData.status}
                </div>
              </div>
              <PremiumSelect 
                className="mt-4 border-none bg-transparent h-10 px-0 focus:ring-0"
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
            </div>
            <div className="bg-[#111214] rounded-2xl border border-white/5 p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Thermometer className="w-5 h-5 text-[#D4A854]" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Temperatura</p>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter shadow-sm",
                  formData.temperatura === 'quente' ? "bg-red-500/10 border border-red-500/20 text-red-500" :
                  formData.temperatura === 'morno' ? "bg-orange-500/10 border border-orange-500/20 text-orange-500" :
                  "bg-blue-500/10 border border-blue-500/20 text-blue-500"
                )}>
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", formData.temperatura === 'quente' ? "bg-red-500" : formData.temperatura === 'morno' ? "bg-orange-500" : "bg-blue-500")} />
                    {(formData.temperatura || formData.temperature || 'morno').toUpperCase()}
                  </div>
                </div>
              </div>
              <PremiumSelect 
                className="mt-4 border-none bg-transparent h-10 px-0 focus:ring-0"
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
          </div>

          {/* Section 3: Classificação */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <PremiumSelect 
              label="Origem" name="origin" value={formData.origin || ''} onChange={handleChange} 
              options={[
                { value: 'Manual', label: 'Manual' },
                { value: 'WhatsApp', label: 'WhatsApp' },
                { value: 'Importado', label: 'Importado' },
                { value: 'Instagram', label: 'Instagram' },
              ]} 
            />
            <PremiumSelect 
              label="Perfil do Lead" name="perfilLead" value={formData.perfilLead || ''} onChange={handleChange} 
              options={[
                { value: '', label: 'Não identificado' },
                { value: 'residencial', label: 'Residencial' },
                { value: 'comercial', label: 'Comercial' },
                { value: 'frota', label: 'Frota' },
              ]} 
            />
            <PremiumInput label="Score (0-10)" type="number" min="0" max="10" name="score" value={formData.score || 0} onChange={handleChange} />
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-widest ml-1">IA Inteligente</label>
              <div className="h-11 flex items-center justify-between px-4 bg-[#1A1C1E] border border-white/10 rounded-xl group hover:border-[#D4A85440] transition-all">
                <span className="text-[9px] font-black uppercase text-white/40 tracking-wider">{(formData.iaEnabled ?? formData.iaActive) ? 'Ativada' : 'Desativada'}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="iaEnabled" checked={!!(formData.iaEnabled ?? formData.iaActive)} onChange={handleChange} className="sr-only peer" />
                  <div className="w-9 h-5 bg-white/5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[#D4A854] after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#D4A854]"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Justificativa */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <label className="text-[9px] font-bold text-[#8E8E93] uppercase tracking-widest">Justificativa da Classificação</label>
              <span className="text-[8px] text-[#8E8E93]/40 font-mono">{(formData.justificativa || '').length}/500</span>
            </div>
            <textarea 
              name="justificativa" 
              value={formData.justificativa || formData.classificationReason || ''} 
              onChange={handleChange} 
              rows={4} 
              maxLength={500}
              placeholder="Descreva o motivo da pontuação e temperatura..."
              className="w-full p-4 bg-[#1A1C1E] border border-white/10 rounded-2xl text-[12px] font-medium text-white transition-all focus:ring-2 focus:ring-[#D4A85420] focus:border-[#D4A85440] outline-none placeholder:text-white/5 resize-none"
            />
          </div>


          {/* Veículo e Seguro */}
          <PremiumSection title="Veículo e Seguro" icon={ShieldCheck} subtitle="Dados técnicos do bem segurado">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PremiumInput label="Placa" name="plate" value={formData.plate || ''} onChange={handleChange} placeholder="ABC1D23" />
              <PremiumInput label="Chassi" name="chassi" value={formData.chassi || formData.chassis || ''} onChange={handleChange} placeholder="Identificador do Chassi" />
            </div>
            <div className="mt-8 flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full transition-all", (formData.possuiSeguro ?? formData.hasInsurance) ? "bg-[#D4A854] shadow-[0_0_8px_rgba(212,168,84,0.5)]" : "bg-white/10")} />
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Já possui seguro ativo?</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="possuiSeguro" checked={!!(formData.possuiSeguro ?? formData.hasInsurance)} onChange={handleChange} className="sr-only peer" />
                <div className="w-10 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[#D4A854] after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#D4A854]"></div>
              </label>
            </div>

            <AnimatePresence>
              {!!(formData.possuiSeguro ?? formData.hasInsurance) && (
                <motion.div
                  key="insurance-fields"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 p-5 bg-[#D4A85406] border border-[#D4A85420] rounded-2xl space-y-4">
                    <div className="flex items-center gap-2.5 pb-1">
                      <div className="p-1.5 rounded-lg bg-[#D4A85415] ring-1 ring-[#D4A85425]">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#D4A854]" />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D4A854]">Dados da Apólice Atual</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <PremiumInput
                        label="Corretora Atual"
                        name="insuranceBroker"
                        value={formData.insuranceBroker || ''}
                        onChange={handleChange}
                        placeholder="Ex: Michelin Seguros"
                        icon={Building2}
                      />
                      <InsuranceCompanySelect
                        value={formData.insuranceCompany || ''}
                        onChange={(v: string) => setFormData(p => ({ ...p, insuranceCompany: v }))}
                      />
                    </div>

                    <div className="flex flex-col md:flex-row md:items-end gap-4">
                      <div className="w-full md:flex-1">
                        <PremiumInput
                          label="Fim da Vigência"
                          name="insuranceExpirationDate"
                          type="date"
                          value={formData.insuranceExpirationDate || ''}
                          onChange={handleChange}
                          className="[color-scheme:dark]"
                          icon={Calendar}
                        />
                      </div>
                      {formData.insuranceExpirationDate && (
                        <InsuranceCountdownBadge dateStr={formData.insuranceExpirationDate} />
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </PremiumSection>

          {/* Perfil de Uso */}
          <PremiumSection title="Perfil de Uso" icon={TrendingUp} subtitle="Hábito de utilização do veículo">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Uploads */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#D4A854]" />
                   <p className="text-[10px] font-black uppercase tracking-widest">Documentação e Extração IA</p>
                </div>
                <span className="text-[9px] font-bold text-[#8E8E93] uppercase">{Object.keys(formData.documents || {}).length} anexos</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
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

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-[#D4A854]" />
                   <p className="text-[10px] font-black uppercase tracking-widest">Cotação apresentada ao cliente</p>
                </div>
                <span className="text-[9px] font-bold text-[#8E8E93] uppercase">{formData.cotacaoFiles?.length || 0} anexos</span>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div 
                  onClick={() => quoteInputRef.current?.click()}
                  className="h-36 border-2 border-dashed border-white/5 bg-[#1A1C1E] hover:border-[#D4A85440] hover:bg-[#D4A85408] rounded-2xl flex flex-col items-center justify-center gap-3 transition-all group"
                >
                  <input type="file" ref={quoteInputRef} className="hidden" onChange={handleQuoteUpload} accept="image/*,application/pdf" />
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-[#8E8E93] group-hover:bg-[#D4A854] group-hover:text-black transition-all">
                    <FilePlus className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase text-white tracking-widest">Anexar Nova Cotação</p>
                    <p className="text-[8px] text-[#8E8E93] font-bold uppercase tracking-[0.2em] mt-1">PDF, JPG ou PNG até 10MB</p>
                  </div>
                </div>
                {/* List of Quotes */}
                <div className="space-y-3">
                  {renderQuotesList}
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions - Integrated at the end of content per design */}
          <section className="pt-16 border-t border-white/5 relative">
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                type="button" 
                onClick={() => isDirty ? setShowExitConfirm(true) : onCancel()}
                className="flex-1 h-16 bg-[#1A1C1E] border border-white/5 rounded-2xl text-[#8E8E93] font-black uppercase text-[11px] tracking-[0.3em] hover:bg-[#1C1E20] hover:text-white transition-all shadow-xl active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={isSaving}
                className="flex-[2] h-16 bg-gradient-to-r from-[#D4A854] to-[#CFA764] text-black rounded-2xl font-black uppercase text-[12px] tracking-[0.4em] flex items-center justify-center gap-3 shadow-[0_15px_60px_rgba(212,168,84,0.25)] hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] transition-all border-b-4 border-[#8B6B2D] relative overflow-hidden group/save"
              >
                {isSaving ? <Loader2 className="w-7 h-7 animate-spin" /> : <Save className="w-5 h-5 group-hover/save:scale-110 transition-transform" />}
                <span>{isSaving ? 'Processando...' : 'Salvar Cadastro'}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              </button>
            </div>
            <p className="text-center text-[10px] text-[#8E8E93]/40 font-bold uppercase tracking-[0.3em] mt-8">CRM Michelin Seguros • v1.0 • 2026</p>
          </section>
        </div>
      </form>

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
          setViewerState({ isOpen: false });
          if (controller.isActive()) {
            controller.release();
            hydrationLockRef.current.clear();
          }
        }}
      />

      <AnimatePresence>
        {showExitConfirm && (
          <Modal isOpen={showExitConfirm} onClose={() => setShowExitConfirm(false)} title="Abandonar?" maxWidth="max-w-sm">
            <div className="p-8 text-center bg-[#0B0B0D]">
               <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
               <p className="text-sm font-bold text-white uppercase tracking-tight">Alterações não salvas</p>
               <p className="text-[10px] text-[#8E8E93] mt-2 mb-8">Deseja realmente sair sem salvar?</p>
               <div className="flex flex-col gap-3">
                 <button onClick={() => setShowExitConfirm(false)} className="h-12 bg-[#D4A854] text-black font-black uppercase text-[10px] tracking-widest rounded-xl">Continuar Editando</button>
                 <button onClick={() => onCancel()} className="h-12 bg-white/5 text-red-500 font-bold uppercase text-[10px] tracking-widest rounded-xl">Sair sem salvar</button>
               </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
});
