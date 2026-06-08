import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Link2, Key, Globe, RefreshCcw, CheckCircle2, AlertCircle, ShieldAlert, Code, Info, FileText, Bot, Wand2, Palette, Image as ImageIcon, Trash2, Upload, Moon, Sun, ShieldCheck, Lock, MessageSquare, BookOpen, Activity, Wrench, HelpCircle, Settings as Cog, Zap, Building2, Phone, Mail, Clock, Database, Users, Star, Shield } from 'lucide-react';
import { IntegrationConfig, VisualIdentityConfig, Theme, Permissions, UserProfile, Empresa } from '../../types';
import { EmpresaService } from '../../services/EmpresaService';
import { UserManagement } from '../admin/UserManagement';
import { SystemDocumentationModal } from './SystemDocumentationModal';
import { PerformanceDashboard } from '../dashboard/PerformanceDashboard';
import { agentService } from '../../services/agentService';
import { cn } from '../../lib/utils';
import { useTheme } from '../../hooks/useAppContexts';
import { motion, AnimatePresence } from 'motion/react';

import { DataService } from '../../services/DataService';
import { StorageService } from '../../services/StorageService';
import { DiagnosticDashboard } from '../admin/DiagnosticDashboard';
import { SystemHealth } from './SystemHealth';
import { AdminTools } from '../admin/AdminTools';
import { auth } from '../../lib/firebase';
import { CacheManager } from '../../services/CacheManager';
import { AIDocumentExtractionPanel } from './AIDocumentExtractionPanel';
import { AggerToolSettings } from '../../components/AggerToolSettings';

interface SettingsProps {
  canManageUsers?: boolean;
  onOpenDocs?: () => void;
  onOpenAgent?: () => void;
  visualConfig: VisualIdentityConfig;
  onUpdateVisualConfig: (config: VisualIdentityConfig) => void;
  permissions?: Permissions;
  userProfile?: UserProfile | null;
}

