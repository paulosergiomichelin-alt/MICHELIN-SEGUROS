
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User, Phone, Briefcase, Lock, Save, Loader2, KeyRound, 
  AlertCircle, CheckCircle2, Camera, Eye, EyeOff, Mail, 
  Building2, ShieldCheck, Settings2, Bell, LogOut, Globe,
  Fingerprint, Monitor, Calendar, Trash2, UserPlus, 
  ChevronLeft, Info, Activity, FileText, UserCog, UserMinus, ShieldAlert
} from 'lucide-react';
import { updatePassword, updateProfile, getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { auth, signOut, db } from '../lib/firebase';
import { DataService } from '../services/DataService';
import { UserProfile, AccessProfile, UserRole, SystemUser } from '../types';
import { cn } from '../lib/utils';
import { useTheme } from '../hooks/useAppContexts';
import firebaseConfig from '../../firebase-applet-config.json';
import { auditLogger } from '../services/AuditLogger';

interface UserProfileModalProps {
  mode?: 'create' | 'edit';
  targetUserId?: string;
  user?: any; // For backward compatibility with AppShell (current user)
  profile?: UserProfile | null;
  onClose: () => void;
  onUpdate?: (newProfile: UserProfile) => void;
}

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

const formatCPF = (value: string) => {
  const v = value.replace(/\D/g, '');
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
  if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
  return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9, 11)}`;
};

type ActiveTab = 'dados' | 'perfil' | 'atividade' | 'documentos';

export function UserProfileModal({ 
  mode = 'edit', 
  targetUserId, 
  user: currentUserAuth, 
  profile: currentUserProfile, 
  onClose, 
  onUpdate 
}: UserProfileModalProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dados');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lists for dropdowns
  const [accessProfiles, setAccessProfiles] = useState<AccessProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  // Target User State (Hydrated if edit)
  const [targetProfile, setTargetProfile] = useState<Partial<any>>({});

  const isSelf = mode === 'edit' && (!targetUserId || targetUserId === currentUserAuth?.uid);
  const isAdmin = currentUserProfile?.role === 'admin' || currentUserProfile?.permissions?.canManageUsers;

  // Load Metadata
  useEffect(() => {
    const unsubProfiles = DataService.subscribeCollection('access_profile', [], (data) => {
      setAccessProfiles(data);
    });
    const unsubUsers = DataService.subscribeCollection('users', [], (data) => {
      setAllUsers(data);
    });
    return () => {
      unsubProfiles();
      unsubUsers();
    };
  }, []);

  // Hydrate Profile if Edit Mode
  useEffect(() => {
    let isMounted = true;
    
    const loadProfile = async () => {
      if (mode === 'edit') {
        const uid = targetUserId || currentUserAuth?.uid;
        if (uid) {
          setIsLoading(true);
          try {
            const data = await DataService.get('users', uid);
            if (data && isMounted) {
              setTargetProfile(data);
            }
          } catch (err) {
            console.error("Error loading user profile:", err);
          } finally {
            if (isMounted) setIsLoading(false);
          }
        }
      } else {
        // Create Mode - Reset
        setTargetProfile({
          name: '',
          email: '',
          phone: '',
          status: 'active',
          userType: 'HUMAN',
          role: 'atendente',
          profileId: '',
          organizationId: currentUserProfile?.organizationId || 'default',
          permissions: {},
          cpf: '',
          birthday: '',
          gender: '',
          civilStatus: '',
          about: '',
          cargo: '',
          department: '',
          hiringDate: '',
          managerId: '',
        });
      }
    };

    loadProfile();
    return () => { isMounted = false; };
  }, [mode, targetUserId, currentUserAuth, currentUserProfile]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'A imagem deve ter menos de 2MB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setTargetProfile(prev => ({ ...prev, photoURL: base64 }));
        
        if (mode === 'edit' && targetProfile.uid) {
          try {
            await DataService.update('users', targetProfile.uid, {
              photoURL: base64,
              updatedAt: new Date().toISOString()
            });
            setMessage({ type: 'success', text: 'Foto atualizada!' });
          } catch (error) {
            setMessage({ type: 'error', text: 'Erro ao salvar foto.' });
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      if (mode === 'create') {
        if (!targetProfile.email || !targetProfile.name || !targetProfile.password) {
          throw new Error('E-mail, Nome e Senha são obrigatórios para novo cadastro.');
        }

        // Create in Firebase Auth (Secondary app trick)
        const secondaryAppName = `create-user-${Date.now()}`;
        const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);

        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, targetProfile.email!, targetProfile.password!);
        const fbUser = userCredential.user;

        await updateProfile(fbUser, { displayName: targetProfile.name });

        const selectedProf = accessProfiles.find(p => p.id === targetProfile.profileId);
        
        const finalProfile = {
          ...targetProfile,
          uid: fbUser.uid,
          permissions: selectedProf?.permissions || {},
          lastAccess: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        delete (finalProfile as any).password; 

        await DataService.create('users', finalProfile);
        
        await auditLogger.log(currentUserProfile!.uid!, currentUserProfile!.name!, `Criou usuário: ${targetProfile.name}`, 'team');
        
        await secondaryAuth.signOut();
        setMessage({ type: 'success', text: 'Usuário cadastrado com sucesso!' });
        setTimeout(onClose, 1500);

      } else {
        // Edit Mode
        if (!targetProfile.uid) throw new Error('UID ausente para edição');

        const { password, ...updateData } = targetProfile as any;
        
        const selectedProf = accessProfiles.find(p => p.id === targetProfile.profileId);
        if (selectedProf) {
          updateData.permissions = selectedProf.permissions;
        }

        await DataService.update('users', targetProfile.uid, {
          ...updateData,
          updatedAt: new Date().toISOString()
        });

        if (isSelf && currentUserAuth) {
          await updateProfile(currentUserAuth, { displayName: targetProfile.name });
          if (onUpdate) onUpdate(targetProfile as UserProfile);
        }

        await auditLogger.log(currentUserProfile!.uid!, currentUserProfile!.name!, `Editou usuário: ${targetProfile.name}`, 'team');
        setMessage({ type: 'success', text: 'Alterações salvas com sucesso!' });
      }
    } catch (error: any) {
      console.error("Save Error:", error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!targetProfile.uid) return;
    const newStatus = targetProfile.status === 'active' ? 'inactive' : 'active';
    try {
      await DataService.update('users', targetProfile.uid, { status: newStatus });
      setTargetProfile(prev => ({ ...prev, status: newStatus }));
      setMessage({ type: 'success', text: `Usuário ${newStatus === 'active' ? 'ativado' : 'desativado'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao alterar status.' });
    }
  };

  const handleDeleteUser = async () => {
    if (!targetProfile.uid || !window.confirm('TEM CERTEZA? Esta ação removerá o acesso e os dados do usuário permanentemente.')) return;
    try {
      await DataService.delete('users', targetProfile.uid);
      setMessage({ type: 'success', text: 'Usuário excluído com sucesso.' });
      setTimeout(onClose, 1000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao excluir usuário.' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white overflow-hidden">
      {/* Header Area */}
      <div className="flex items-center justify-between p-6 bg-[#0B0B0D] border-b border-white/5 relative shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-1 text-left">
             <div className="flex items-center gap-2 text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest">
               <span>EQUIPE</span>
               <ChevronLeft className="w-2.5 h-2.5 rotate-180" />
               <span className="text-white">USUÁRIOS</span>
               <ChevronLeft className="w-2.5 h-2.5 rotate-180" />
               <span className="text-[#D4A94D] truncate max-w-[200px]">{mode === 'create' ? 'NOVO USUÁRIO' : targetProfile.name?.toUpperCase()}</span>
             </div>
             
             <div className="flex items-center gap-4 mt-2">
                <div className="relative group">
                  <div className="w-16 h-16 rounded-full border-2 border-[#D4A94D]/30 p-0.5 overflow-hidden bg-[#1A1A1F] relative">
                    {targetProfile.photoURL ? (
                      <img src={targetProfile.photoURL} alt="User" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#D4A94D]/20">
                        <User className="w-8 h-8" />
                      </div>
                    )}
                    {mode === 'edit' && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <Camera className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-left">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black tracking-tight">{targetProfile.name || (mode === 'create' ? 'Novo Usuário' : 'Carregando...')}</h2>
                    <div className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse mt-1" />
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Online agora</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="px-2 py-0.5 bg-[#D4A94D]/10 text-[#D4A94D] border border-[#D4A94D]/20 rounded-md text-[8px] font-black uppercase tracking-[0.2em]">
                       {accessProfiles.find(p => p.id === targetProfile.profileId)?.name || targetProfile.role || 'VENDEDOR'}
                     </span>
                     <span className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[8px] font-black uppercase tracking-[0.2em] text-[#9CA3AF]">
                       <Globe className="w-2.5 h-2.5" /> Acesso total
                     </span>
                  </div>
                </div>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {mode === 'edit' && (
            <>
              <button 
                type="button"
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                <Lock className="w-3.5 h-3.5 text-[#9CA3AF]" />
                Alterar Senha
              </button>
              <button 
                type="button"
                onClick={handleToggleStatus}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  targetProfile.status === 'active' ? "bg-white/5 border-white/5 text-white hover:bg-red-500/10 hover:border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                )}
              >
                {targetProfile.status === 'active' ? <UserMinus className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                {targetProfile.status === 'active' ? 'Desativar Usuário' : 'Ativar Usuário'}
              </button>
              {isAdmin && (
                <button 
                  type="button"
                  onClick={handleDeleteUser}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Usuário
                </button>
              )}
            </>
          )}
          <button type="button" onClick={onClose} className="p-2 ml-4 bg-white/5 hover:bg-white/10 rounded-xl text-[#9CA3AF] border border-white/5 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Navigation Tabs - VERTICAL on Desktop, HORIZONTAL on Mobile */}
        <div className="w-full md:w-[280px] bg-[#0B0B0D] border-b md:border-b-0 md:border-r border-white/5 p-4 md:p-6 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible shrink-0 no-scrollbar">
          {[
            { id: 'dados', label: 'DADOS', labelFull: 'DADOS DO USUÁRIO', icon: User },
            { id: 'perfil', label: 'PERFIL', labelFull: 'PERFIL E PERMISSÕES', icon: ShieldCheck },
            { id: 'atividade', label: 'ATIVIDADE', labelFull: 'ATIVIDADE E ACESSOS', icon: Activity },
            { id: 'documentos', label: 'DOCS', labelFull: 'DOCUMENTOS', icon: FileText }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] transition-all border whitespace-nowrap md:whitespace-normal shrink-0",
                activeTab === tab.id 
                  ? "bg-[#D4A94D] text-[#050505] border-[#D4A94D] shadow-[0_0_20px_rgba(212,169,77,0.2)]" 
                  : "bg-transparent text-[#9CA3AF] border-transparent hover:bg-white/5 hover:text-white"
              )}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">{tab.labelFull}</span>
              <span className="md:hidden">{tab.label}</span>
            </button>
          ))}
          
          <div className="hidden md:block mt-auto p-4 rounded-xl bg-[#D4A94D]/5 border border-[#D4A94D]/10">
             <div className="flex items-center gap-2 mb-2">
               <ShieldAlert className="w-3.5 h-3.5 text-[#D4A94D]" />
               <span className="text-[9px] font-black text-[#D4A94D] uppercase tracking-widest">Segurança</span>
             </div>
             <p className="text-[8px] text-[#9CA3AF] leading-relaxed uppercase font-bold tracking-tight">
               Este perfil possui acesso total às leads da organização e ferramentas de gestão.
             </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-10 bg-[#050505]">
          <form onSubmit={handleSave} className="max-w-5xl mx-auto space-y-6 md:space-y-10">
            
            <AnimatePresence mode="wait">
              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={cn(
                    "p-4 rounded-2xl border flex items-center justify-between shadow-2xl mb-6",
                    message.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    <span className="text-xs font-black uppercase tracking-widest">{message.text}</span>
                  </div>
                  <button onClick={() => setMessage(null)} type="button">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {activeTab === 'dados' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-[#D4A94D]" />
                      <h3 className="text-sm font-black uppercase tracking-widest">Informações pessoais</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Nome completo</label>
                        <input 
                          type="text"
                          required
                          placeholder="Nome Completo"
                          value={targetProfile.name || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, name: e.target.value })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">E-mail</label>
                        <input 
                          type="email"
                          required
                          placeholder="email@michelin.com"
                          value={targetProfile.email || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, email: e.target.value })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Telefone</label>
                        <input 
                          type="text"
                          required
                          placeholder="(47) 99999-9999"
                          value={targetProfile.phone || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, phone: formatPhone(e.target.value) })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">CPF</label>
                        <input 
                          type="text"
                          placeholder="000.000.000-00"
                          value={targetProfile.cpf || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, cpf: formatCPF(e.target.value) })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Data de nascimento</label>
                        <input 
                          type="date"
                          value={targetProfile.birthday || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, birthday: e.target.value })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Gênero</label>
                        <select 
                          value={targetProfile.gender || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, gender: e.target.value })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all appearance-none text-white"
                        >
                          <option value="" className="bg-[#0B0B0D]">Selecione</option>
                          <option value="MASCULINO" className="bg-[#0B0B0D]">Masculino</option>
                          <option value="FEMININO" className="bg-[#0B0B0D]">Feminino</option>
                          <option value="OUTRO" className="bg-[#0B0B0D]">Outro</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Estado civil</label>
                        <select 
                          value={targetProfile.civilStatus || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, civilStatus: e.target.value })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all appearance-none text-white"
                        >
                          <option value="" className="bg-[#0B0B0D]">Selecione</option>
                          <option value="SOLTEIRO" className="bg-[#0B0B0D]">Solteiro(a)</option>
                          <option value="CASADO" className="bg-[#0B0B0D]">Casado(a)</option>
                          <option value="DIVORCIADO" className="bg-[#0B0B0D]">Divorciado(a)</option>
                          <option value="VIUVO" className="bg-[#0B0B0D]">Viúvo(a)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                       <Camera className="w-4 h-4 text-[#D4A94D]" />
                       <h3 className="text-sm font-black uppercase tracking-widest">Foto do perfil</h3>
                    </div>
                    <div className="flex items-center gap-6">
                       <div className="w-24 h-24 rounded-3xl border-2 border-[#D4A94D]/20 p-0.5 overflow-hidden bg-[#1A1A1F]">
                         {targetProfile.photoURL ? (
                           <img src={targetProfile.photoURL} alt="Preview" className="w-full h-full object-cover rounded-[1.4rem]" />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center text-[#D4A94D]/10 text-xs font-black uppercase text-center p-2 tracking-tight">Sem Foto</div>
                         )}
                       </div>
                       <div className="space-y-2">
                         <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest">PNG, JPG ou WEBP. Máx 2MB.</p>
                         <div className="flex gap-2">
                           <button 
                             type="button" 
                             onClick={() => fileInputRef.current?.click()}
                             className="px-4 py-2 bg-[#D4A94D] text-[#050505] rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#CFA764] transition-all shadow-lg shadow-[#D4A94D]/10 font-black"
                           >
                             <Camera className="w-3.5 h-3.5" /> ALTERAR FOTO
                           </button>
                           {targetProfile.photoURL && (
                             <button 
                               type="button" 
                               onClick={() => setTargetProfile({ ...targetProfile, photoURL: '' })}
                               className="p-2 bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 rounded-xl text-red-500 transition-all font-bold"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           )}
                           <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                         </div>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Sobre o usuário</label>
                    <textarea 
                      placeholder="Breve descrição sobre o usuário..."
                      value={targetProfile.about || ''}
                      onChange={e => setTargetProfile({ ...targetProfile, about: e.target.value })}
                      className="w-full h-32 px-5 py-4 bg-[#0B0B0D] border border-white/5 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/40 outline-none transition-all resize-none text-white"
                    />
                    <div className="text-[8px] font-black text-[#9CA3AF] text-right uppercase tracking-[0.2em]">{targetProfile.about?.length || 0}/200</div>
                  </div>

                  {mode === 'create' && (
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-[#D4A94D] uppercase tracking-widest ml-1">Senha de acesso inicial</label>
                      <div className="relative">
                        <input 
                          type={showPass ? "text" : "password"}
                          required
                          placeholder="Mínimo 6 caracteres"
                          value={targetProfile.password || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, password: e.target.value })}
                          className="w-full px-5 py-4 bg-[#0B0B0D] border border-[#D4A94D]/20 rounded-2xl text-xs font-bold focus:border-[#D4A94D]/50 outline-none transition-all text-white"
                        />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-5 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-6">
                    <div className="flex items-center gap-2">
                       <ShieldCheck className="w-4 h-4 text-[#D4A94D]" />
                       <h3 className="text-sm font-black uppercase tracking-widest">Permissões ativas</h3>
                    </div>
                    
                    <div className="space-y-3">
                      {[
                        { label: 'Gestão de Equipe', active: targetProfile.permissions?.canManageUsers },
                        { label: 'Acesso Global a Leads', active: targetProfile.permissions?.canReadAllLeads },
                        { label: 'Configurações Avançadas', active: targetProfile.permissions?.canAccessSettings }
                      ].map((item, i) => (
                        <div key={i} className={cn(
                          "p-4 rounded-2xl border transition-all flex items-center justify-between",
                          item.active ? "bg-[#D4A94D]/5 border-[#D4A94D]/20" : "bg-white/0 border-white/5 opacity-40 shrink-0"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className={cn("w-1.5 h-1.5 rounded-full", item.active ? "bg-[#D4A94D]" : "bg-white/20")} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">{item.label}</span>
                          </div>
                          {item.active && <CheckCircle2 className="w-3.5 h-3.5 text-[#D4A94D]" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-6">
                    <div className="flex items-center gap-2">
                       <Briefcase className="w-4 h-4 text-[#D4A94D]" />
                       <h3 className="text-sm font-black uppercase tracking-widest">Informações profissionais</h3>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Cargo</label>
                        <input 
                          type="text"
                          placeholder="Cargo"
                          value={targetProfile.cargo || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, cargo: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Departamento</label>
                        <input 
                          type="text"
                          placeholder="Departamento"
                          value={targetProfile.department || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, department: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Data de contratação</label>
                        <input 
                          type="date"
                          value={targetProfile.hiringDate || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, hiringDate: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold focus:border-[#D4A94D]/40 outline-none transition-all text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Responsável</label>
                        <select 
                          value={targetProfile.managerId || ''}
                          onChange={e => setTargetProfile({ ...targetProfile, managerId: e.target.value })}
                          className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold focus:border-[#D4A94D]/40 outline-none transition-all appearance-none text-white"
                        >
                          <option value="" className="bg-[#0B0B0D]">Nenhum</option>
                          {allUsers.filter(u => u.uid !== targetProfile.uid).map(u => (
                            <option key={u.uid} value={u.uid} className="bg-[#0B0B0D]">{u.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-6">
                    <div className="flex items-center gap-2">
                       <Fingerprint className="w-4 h-4 text-[#D4A94D]" />
                       <h3 className="text-sm font-black uppercase tracking-widest">Status da conta</h3>
                    </div>

                    <div className="space-y-4">
                       <div className="space-y-1">
                          <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Status</span>
                          <div className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border w-fit",
                            targetProfile.status === 'active' ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500" : "bg-red-500/5 border-red-500/20 text-red-500"
                          )}>
                             <div className={cn("w-1.5 h-1.5 rounded-full", targetProfile.status === 'active' ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                             <span className="text-[9px] font-black uppercase tracking-widest">{targetProfile.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                          </div>
                       </div>
                       <div className="space-y-1">
                          <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Nível de acesso</span>
                          <p className="text-[10px] font-bold text-white uppercase tracking-tight">Acesso total ao sistema</p>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'perfil' && (
               <div className="space-y-10">
                 <div className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-8 space-y-8">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-2xl bg-[#D4A94D]/10 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6 text-[#D4A94D]" />
                     </div>
                     <div className="text-left">
                       <h3 className="text-lg font-black uppercase tracking-tight">Perfil de Acesso Corporativo</h3>
                       <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mt-1">Determine o cargo e as permissões sistêmicas</p>
                     </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-[#D4A94D] uppercase tracking-widest ml-1 text-left block">Cargo / Perfil</label>
                         <div className="grid grid-cols-1 gap-2">
                           {accessProfiles.map(p => (
                             <button
                               key={p.id}
                               type="button"
                               onClick={() => setTargetProfile({ ...targetProfile, profileId: p.id, role: (p.name.toLowerCase().includes('admin') ? 'admin' : 'atendente') as UserRole })}
                               className={cn(
                                 "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                                 targetProfile.profileId === p.id 
                                   ? "bg-[#D4A94D]/10 border-[#D4A94D]/40 ring-2 ring-[#D4A94D]/20" 
                                   : "bg-white/5 border-white/5 hover:border-white/20"
                               )}
                             >
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[11px] font-black uppercase text-white tracking-widest">{p.name}</span>
                                  <span className="text-[9px] text-[#9CA3AF] font-bold uppercase">{p.description || 'Permissões padrão'}</span>
                                </div>
                                {targetProfile.profileId === p.id && <CheckCircle2 className="w-5 h-5 text-[#D4A94D]" />}
                             </button>
                           ))}
                         </div>
                      </div>

                      <div className="bg-black/40 rounded-3xl p-8 border border-white/5 space-y-6">
                         <div className="flex items-center gap-2">
                           <Settings2 className="w-4 h-4 text-[#D4A94D]" />
                           <h4 className="text-[11px] font-black text-white uppercase tracking-widest">Resumo de Atribuições</h4>
                         </div>
                         
                         <div className="space-y-4 text-left">
                            {targetProfile.profileId ? (
                              <div className="space-y-3">
                                {Object.entries(accessProfiles.find(p => p.id === targetProfile.profileId)?.permissions || {}).map(([key, val]) => (
                                  <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                                    <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-tight">{key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}</span>
                                    {val ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-red-500 opacity-30" />}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-20 text-center text-[#9CA3AF]">
                                <Info className="w-8 h-8 mb-4 opacity-20" />
                                <p className="text-[10px] font-black uppercase tracking-widest max-w-[200px]">Selecione um perfil para visualizar as atribuições</p>
                              </div>
                            )}
                         </div>
                      </div>
                   </div>
                 </div>
               </div>
            )}
            
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-6 md:pt-10 border-t border-white/5">
               <button
                 type="button"
                 onClick={onClose}
                 className="w-full sm:flex-1 py-4 bg-white/5 hover:bg-white/10 text-[#9CA3AF] border border-white/5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
               >
                 <X className="w-4 h-4" /> CANCELAR
               </button>
               <button 
                 type="submit"
                 disabled={isLoading}
                 className="w-full sm:flex-[2] py-5 bg-[#D4A94D] text-[#050505] rounded-2xl font-black text-[12px] uppercase tracking-[0.25em] hover:bg-[#CFA764] transition-all flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(212,169,77,0.3)] disabled:opacity-50"
               >
                 {isLoading ? (
                   <Loader2 className="w-5 h-5 animate-spin" />
                 ) : (
                   <>
                    <UserPlus className="w-5 h-5 font-black" /> {mode === 'create' ? 'CADASTRAR NOVO USUÁRIO' : 'SALVAR ALTERAÇÕES'}
                   </>
                 )}
               </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
