
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, 
  TrendingUp, 
  CheckCircle2, 
  X, 
  ChevronRight, 
  Lock,
  Sparkles,
  Bot,
  User,
  Smartphone,
  Mail,
  Calendar,
  MapPin,
  ClipboardList,
  Flame,
  ShieldCheck,
  Plus,
  Upload,
  Loader2,
  Check,
  AlertTriangle,
  History,
  Tag,
  CreditCard,
  Briefcase,
  Users,
  Car
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Lead, Permissions, UserProfile } from '../../types';
import { cn, maskCPF, maskPhone, generateId } from '../../lib/utils';
import { StatusBadge } from '../../components/StatusBadge';
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

const TEMPS: any = {
  'quente': { label: 'Quente', color: 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]' },
  'morno': { label: 'Morno', color: 'bg-gold-deep text-brand-dark shadow-[0_0_10px_rgba(212,169,77,0.3)]' },
  'frio': { label: 'Frio', color: 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' }
};

const STATUS_OPTIONS = [
  'Novo Lead', 'Em Atendimento', 'Aguardando Documento', 'Em Cotação', 'Proposta Enviada', 'Fechado', 'Perdido'
];

const ORIGINS = [
  'WhatsApp', 'Instagram', 'Facebook', 'Google', 'Indicação', 'Telefone', 'Site', 'Cadastro manual'
];

export const LeadCRMPanel = React.memo(({
  leadId,
  permissions,
  onClose,
  isOpen
}: LeadCRMPanelProps) => {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }

    const unsubLead = DataService.subscribe('lead', leadId, (data) => {
      setLead(data);
      setLoading(false);
    });

    const uid = auth.currentUser?.uid;
    if (uid) {
      DataService.get('user', uid).then(setCurrentUser);
    }
    
    DataService.list('user').then(setUsers);

    return () => {
      if (unsubLead) unsubLead();
    };
  }, [leadId]);

  const updateLeadField = async (field: string, value: any) => {
    if (!lead) return;
    try {
      await DataService.update('lead', leadId, { 
        [field]: value,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Update field failed:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file || !lead) return;

    setUploadingDoc(type);
    try {
      const { url, path } = await StorageService.uploadFile(file, lead.id, `${type}_${file.name}`);
      
      const documents = { ...(lead.documents || {}), [type]: url };
      await updateLeadField('documents', documents);
      
      logger.info('STORAGE', 'DOC_UPLOADED', { leadId: lead.id, type });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploadingDoc(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-8 bg-brand-dark/50">
        <Loader2 className="w-8 h-8 text-gold-deep animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Carregando CRM...</p>
      </div>
    );
  }

  if (!lead) return null;

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className={cn(
      "flex flex-col h-full bg-[#111b21] border-l border-white/5 overflow-hidden transition-all duration-300",
      isOpen ? "w-full md:w-[360px]" : "w-0 p-0 overflow-hidden"
    )}>
      {/* Header */}
      <div className="h-[50px] flex items-center justify-between px-4 bg-[#202c33] border-b border-white/5 shrink-0">
        <h3 className="text-[10px] font-black text-gold-deep uppercase tracking-[0.15rem] flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5" />
          Detalhes do Lead
        </h3>
        <div className="flex items-center gap-1.5">
           <button 
             onClick={() => setIsEditing(!isEditing)}
             className={cn(
               "px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all",
               isEditing ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-white/5 text-white/40 border-white/10 hover:text-gold-deep"
             )}
           >
             {isEditing ? 'Salvar' : 'Editar'}
           </button>
           <button onClick={onClose} className="p-1.5 text-white/30 hover:text-white transition-colors">
             <X className="w-4.5 h-4.5" />
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {/* Quick Header Info */}
        <section className="flex flex-col items-center text-center">
           <div className="w-16 h-16 rounded-full bg-gold-deep/10 flex items-center justify-center border-2 border-gold-deep/20 mb-3 text-xl font-black text-gold-deep relative">
             {lead.name.charAt(0)}
             <div className={cn(
               "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-[#111b21] flex items-center justify-center",
               TEMPS[lead.temperature || 'morno'].color
             )}>
                <Flame className="w-2.5 h-2.5" />
             </div>
           </div>
           <h2 className="text-lg font-bold text-white tracking-tight leading-tight">{lead.name}</h2>
           <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] mt-0.5">{maskPhone(lead.phone)}</p>
           <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-1.5">Criado em {new Date(lead.createdAt).toLocaleDateString()}</p>
        </section>

        {/* Status and Responsible */}
        <div className="grid grid-cols-2 gap-3">
           <div className="space-y-1">
              <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Status</label>
              <select 
                value={lead.status}
                onChange={(e) => updateLeadField('status', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-black text-emerald-500 uppercase tracking-tighter outline-none transition-all"
              >
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt} className="bg-[#202c33]">{opt}</option>)}
              </select>
           </div>
           <div className="space-y-1">
              <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Equipe</label>
              <div className="relative">
                <select 
                  value={lead.ownerId}
                  disabled={!isAdmin}
                  onChange={(e) => updateLeadField('ownerId', e.target.value)}
                  className={cn(
                    "w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-black text-white/60 uppercase tracking-tighter outline-none transition-all",
                    isAdmin ? "focus:ring-1 focus:ring-gold-deep/50" : "opacity-60 cursor-not-allowed"
                  )}
                >
                  {users.map(u => <option key={u.uid} value={u.uid} className="bg-[#202c33]">{u.name}</option>)}
                </select>
                {!isAdmin && <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-white/20" />}
              </div>
           </div>
        </div>

        {/* Classification Section */}
        <section className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
           <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black text-gold-deep uppercase tracking-widest">Atendimento</h4>
              <ShieldCheck className="w-3.5 h-3.5 text-gold-deep" />
           </div>
           
           <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
                 <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mb-1">Fervor</p>
                 <div className="flex flex-wrap gap-1">
                    {Object.keys(TEMPS).map(t => (
                      <button 
                         key={t}
                         onClick={() => updateLeadField('temperature', t)}
                         className={cn(
                           "px-1.5 py-0.5 rounded text-[8px] font-black uppercase transition-all",
                           lead.temperature === t ? TEMPS[t].color : "bg-white/5 text-white/20 hover:text-white"
                         )}
                      >
                        {TEMPS[t].label}
                      </button>
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

           <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                 <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Origem do Contato</label>
                 <select 
                   value={lead.origin}
                   onChange={(e) => updateLeadField('origin', e.target.value)}
                   className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white uppercase tracking-tight"
                 >
                   {ORIGINS.map(o => <option key={o} value={o} className="bg-[#202c33]">{o}</option>)}
                 </select>
              </div>
              <div className="space-y-1.5">
                 <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Perfil do Lead</label>
                 <div className="flex gap-2">
                    {['Residencial', 'Comercial', 'Flota'].map(p => (
                      <button 
                        key={p}
                        onClick={() => updateLeadField('profileType', p.toLowerCase())}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all",
                          lead.profileType === p.toLowerCase() ? "bg-gold-deep text-brand-dark border-gold-deep" : "bg-white/5 text-white/40 border-white/5"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                 </div>
              </div>
           </div>
        </section>

        {/* Main Data Section */}
        <section className="space-y-4">
           <div className="flex items-center gap-3 border-b border-white/5 pb-2">
              <User className="w-4 h-4 text-gold-deep" />
              <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Informações Cadastrais</h4>
           </div>
           
           <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-1.5 flex flex-col">
                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest">CPF / CNPJ</label>
                    <div className="text-xs font-black text-white bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                      <SensitiveContent value={lead.cpf || ''} maskFn={maskCPF} canView={permissions.canReadAllLeads} />
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest">Data Nascimento</label>
                    <div className="text-xs font-black text-white bg-white/5 px-3 py-2 rounded-xl border border-white/5">{lead.birthDate || '---'}</div>
                 </div>
              </div>

              <div className="space-y-1.5">
                 <label className="text-[9px] font-black text-white/20 uppercase tracking-widest">E-mail</label>
                 <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                    <Mail className="w-3.5 h-3.5 text-white/30" />
                    <span className="text-xs font-black text-white/80">{lead.email || 'Não informado'}</span>
                 </div>
              </div>

              <div className="grid grid-cols-5 gap-3">
                 <div className="col-span-2 space-y-1.5">
                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest">CEP</label>
                    <div className="text-xs font-black text-white bg-white/5 px-3 py-2 rounded-xl border border-white/5">{lead.zipCodeOvernight || '---'}</div>
                 </div>
                 <div className="col-span-3 space-y-1.5">
                    <label className="text-[9px] font-black text-white/20 uppercase tracking-widest">Endereço</label>
                    <div className="text-xs font-black text-white/60 bg-white/5 px-3 py-2 rounded-xl border border-white/5 truncate">{lead.addressOvernight || '---'}</div>
                 </div>
              </div>
           </div>
        </section>

        {/* Dynamic Profile Section */}
        <section className="space-y-4">
           <div className="flex items-center gap-3 border-b border-white/5 pb-2">
              <TrendingUp className="w-4 h-4 text-gold-deep" />
              <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Perfil de Uso</h4>
           </div>

           <div className="grid grid-cols-1 gap-2.5 pt-2">
              {[
                { key: 'serviceUsage', icon: Briefcase, label: 'Uso Comercial / App' },
                { key: 'youngDriverHousehold', icon: Users, label: 'Condutor Jovem na Residência' },
                { key: 'isOwnerDriver', icon: User, label: 'Proprietário é o Condutor?', inverse: false },
                { key: 'fiduciaryAlienation', icon: CreditCard, label: 'Alienação Fiduciária' }
              ].map(item => (
                <button 
                  key={item.key}
                  onClick={() => updateLeadField(item.key, !lead[item.key as keyof Lead])}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl border transition-all",
                    lead[item.key as keyof Lead] ? "bg-gold-deep/10 border-gold-deep/20" : "bg-white/5 border-white/5 opacity-50 hover:opacity-100"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                    lead[item.key as keyof Lead] ? "bg-gold-deep text-brand-dark" : "bg-white/5 text-white/30"
                  )}>
                     <item.icon className="w-4 h-4" />
                  </div>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-tight",
                    lead[item.key as keyof Lead] ? "text-white" : "text-white/30"
                  )}>
                    {item.label}
                  </span>
                  <div className="ml-auto">
                     {lead[item.key as keyof Lead] ? (
                       <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                     ) : (
                       <div className="w-4 h-4 rounded-full border border-white/10" />
                     )}
                  </div>
                </button>
              ))}
           </div>

           {/* Conditional Owner Section */}
           <AnimatePresence>
             {!lead.isOwnerDriver && (
               <motion.div 
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: 'auto' }}
                 exit={{ opacity: 0, height: 0 }}
                 className="p-5 bg-black/40 border border-gold-deep/20 rounded-2xl space-y-4 overflow-hidden"
               >
                  <p className="text-[10px] font-black text-gold-deep uppercase tracking-widest flex items-center gap-2">
                    <User className="w-3.5 h-3.5" /> Dados do Proprietário
                  </p>
                  <div className="space-y-3">
                     <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest">Nome do Proprietário</label>
                        <input 
                          value={lead.ownerName || ''}
                          onChange={(e) => updateLeadField('ownerName', e.target.value.toUpperCase())}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white uppercase outline-none"
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-white/20 uppercase tracking-widest">CPF / CNPJ Proprietário</label>
                        <input 
                          value={lead.ownerCpfCnpj || ''}
                          onChange={(e) => updateLeadField('ownerCpfCnpj', e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white outline-none"
                        />
                     </div>
                  </div>
               </motion.div>
             )}
           </AnimatePresence>
        </section>

        {/* Documentation Section */}
        <section className="space-y-3">
           <div className="flex items-center gap-2 border-b border-white/5 pb-1.5">
              <FileText className="w-3.5 h-3.5 text-gold-deep" />
              <h4 className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Anexos</h4>
           </div>

           <div className="grid grid-cols-2 gap-2.5 pt-1.5">
              {[
                { id: 'cnh', label: 'CNH', icon: User },
                { id: 'crv', label: 'CRLV', icon: Car },
                { id: 'policy', label: 'Apólice', icon: ShieldCheck },
                { id: 'quote', label: 'PDF', icon: FileText }
              ].map(doc => {
                const documents = (lead.documents || {}) as Record<string, string | undefined>;
                const hasFile = documents[doc.id];
                const isUploading = uploadingDoc === doc.id;

                return (
                  <div key={doc.id} className="group relative">
                    <input 
                      type="file" 
                      id={`file-${doc.id}`}
                      className="hidden" 
                      onChange={(e) => handleFileUpload(e, doc.id)}
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                    />
                    <label 
                      htmlFor={`file-${doc.id}`}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer aspect-square text-center",
                        hasFile 
                          ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40" 
                          : "bg-white/5 border-white/5 hover:border-gold-deep/20 hover:bg-gold-deep/5"
                      )}
                    >
                       {isUploading ? (
                         <Loader2 className="w-5 h-5 text-gold-deep animate-spin" />
                       ) : hasFile ? (
                         <Check className="w-5 h-5 text-emerald-500" />
                       ) : (
                         <doc.icon className="w-5 h-5 text-white/20 group-hover:text-gold-deep transition-colors" />
                       )}
                       <p className="text-[8px] font-black uppercase tracking-widest mt-1.5">{doc.label}</p>
                       {hasFile && (
                         <div className="mt-1 flex items-center gap-1 text-[7px] text-emerald-500/60 font-black uppercase">
                            <History className="w-2 h-2" />
                            OK
                         </div>
                       )}
                    </label>
                    {hasFile && (
                      <button 
                        onClick={() => updateLeadField('documents', { ...lead.documents, [doc.id]: null })}
                        className="absolute top-1.5 right-1.5 p-1 bg-red-500/10 text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
           </div>
        </section>

        {/* Quick Actions Footer */}
        <section className="pt-2 space-y-2.5">
           <div className="flex gap-2.5">
              <button className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-gold-deep transition-all flex items-center justify-center gap-2">
                 <History className="w-3 h-3" /> Logs
              </button>
              <button className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-gold-deep transition-all flex items-center justify-center gap-2">
                 <Tag className="w-3 h-3" /> Tags
              </button>
           </div>
           <button className="w-full px-3 py-3.5 bg-gold-deep text-brand-dark rounded-xl text-[9px] font-black uppercase tracking-[0.15em] shadow-lg shadow-gold-deep/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5">
              <Bot className="w-3.5 h-3.5" /> Cotar Michelin IA
           </button>
        </section>

        <div className="h-20" /> {/* Bottom spacer */}
      </div>
    </div>
  );
});

LeadCRMPanel.displayName = 'LeadCRMPanel';