const HelpButton = ({ title, description, usage }: { title: string, description: string, usage: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative inline-block ml-2">
      <button 
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="p-1.5 text-gold-light/40 hover:text-gold-deep transition-colors bg-brand-black rounded-lg border border-white/5"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="absolute z-[100] left-full ml-3 top-0 w-64 p-4 bg-brand-black border border-gold-deep/20 rounded-2xl shadow-2xl backdrop-blur-xl"
          >
            <h4 className="text-[10px] font-black text-gold-deep uppercase tracking-widest mb-2 flex items-center gap-2">
              <Info className="w-3 h-3" /> {title}
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight mb-1">O que é:</p>
                <p className="text-xs text-slate-300 leading-relaxed font-medium">{description}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight mb-1">Como usar:</p>
                <p className="text-xs text-slate-400 leading-relaxed italic">{usage}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Empresa Profile — read-only view for company admins
// ---------------------------------------------------------------------------

function EmpresaPerfil({ organizationId }: { organizationId: string }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    EmpresaService.getEmpresa(organizationId)
      .then(setEmpresa)
      .finally(() => setLoading(false));
  }, [organizationId]);

  const PLAN_LABELS: Record<string, string> = {
    basico: 'Básico',
    profissional: 'Profissional',
    enterprise: 'Enterprise',
  };

  const STATUS_LABELS: Record<string, string> = {
    trial: 'Trial',
    active: 'Ativa',
    suspended: 'Suspensa',
    cancelled: 'Cancelada',
  };

  const STATUS_COLORS: Record<string, string> = {
    trial: 'text-[#D4A854] bg-[#D4A854]/10 border-[#D4A854]/20',
    active: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    suspended: 'text-red-400 bg-red-500/10 border-red-500/20',
    cancelled: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };

  const maskCnpj = (v: string) => {
    const d = v.replace(/\D/g, '');
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatStorage = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-[#D4A854]/30 border-t-[#D4A854] rounded-full animate-spin" />
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        Perfil da empresa não encontrado.
      </div>
    );
  }

  const Row = ({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) => (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0">
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-[#8E8E93]/60" />
      </div>
      <div className="flex-1 flex items-baseline justify-between gap-4 min-w-0">
        <span className="text-[10px] font-bold text-[#8E8E93]/60 uppercase tracking-widest flex-shrink-0">{label}</span>
        <span className="text-[12px] font-semibold text-white/80 truncate text-right">{value || '—'}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#D4A854]/[0.05] border border-[#D4A854]/15">
        <div className="w-12 h-12 rounded-xl bg-[#D4A854]/10 border border-[#D4A854]/20 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-6 h-6 text-[#D4A854]" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-black text-white truncate">{empresa.nomeRazaoSocial}</h3>
          {empresa.nomeFantasia && (
            <p className="text-[11px] text-[#8E8E93]/70 truncate">{empresa.nomeFantasia}</p>
          )}
        </div>
        <div className="ml-auto flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={cn(
            'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border',
            STATUS_COLORS[empresa.status] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20',
          )}>
            {STATUS_LABELS[empresa.status] ?? empresa.status}
          </span>
          <span className="text-[9px] font-bold text-[#D4A854]/80 uppercase tracking-widest">
            {PLAN_LABELS[empresa.planoSaas] ?? empresa.planoSaas}
          </span>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0E0F11]/70 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.04] bg-gradient-to-r from-[#D4A854]/[0.04] to-transparent">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D4A854]/80">Dados Cadastrais</p>
        </div>
        <div className="px-5">
          <Row label="CNPJ" value={maskCnpj(empresa.cnpj)} icon={FileText} />
          <Row label="E-mail Corporativo" value={empresa.emailCorporativo} icon={Mail} />
          <Row label="Telefone" value={empresa.telefone ?? '—'} icon={Phone} />
          <Row label="Fuso Horário" value={empresa.timezone} icon={Clock} />
        </div>
      </div>

      {/* Plan limits */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0E0F11]/70 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.04] bg-gradient-to-r from-[#D4A854]/[0.04] to-transparent">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D4A854]/80">Limites do Plano</p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-white/[0.04] overflow-hidden">
          {[
            { label: 'Usuários', value: empresa.limiteUsuarios >= 999 ? 'Ilimitado' : String(empresa.limiteUsuarios), icon: Users },
            { label: 'Leads / mês', value: empresa.limiteLeadsMes >= 999999 ? 'Ilimitado' : empresa.limiteLeadsMes.toLocaleString('pt-BR'), icon: Star },
            { label: 'Storage', value: formatStorage(empresa.limiteStorageMb), icon: Database },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-[#0E0F11]/70 p-4 flex flex-col items-center gap-2">
              <Icon className="w-4 h-4 text-[#D4A854]/60" />
              <span className="text-[14px] font-black text-white">{value}</span>
              <span className="text-[9px] font-bold text-[#8E8E93]/50 uppercase tracking-widest">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dates */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0E0F11]/70 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.04] bg-gradient-to-r from-[#D4A854]/[0.04] to-transparent">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D4A854]/80">Datas</p>
        </div>
        <div className="px-5">
          <Row label="Cadastrada em" value={formatDate(empresa.criadoEm)} icon={Clock} />
          {empresa.status === 'trial' && empresa.trialExpiraEm && (
            <Row label="Trial expira em" value={formatDate(empresa.trialExpiraEm)} icon={Shield} />
          )}
        </div>
      </div>

      <p className="text-[10px] text-[#8E8E93]/40 text-center">
        Para alterar esses dados, entre em contato com o suporte da plataforma.
      </p>
    </div>
  );
}

export function Settings({ canManageUsers, onOpenDocs, onOpenAgent, visualConfig, onUpdateVisualConfig, permissions, userProfile }: SettingsProps) {
  const { theme: currentTheme, setTheme: setAppTheme } = useTheme();
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'diagnostic' | 'health' | 'admin' | 'visual' | 'ai_ocr' | 'empresa'>('general');

  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [isTestMode, setIsTestMode] = useState<boolean>(() => {
    return localStorage.getItem('michelin_test_mode') === 'true';
  });
  const [config, setConfig] = useState<IntegrationConfig>(() => {
    const savedKeys = localStorage.getItem('seguro_crm_api_keys');
    let loadedOrKey = '';
    if (savedKeys) {
      try {
        const parsed = JSON.parse(savedKeys);
        if (parsed.openrouter_api_key) {
          loadedOrKey = parsed.openrouter_api_key;
        }
      } catch (e) {
        console.warn('Malformed API keys storage', e);
      }
    }

    const saved = localStorage.getItem('seguro_crm_n8n_config');
    let n8nParsed = {};
    if (saved) {
      try {
        n8nParsed = JSON.parse(saved);
      } catch (e) {
        console.warn('Malformed n8n config storage', e);
      }
    }

    return { 
      webhookUrl: (n8nParsed as any).webhookUrl || '',
      apiKey: (n8nParsed as any).apiKey || '',
      whatsappApiUrl: (n8nParsed as any).whatsappApiUrl || '',
      openrouterApiKey: loadedOrKey || (n8nParsed as any).openrouterApiKey || ''
    };
  });

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastCheckedKeyRef = useRef<string>('');
  const lastCallRef = useRef<number>(0);

  // Initial load usage if key exists
  useEffect(() => {
    // Deterministic: no usage polling
  }, [config.openrouterApiKey]);

  const handleSave = useCallback(async (currentConfig: IntegrationConfig, testMode: boolean) => {
    console.log('[SETTINGS] handleSave triggered', { hasKey: !!currentConfig.openrouterApiKey, testMode });
    setAutoSaveStatus('saving');
    // Sync Test Mode to localStorage and Firestore
    localStorage.setItem('michelin_test_mode', String(testMode));

    try {
      try {
        await DataService.save('config', 'system', { isTestMode: testMode });
      } catch (e) {
        console.warn('Failed to sync system config to Firestore', e);
      }

      // Save functional configs
      const { openrouterApiKey, ...functionalConfig } = currentConfig;
      localStorage.setItem('seguro_crm_n8n_config', JSON.stringify(functionalConfig));
      
      // Save secrets independently
      const savedKeys = localStorage.getItem('seguro_crm_api_keys');
      let keys = {};
      if (savedKeys) try { keys = JSON.parse(savedKeys); } catch (e) {
        // Ignore parsing errors
      }
      const newKeys = { 
        ...keys, 
        openrouter_api_key: currentConfig.openrouterApiKey
      };
      localStorage.setItem('seguro_crm_api_keys', JSON.stringify(newKeys));

      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
       console.error('Failed to save settings', error);
       setAutoSaveStatus('error');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
       // Only trigger if values are different from initial load (avoid save on mount)
       handleSave(config, isTestMode);
    }, 1500);

    return () => clearTimeout(timer);
  }, [config, isTestMode, handleSave]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const [localVisualConfig, setLocalVisualConfig] = useState<VisualIdentityConfig>(visualConfig);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lightLogoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const lastPropRef = useRef(JSON.stringify(visualConfig));

  // Sync with prop but only if prop actually changed to a different logical value
  useEffect(() => {
    const propStr = JSON.stringify(visualConfig);
    const { updatedAt: _u1, updatedBy: _b1, ...pureProp } = visualConfig;
    const { updatedAt: _u2, updatedBy: _b2, ...pureLocal } = localVisualConfig;
    
    // Logic: Only sync if the prop itself changed since the last time we synced it
    // AND it's different from our local state
    if (propStr !== lastPropRef.current) {
      const isDifferent = JSON.stringify(pureProp) !== JSON.stringify(pureLocal);
      if (isDifferent) {
        console.log('[DEBUG] Prop visualConfig changed logically, syncing local state');
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalVisualConfig(visualConfig);
      }
      lastPropRef.current = propStr;
    }
  }, [visualConfig, localVisualConfig]);

  const compressImage = (dataUrl: string, maxWidth = 400, quality = 0.6): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
        }
        // Force webp for best compression with transparency support
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'logoLight' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const field = type === 'logo' ? 'logoDark' : type === 'logoLight' ? 'logoLight' : 'companyFaviconUrl';
    setAutoSaveStatus('saving');
    setUploadProgress(0);
    
    try {
      console.log(`[BRANDING] Iniciando fluxo de upload para ${type}...`);
      let fileToUpload: File | Blob = file;

      // Only compress logos, favicons should keep their format (often .ico or .png)
      if (type !== 'favicon') {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });

        const compressedDataUrl = await compressImage(dataUrl, 800, 0.8);
        const response = await fetch(compressedDataUrl);
        fileToUpload = await response.blob();
      }

      // 1. Upload using Enterprise Service with Progress
      const assetType = type === 'favicon' ? 'favicon' : type === 'logo' ? 'logoDark' : 'logoLight';
      const { url, path: storagePath } = await StorageService.uploadBranding(
        fileToUpload, 
        assetType as any,
        (progress) => setUploadProgress(progress.percentage)
      );
      
      console.log('[UPLOAD_SUCCESS]', { path: storagePath, url });
      
      const newConfig: VisualIdentityConfig = { 
        ...localVisualConfig, 
        [field]: url,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || 'unknown'
      };
      
      // 2. Persist to Firestore immediately
      console.log('[FIRESTORE_BRANDING_SAVE_START]');
      await DataService.save('settings', 'visual_identity', newConfig);
      console.log('[FIRESTORE_BRANDING_SAVE_SUCCESS]');

      // 3. Invalidate/Update Cache
      CacheManager.set('settings:visual_identity', newConfig);
      console.log('[CACHE_UPDATED_DIRECTLY]');

      // 4. Update local state and trigger parent update
      setLocalVisualConfig(newConfig);
      onUpdateVisualConfig(newConfig);

      // 5. Confirm Persistence
      const confirmed = await DataService.getFromServer('settings', 'visual_identity');
      if (confirmed && confirmed[field] === url) {
        console.log('[BRANDING_PERSISTENCE_CONFIRMED]');
      }
      
      setUploadProgress(null);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[FIRESTORE_BRANDING_SAVE_ERROR]', err);
      setUploadProgress(null);
      setAutoSaveStatus('error');
      alert(`Falha no upload: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  const handleRemoveLogo = async (type: 'logo' | 'logoLight' | 'favicon') => {
    const field = type === 'logo' ? 'logoDark' : type === 'logoLight' ? 'logoLight' : 'companyFaviconUrl';
    const newConfig = { 
      ...localVisualConfig, 
      [field]: '',
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'unknown'
    };
    
    setAutoSaveStatus('saving');
    try {
      await DataService.save('settings', 'visual_identity', newConfig);
      CacheManager.invalidate('settings:visual_identity');
      setLocalVisualConfig(newConfig);
      onUpdateVisualConfig(newConfig);
      
      if (type === 'logo' && fileInputRef.current) fileInputRef.current.value = '';
      if (type === 'logoLight' && lightLogoInputRef.current) lightLogoInputRef.current.value = '';
      if (type === 'favicon' && faviconInputRef.current) faviconInputRef.current.value = '';
      
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to remove asset', err);
      setAutoSaveStatus('error');
    }
  };

  const handleSaveVisual = useCallback(async (configToSave?: VisualIdentityConfig) => {
    const targetConfig = {
      ...(configToSave || localVisualConfig),
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'unknown'
    };
    
    setAutoSaveStatus('saving');
    try {
      await DataService.save('settings', 'visual_identity', targetConfig);
      CacheManager.invalidate('settings:visual_identity');
      onUpdateVisualConfig(targetConfig);
      
      // Also update favicon in the actual DOM
      if (targetConfig.companyFaviconUrl) {
        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = targetConfig.companyFaviconUrl;
      }

      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save visual identity', err);
      setAutoSaveStatus('error');
    }
  }, [localVisualConfig, onUpdateVisualConfig]);

  // Auto-save logic
  useEffect(() => {
    // Only trigger if local state differs logically from what was last persisted (initial prop)
    const { updatedAt: _u1, updatedBy: _b1, ...pureProp } = visualConfig;
    const { updatedAt: _u2, updatedBy: _b2, ...pureLocal } = localVisualConfig;
    
    const isDirty = JSON.stringify(pureProp) !== JSON.stringify(pureLocal);
    
    if (!isDirty) return;

    const timer = setTimeout(() => {
       console.log('[AUTO-SAVE] Triggering visual identity save');
       handleSaveVisual(localVisualConfig);
    }, 2000);

    return () => clearTimeout(timer);
  }, [localVisualConfig, visualConfig, handleSaveVisual]);

  const colors = [
    { name: 'Ouro Michelin', value: '#CFA764' },
    { name: 'Azul Real', value: '#1a365d' },
    { name: 'Verde Esmeralda', value: '#059669' },
    { name: 'Vinho Tinto', value: '#7f1d1d' },
    { name: 'Slate Dark', value: '#0f172a' },
    { name: 'Púrpura Profundo', value: '#4c1d95' }
  ];

  return (
    <div className="flex flex-col min-h-full font-sans">
      <SystemDocumentationModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
      />

      {/* Horizontal Tab Bar */}
      <nav className="flex-shrink-0 sticky top-0 z-10 bg-[#050505] border-b border-white/5 px-2 flex items-center overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('general')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeSubTab === 'general' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <Cog className="w-3.5 h-3.5 flex-shrink-0" /> Geral
        </button>

        {userProfile?.organizationId && !userProfile.superadmin && (
          <button
            onClick={() => setActiveSubTab('empresa')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
              activeSubTab === 'empresa' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
            )}
          >
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" /> Empresa
          </button>
        )}

        <button
          onClick={() => setActiveSubTab('ai_ocr')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeSubTab === 'ai_ocr' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <Bot className="w-3.5 h-3.5 flex-shrink-0" /> OCR IA
        </button>

        {canManageUsers && (
          <button
            onClick={() => setActiveSubTab('diagnostic')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
              activeSubTab === 'diagnostic' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
            )}
          >
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" /> Diagnóstico
          </button>
        )}

        {canManageUsers && (
          <button
            onClick={() => setActiveSubTab('health')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
              activeSubTab === 'health' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
            )}
          >
            <Activity className="w-3.5 h-3.5 flex-shrink-0" /> Saúde
          </button>
        )}

        {canManageUsers && (
          <button
            onClick={() => setActiveSubTab('admin')}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
              activeSubTab === 'admin' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
            )}
          >
            <Wrench className="w-3.5 h-3.5 flex-shrink-0" /> Admin
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 pl-4 py-2 flex-shrink-0">
          <AnimatePresence>
            {autoSaveStatus !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest",
                  autoSaveStatus === 'saving' ? "bg-brand-black text-gold-deep border-gold-deep/20" :
                  autoSaveStatus === 'saved' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                  "bg-red-500/10 text-red-500 border-red-500/20"
                )}
              >
                {autoSaveStatus === 'saving' ? (
                  <><RefreshCcw className="w-2 h-2 animate-spin" /> Salvando...</>
                ) : autoSaveStatus === 'saved' ? (
                  <><CheckCircle2 className="w-2 h-2" /> Salvo</>
                ) : (
                  <><AlertCircle className="w-2 h-2" /> Erro</>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/5">
            <button
              onClick={() => setAppTheme('light')}
              className={cn(
                "flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                currentTheme === 'light' ? "bg-white text-brand-black shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              <Sun className="w-2.5 h-2.5" /> Light
            </button>
            <button
              onClick={() => setAppTheme('dark')}
              className={cn(
                "flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                currentTheme === 'dark' ? "bg-slate-800 text-white shadow-xl" : "text-white/40 hover:text-white"
              )}
            >
              <Moon className="w-2.5 h-2.5" /> Dark
            </button>
          </div>
        </div>
      </nav>

      {/* Dynamic Content Area */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-8 space-y-6">
        {activeSubTab === 'general' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Ferramenta Cotar no Agger — destaque no topo */}
            <AggerToolSettings />

            {/* Sections for General */}
            <section className="bg-brand-dark p-6 rounded-[2rem] border border-white/5 shadow-xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
                  <BookOpen className="w-5 h-5 text-gold-deep" />
                  <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Documentação & Auditoria</h3>
                </div>
                <div className="px-3 py-1 bg-gold-deep/10 rounded-full border border-gold-deep/20">
                  <span className="text-[8px] font-black text-gold-deep uppercase tracking-widest">v2.5.0 Auto-Gen</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs text-white/50 leading-relaxed font-medium">
                    Visualize a arquitetura completa do sistema, fluxos ativos, regras de extração e o pipeline de IA atualizado em tempo real.
                  </p>
                </div>
                <button
                  onClick={() => setIsDocsModalOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-gold-deep/10 hover:bg-gold-deep/20 text-gold-deep border border-gold-deep/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-gold-deep/10"
                >
                  <FileText size={14} />
                  Documentação do Sistema
                </button>
              </div>
            </section>

            <div className="flex flex-col gap-6">
              {/* Identity Section */}
              <section className="bg-brand-dark p-6 rounded-[2rem] border border-gold-deep/20 shadow-xl space-y-6">
                <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
                  <Palette className="w-5 h-5 text-gold-deep" />
                  <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Identidade Visual Michelin</h3>
                  <HelpButton 
                    title="Identidade Visual"
                    description="Configure como sua marca aparece para os atendentes e clientes. O sistema suporta logos diferentes para temas claro e escuro."
                    usage="Clique para fazer upload de imagens. Use o preview à direita para ver como ficará o menu lateral."
                  />
                </div>
                
                <div className="flex flex-col gap-8">
                  <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Assinatura Comercial da Corretora</label>
                <input 
                  type="text" 
                  value={localVisualConfig.companyName}
                  onChange={(e) => setLocalVisualConfig(prev => ({ ...prev, companyName: e.target.value }))}
                  className="w-full px-4 py-3 bg-brand-black border border-white/5 rounded-2xl focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/30 text-slate-100 text-sm font-medium transition-all"
                  placeholder="Ex: Michelin Seguros"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Logo (Fundo Escuro)</label>
                  <div className="relative group aspect-[5/2] max-w-[220px]">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "w-full h-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center bg-black/40 transition-all cursor-pointer overflow-hidden relative",
                        localVisualConfig.logoDark ? "border-gold-deep/30" : "border-white/10 hover:border-gold-deep/50 hover:bg-gold-deep/5"
                      )}
                    >
                      {localVisualConfig.logoDark ? (
                        <div className="relative w-full h-full p-4 flex items-center justify-center">
                          <img 
                            src={localVisualConfig.logoDark} 
                            alt="Logo Dark" 
                            className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105" 
                            onLoad={() => console.log('Logo loaded')}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/400x200/111111/CFA764?text=Logo+Invalida';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2">
                          {uploadProgress !== null ? (
                            <div className="relative w-12 h-12 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/10" />
                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray="125.6" strokeDashoffset={125.6 - (125.6 * uploadProgress) / 100} className="text-gold-deep transition-all duration-300" />
                              </svg>
                              <span className="absolute text-[10px] font-bold text-white mb-2">{Math.round(uploadProgress)}%</span>
                            </div>
                          ) : (
                            <>
                              <ImageIcon className="w-6 h-6 text-slate-600 mb-2" />
                              <span className="text-[9px] font-black uppercase text-slate-500">Logo Escuro</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {localVisualConfig.logoDark && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRemoveLogo('logo'); }}
                        className="absolute -top-2 -right-2 p-2 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    <input type="file" ref={fileInputRef} onChange={(e) => handleLogoUpload(e, 'logo')} accept="image/*" className="hidden" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Logo (Fundo Claro)</label>
                  <div className="relative group aspect-[5/2] max-w-[220px]">
                    <div 
                      onClick={() => lightLogoInputRef.current?.click()}
                      className={cn(
                        "w-full h-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center bg-white transition-all cursor-pointer overflow-hidden relative",
                        localVisualConfig.logoLight ? "border-slate-300" : "border-slate-200 hover:border-gold-deep/50 hover:bg-slate-50"
                      )}
                    >
                      {localVisualConfig.logoLight ? (
                        <div className="relative w-full h-full p-4 flex items-center justify-center">
                          <img 
                            src={localVisualConfig.logoLight} 
                            alt="Logo Light" 
                            className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/400x200/ffffff/333333?text=Logo+Invalida';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2">
                           {uploadProgress !== null ? (
                            <div className="relative w-12 h-12 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-100" />
                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray="125.6" strokeDashoffset={125.6 - (125.6 * uploadProgress) / 100} className="text-gold-deep transition-all duration-300" />
                              </svg>
                              <span className="absolute text-[10px] font-bold text-slate-400 mb-2">{Math.round(uploadProgress)}%</span>
                            </div>
                          ) : (
                            <>
                              <ImageIcon className="w-6 h-6 text-slate-300 mb-2" />
                              <span className="text-[9px] font-black uppercase text-slate-400">Logo Claro</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {localVisualConfig.logoLight && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRemoveLogo('logoLight'); }}
                        className="absolute -top-2 -right-2 p-2 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    <input type="file" ref={lightLogoInputRef} onChange={(e) => handleLogoUpload(e, 'logoLight')} accept="image/*" className="hidden" />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Column 1: Simulação & Cérebro IA */}
        <div className="space-y-6 w-full">
          <section className="bg-brand-dark p-6 rounded-[2rem] border border-gold-deep/20 shadow-xl space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4 mb-2">
              <ShieldAlert className="w-5 h-5 text-gold-deep" />
              <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Ambiente de Simulação</h3>
            </div>
            
            <div className="space-y-4">
               <div className="flex items-center justify-between p-4 bg-brand-black/40 rounded-2xl border border-white/5 transition-all hover:border-gold-deep/30">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                    isTestMode ? "bg-amber-500/10 text-amber-500" : "bg-slate-500/10 text-slate-500"
                  )}>
                    <RefreshCcw className={cn("w-6 h-6", isTestMode && "animate-spin-slow")} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white uppercase tracking-widest">Modo de Teste do chat WhatsApp</p>
                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                      Permite simular conversas e extrações de dados sem precisar enviar mensagens reais via WhatsApp API.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isTestMode}
                    onChange={(e) => setIsTestMode(e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 transition-all"></div>
                </label>
              </div>
            </div>
          </section>

        </div>

        {/* Column 2: Meta Omnichannel */}
        <section className="bg-brand-dark p-6 rounded-[2rem] border border-white/5 shadow-xl space-y-6 w-full">
          <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4 mb-2">
            <MessageSquare className="w-5 h-5 text-gold-deep" />
            <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Omnichannel (Meta)</h3>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Verify Token', name: 'metaVerifyToken', placeholder: 'michelin_secure_token', icon: Lock, type: 'text' },
              { label: 'App Secret', name: 'metaAppSecret', placeholder: 'Certificado de Segurança Meta', icon: ShieldCheck, type: 'password' },
              { label: 'Access Token', name: 'metaAccessToken', placeholder: 'EAA...', icon: Key, type: 'password' },
              { label: 'WhatsApp Phone ID', name: 'whatsappPhoneId', placeholder: 'ID Numérico da Meta', icon: Globe, type: 'text' }
            ].map((field) => (
              <div key={field.name} className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 tracking-widest">{field.label}</label>
                <div className="relative">
                  <field.icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-deep/40" />
                  <input 
                    type={field.type} 
                    name={field.name}
                    value={(config as any)[field.name] || ''}
                    onChange={handleChange}
                    placeholder={field.placeholder}
                    className="w-full pl-11 pr-4 py-3 bg-brand-black border border-white/5 rounded-2xl focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/30 text-slate-100 text-sm font-bold transition-all"
                  />
                </div>
              </div>
            ))}

            <div className="p-6 bg-gold-deep/5 rounded-3xl border border-gold-deep/10 space-y-4">
              <h4 className="text-[10px] font-black text-gold-deep uppercase tracking-[0.2em] flex items-center gap-2">
                <Info className="w-4 h-4" />
                Configuração de Webhook
              </h4>
              <div className="p-3 bg-black/50 rounded-xl border border-white/5 flex items-center justify-between overflow-hidden">
                <code className="text-[10px] font-mono text-gold-light truncate flex-1">
                  https://{window.location.host}/api/webhook
                </code>
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed uppercase font-bold tracking-tight">
                Aponte o seu Webhook da Meta para a URL acima para receber mensagens.
              </p>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  )}

        {activeSubTab === 'diagnostic' && canManageUsers && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <DiagnosticDashboard />
          </motion.div>
        )}

        {activeSubTab === 'health' && canManageUsers && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <SystemHealth />
          </motion.div>
        )}

        {activeSubTab === 'ai_ocr' && (
          <AIDocumentExtractionPanel />
        )}

        {activeSubTab === 'empresa' && userProfile?.organizationId && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <EmpresaPerfil organizationId={userProfile.organizationId} />
          </motion.div>
        )}

        {activeSubTab === 'admin' && canManageUsers && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="space-y-8">
              <UserManagement />
              <AdminTools />
              <PerformanceDashboard />
            </div>
          </motion.div>
        )}
        </div>
      </div>
    </div>
  );
}
