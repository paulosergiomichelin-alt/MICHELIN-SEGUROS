import React, { useState, useEffect } from 'react';
import { auth } from '../../lib/firebase';
import { 
  collection, 
  query, 
  orderBy,
  Timestamp,
  QueryDocumentSnapshot,
  limit
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { 
  createUserWithEmailAndPassword,
  updateProfile,
  getAuth,
  deleteUser
} from 'firebase/auth';
import { initializeApp, getApp, getApps } from 'firebase/app';
import firebaseConfig from '../../../firebase-applet-config.json';
import { 
  User as UserIcon, 
  Mail, 
  Phone, 
  Shield, 
  ShieldAlert, 
  Trash2, 
  Edit2, 
  Search,
  Check,
  X,
  Loader2,
  UserPlus,
  Lock,
  Eye,
  EyeOff,
  Bot,
  ShieldCheck,
  Wand2,
  RefreshCcw,
  Zap,
  TrendingUp,
  Users,
  Activity,
  History,
  Target,
  ArrowRight,
  MoreVertical,
  LogOut,
  Settings,
  UserCog,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Clock,
  Briefcase
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataService } from '../../services/DataService';
import { auditLogger } from '../../services/AuditLogger';
import { usePermissions } from '../../contexts/PermissionsContext';

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

interface SystemUser {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  profileId?: string;
  userType: 'HUMAN' | 'AI' | 'IA_SYSTEM' | 'BOT_OPERACIONAL';
  status: 'active' | 'inactive' | 'suspended' | 'pending_setup';
  theme: Theme;
  lastAccess: any;
  activity?: {
    lastAccess: any;
    status: 'ONLINE' | 'AWAY' | 'OFFLINE';
  };
  metrics?: {
    totalLeads: number;
    totalVendas: number;
    conversionRate: number;
    performanceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    lastUpdated: string;
  };
  createdAt: any;
  onboardingCompleted?: boolean;
}

import { AccessProfile, Permissions, Theme, UserRole } from '../../types';
import { AccessProfileManagement } from './AccessProfileManagement';
import { maskPhone, maskEmail } from '../../lib/utils';

export const UserManagement: React.FC<{ permissions?: Permissions }> = ({ permissions: parentPermissions }) => {
  const { userProfile: currentUser } = usePermissions();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [filterProfile, setFilterProfile] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('atendente');
  const [editProfileId, setEditProfileId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive' | 'suspended' | 'pending_setup'>('active');

  // Registration state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('atendente');
  const [newUserProfileId, setNewUserProfileId] = useState<string>('');
  const [newUserType, setNewUserType] = useState<'HUMAN' | 'AI' | 'IA_SYSTEM' | 'BOT_OPERACIONAL'>('HUMAN');
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Performance helpers
  const getPerformanceBadge = (u: SystemUser) => {
    const level = u.metrics?.performanceLevel || 'LOW';
    const rate = u.metrics?.conversionRate ?? 0;
    
    if (level === 'HIGH' || rate >= 25) return { label: '🔥 Alta Performance', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: Zap };
    if (level === 'MEDIUM' || rate >= 10) return { label: '⚠ Média', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: TrendingUp };
    return { label: '❌ Baixa', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: AlertCircle };
  };

  const getUserOnlineStatus = (u: SystemUser) => {
    const lastAccess = u.activity?.lastAccess || u.lastAccess;
    if (!lastAccess) return 'OFFLINE';
    try {
      const last = lastAccess.toDate ? lastAccess.toDate() : new Date(lastAccess);
      const diffMinutes = (new Date().getTime() - last.getTime()) / (1000 * 60);
      if (diffMinutes < 5) return 'ONLINE';
      if (diffMinutes < 30) return 'AWAY';
      return 'OFFLINE';
    } catch (e) {
      return 'OFFLINE';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE': return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
      case 'AWAY': return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]';
      case 'OFFLINE': return 'bg-slate-700';
      default: return 'bg-slate-700';
    }
  };

  const fetchUsers = React.useCallback(async (isInitial = true) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const result = await DataService.listPaginated(
        'users', 
        [orderBy('createdAt', 'desc')], 
        10, 
        isInitial ? undefined : (lastDoc || undefined)
      );

      if (isInitial) {
        setUsers(result.data);
      } else {
        setUsers(prev => [...prev, ...result.data]);
      }
      
      setLastDoc(result.lastVisible);
      setHasMore(result.hasMore);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [lastDoc]);

  const fetchProfiles = React.useCallback(async () => {
    try {
      const docs = await DataService.list('access_profiles');
      setProfiles(docs);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'access_profiles');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchUsers(true);
      await fetchProfiles();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchUsers(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setRegError(null);

    try {
      // We use a secondary app instance to create user without logging out the current admin
      const secondaryAppName = `secondary-${Date.now()}`;
      const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      const newUser = userCredential.user;

      await updateProfile(newUser, { displayName: newUserName });

      const selectedProfile = profiles.find(p => p.id === newUserProfileId);
      if (!selectedProfile) {
        throw new Error("PERFIL DE ACESSO OBRIGATÓRIO. Selecione um perfil.");
      }

      await DataService.create('users', {
        uid: newUser.uid,
        name: newUserName,
        email: newUserEmail,
        phone: newUserPhone,
        role: newUserRole,
        permissions: selectedProfile.permissions, // USAR PERMISSÕES DO PERFIL
        profileId: newUserProfileId,
        userType: newUserType,
        status: 'pending_setup',
        onboardingCompleted: false,
        theme: 'dark',
        metrics: {
          totalLeads: 0,
          totalVendas: 0,
          conversionRate: 0,
          performanceLevel: 'LOW',
          lastUpdated: new Date().toISOString()
        }
      });

      if (currentUser) {
        await auditLogger.log(
          currentUser.uid,
          currentUser.name,
          `Criou novo usuário: ${newUserName} (${newUserRole})`,
          'team',
          { entityId: newUser.uid, entity: 'user' }
        );
      }

      // Sign out and delete the secondary app instance
      await secondaryAuth.signOut();
      
      setShowAddModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserPassword('');
      setNewUserRole('atendente');
      setNewUserType('HUMAN');
      
      // Refresh local list
      await fetchUsers(true);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.code === 'auth/operation-not-allowed') {
        setRegError("CONFIGURAÇÃO NECESSÁRIA: O provedor de 'E-mail/Senha' está desativado no Firebase. Acesse o Console do Firebase > Authentication > Sign-in method e ative 'E-mail/Password' para permitir novos registros.");
      } else {
        setRegError(error.message || "Erro ao criar usuário.");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async (uid: string) => {
    try {
      const selectedProfile = profiles.find(p => p.id === editProfileId);
      if (!selectedProfile) {
        throw new Error("PERFIL DE ACESSO OBRIGATÓRIO para atualização.");
      }

      await DataService.update('users', uid, {
        role: editRole,
        permissions: selectedProfile.permissions,
        profileId: editProfileId,
        status: editStatus,
        updatedAt: new Date().toISOString()
      }, 'USUARIO');

      if (currentUser) {
        await auditLogger.log(
          currentUser.uid,
          currentUser.name,
          `Atualizou usuário ${uid}: role=${editRole}, status=${editStatus}`,
          'team',
          { entityId: uid, entity: 'user' }
        );
      }

      setEditingUser(null);
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role: editRole, status: editStatus } : u));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    // SECURITY: Block deletion of main user
    if (uid === auth.currentUser?.uid) {
      alert("Você não pode excluir a sua própria conta.");
      return;
    }

    if (users.find(u => u.uid === uid)?.role === 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        alert("Não é possível excluir o único administrador do sistema.");
        return;
      }
    }

    if (!window.confirm("Tem certeza que deseja desativar este acesso permanentemente?")) return;
    
    try {
      if (currentUser) {
        await auditLogger.log(
          currentUser.uid,
          currentUser.name,
          `Excluiu usuário: ${uid}`,
          'team',
          { entityId: uid, entity: 'user' }
        );
      }
      await DataService.delete('users', uid);
      setUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || 
                         u.email.toLowerCase().includes(search.toLowerCase());
    const matchesProfile = filterProfile === 'all' || u.profileId === filterProfile;
    const matchesStatus = filterStatus === 'all' || u.status === filterStatus;
    return matchesSearch && matchesProfile && matchesStatus;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    online: users.filter(u => getUserOnlineStatus(u) === 'ONLINE').length,
    avgConversion: users.length > 0 ? users.reduce((acc, u) => acc + (u.metrics?.conversionRate || 0), 0) / users.length : 0,
    topSellers: [...users].sort((a, b) => (b.metrics?.conversionRate || 0) - (a.metrics?.conversionRate || 0)).slice(0, 3)
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* SaaS Dashboard Top Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="bg-brand-dark p-6 rounded-[2rem] border border-white/5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Users className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total de Colaboradores</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-white">{stats.total}</h4>
            <span className="text-[10px] text-emerald-500 font-bold">Ativos</span>
          </div>
        </div>

        <div className="bg-brand-dark p-6 rounded-[2rem] border border-white/5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Activity className="w-12 h-12 text-emerald-500" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Operando Agora</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-emerald-500">{stats.online}</h4>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Online</span>
          </div>
        </div>

        <div className="bg-brand-dark p-6 rounded-[2rem] border border-white/5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Target className="w-12 h-12 text-gold-deep" />
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Conversão Média</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-gold-deep">{stats.avgConversion.toFixed(1)}%</h4>
            <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
               <TrendingUp className="w-3 h-3" />
               <span>Benchmark</span>
            </div>
          </div>
        </div>

        <div className="bg-brand-dark p-6 rounded-[2rem] border border-gold-deep/20 shadow-xl relative overflow-hidden">
          <p className="text-[10px] font-black text-gold-deep uppercase tracking-widest mb-3">Top Performers</p>
          <div className="space-y-2">
            {stats.topSellers.map((u, i) => (
              <div key={u.uid} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-2">
                  <span className="font-black text-gold-deep/40">#0{i+1}</span>
                  <span className="font-bold text-slate-300 truncate w-24 uppercase">{u.name.split(' ')[0]}</span>
                </div>
                <span className="font-black text-white">{u.metrics?.conversionRate || 0}%</span>
              </div>
            ))}
            {stats.topSellers.length === 0 && <p className="text-[9px] text-slate-600 font-bold uppercase">Sem registros</p>}
          </div>
        </div>
      </div>

      {/* Access Profile Configuration - Only if has permission */}
      {parentPermissions?.canManageUsers && (
        <section className="animate-in fade-in slide-in-from-top-4 duration-500">
          <AccessProfileManagement />
        </section>
      )}

      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-brand-dark p-6 rounded-3xl border border-gold-deep/10 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text"
                placeholder="Buscar colaboradores..."
                value={search || ''}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-brand-black border border-white/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-deep/20 text-slate-100 font-medium"
              />
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select 
                value={filterProfile || 'all'}
                onChange={(e) => setFilterProfile(e.target.value)}
                className="flex-1 sm:flex-none bg-brand-black border border-white/5 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-gold-deep outline-none"
              >
                <option value="all">PERFIL: TODOS</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                ))}
              </select>

              <select 
                value={filterStatus || 'all'}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 sm:flex-none bg-brand-black border border-white/5 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-gold-deep outline-none"
              >
                <option value="all">STATUS: TODOS</option>
                <option value="active">ATIVOS</option>
                <option value="pending_setup">PENDENTES</option>
                <option value="suspended text-red-500">SUSPENSOS</option>
              </select>
            </div>
          </div>

          <button 
            onClick={() => setShowAddModal(true)}
            className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-gold-deep text-brand-black rounded-xl font-black text-xs uppercase tracking-widest border border-gold-deep/20 hover:bg-gold-light transition-all shadow-xl shadow-gold-deep/10"
          >
            <UserPlus className="w-4 h-4" />
            Novo Registro SaaS
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-brand-dark rounded-3xl border border-white/5">
             <Loader2 className="w-8 h-8 animate-spin text-gold-deep mb-4" />
             <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-deep/60">Carregando Inteligência de Equipe...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode='popLayout'>
              {filteredUsers.map((u) => {
                const onlineStatus = getUserOnlineStatus(u);
                const perfBadge = getPerformanceBadge(u);
                const PerfIcon = perfBadge?.icon || AlertCircle;

                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={u.uid}
                    className={cn(
                      "bg-brand-dark rounded-[2.5rem] border transition-all relative overflow-hidden group shadow-xl",
                      u.status === 'suspended' ? "border-red-500/20 grayscale" : "border-white/5 hover:border-gold-deep/30"
                    )}
                  >
                    {/* Header: Identity & Status */}
                    <div className="p-6 pb-4">
                      <div className="flex items-start justify-between">
                        <div className="relative">
                          <div className="w-16 h-16 bg-brand-black rounded-2xl flex items-center justify-center border border-white/5 group-hover:bg-brand-dark transition-colors overflow-hidden">
                            {u.userType === 'IA_SYSTEM' || u.userType === 'BOT_OPERACIONAL' ? (
                              <Cpu className="w-8 h-8 text-gold-deep" />
                            ) : u.userType === 'AI' ? (
                              <Bot className="w-8 h-8 text-gold-deep" />
                            ) : (
                              <UserIcon className="w-8 h-8 text-slate-500 group-hover:text-gold-deep transition-colors" />
                            )}
                          </div>
                          <div className={cn(
                            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-brand-dark flex items-center justify-center",
                            getStatusColor(onlineStatus)
                          )} />
                        </div>

                        <div className="flex flex-col items-end gap-2">
                           <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10 group-hover:border-gold-deep/20 transition-all">
                              <Shield className={cn("w-3 h-3", u.role === 'admin' ? "text-gold-deep" : "text-slate-500")} />
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">{u.role}</span>
                           </div>
                           {perfBadge && (
                             <div className={cn("flex items-center gap-1 px-3 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest", perfBadge.color)}>
                               <PerfIcon className="w-3 h-3" />
                               {perfBadge.label}
                             </div>
                           )}
                           {u.status === 'pending_setup' && (
                             <div className="px-3 py-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Onboarding
                             </div>
                           )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <h3 className="font-bold text-slate-100 truncate text-lg uppercase tracking-tight leading-tight">{u.name}</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                           <Briefcase className="w-3 h-3 text-gold-deep/40" />
                           {profiles.find(p => p.id === u.profileId)?.name || 'Perfil Padrão'}
                        </p>
                      </div>
                    </div>

                    {/* Body: Commercial Performance */}
                    <div className="px-6 py-4 bg-brand-black/40 border-y border-white/5 grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Leads</p>
                        <p className="text-sm font-black text-white">{u.metrics?.totalLeads || 0}</p>
                      </div>
                      <div className="text-center border-x border-white/5">
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Vendas</p>
                        <p className="text-sm font-black text-white">{u.metrics?.totalVendas || 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Conv.</p>
                        <p className="text-sm font-black text-gold-deep">{u.metrics?.conversionRate || 0}%</p>
                      </div>
                    </div>

                    {/* Footer: Meta & Quick Actions */}
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex flex-col gap-1">
                          <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                            <History className="w-3 h-3" />
                            Atividade
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 capitalize">
                            {u.activity?.lastAccess || u.lastAccess ? (
                              formatDistanceToNow((u.activity?.lastAccess || u.lastAccess).toDate ? (u.activity?.lastAccess || u.lastAccess).toDate() : new Date(u.activity?.lastAccess || u.lastAccess), { addSuffix: true, locale: ptBR })
                            ) : (
                              'Sem acesso'
                            )}
                          </p>
                        </div>
                        
                        <div className="flex items-center -space-x-2">
                          <div className="w-6 h-6 rounded-full border-2 border-brand-dark bg-brand-black flex items-center justify-center">
                            <Mail className="w-3 h-3 text-slate-500" />
                          </div>
                          <div className="w-6 h-6 rounded-full border-2 border-brand-dark bg-brand-black flex items-center justify-center">
                            <Phone className="w-3 h-3 text-slate-500" />
                          </div>
                        </div>
                      </div>

                      {editingUser === u.uid ? (
                        <div className="space-y-4 animate-in fade-in zoom-in-95">
                           <div className="grid grid-cols-2 gap-2">
                             <select 
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value as UserRole)}
                                className="w-full bg-brand-black border border-white/5 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-gold-deep outline-none"
                             >
                                <option value="atendente">ATENDENTE</option>
                                <option value="gestor">GESTOR</option>
                                <option value="admin">ADMIN</option>
                             </select>
                             <select 
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as any)}
                                className="w-full bg-brand-black border border-white/5 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-gold-deep outline-none"
                             >
                                <option value="active">ATIVO</option>
                                <option value="pending_setup">PENDENTE</option>
                                <option value="suspended">SUSPENSO</option>
                                <option value="inactive">INATIVO</option>
                             </select>
                           </div>
                           <button 
                             onClick={() => handleUpdateRole(u.uid)}
                             className="w-full py-3 bg-gold-deep text-brand-black rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-2"
                           >
                             <CheckCircle2 className="w-3.5 h-3.5" /> Atualizar Portador
                           </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={() => setEditingUser(u.uid)}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-gold-deep/10 border border-white/5 text-slate-300 hover:text-gold-deep rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            <UserCog className="w-3.5 h-3.5" />
                            Gerenciar
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(u.uid)}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-red-500/10 border border-white/5 text-slate-300 hover:text-red-500 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            Revogar
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Load More Button */}
        {hasMore && !loading && (
          <div className="flex justify-center pt-8">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-8 py-3 bg-brand-black border border-white/5 text-gold-deep rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gold-deep/5 transition-all disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4" />
                  Carregar Mais Colaboradores
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => !creating && setShowAddModal(false)}
               className="absolute inset-0 bg-brand-black/90 backdrop-blur-md"
             />
             <motion.div 
               initial={{ opacity: 0, y: 50, scale: 0.95 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: 50, scale: 0.95 }}
               className="relative bg-brand-dark w-full max-w-xl rounded-[2.5rem] shadow-2xl p-10 border border-gold-deep/20 overflow-hidden"
             >
               {/* Decorative elements */}
               <div className="absolute top-0 right-0 w-32 h-32 bg-gold-deep/5 rotate-45 translate-x-16 -translate-y-16 border border-gold-deep/10" />

               <div className="relative z-10 flex items-center justify-between mb-8 pb-6 border-b border-white/5">
                 <div>
                   <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight flex items-center gap-3">
                     <UserPlus className="w-6 h-6 text-gold-deep" />
                     Novo Certificado de Acesso
                   </h2>
                   <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">Autorização Profissional Michelin Seguros</p>
                 </div>
                 <button 
                  onClick={() => setShowAddModal(false)} 
                  disabled={creating}
                  className="p-2 bg-brand-black border border-white/5 rounded-full text-slate-500 hover:text-red-500 transition-all"
                 >
                  <X className="w-6 h-6" />
                 </button>
               </div>

               <form onSubmit={handleCreateUser} className="relative z-10 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div className="md:col-span-2 space-y-1.5">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo do Portador</label>
                     <div className="relative">
                       <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-deep/50" />
                       <input 
                         type="text" 
                         required
                         placeholder="Ex: João da Silva"
                         value={newUserName || ''}
                         onChange={(e) => setNewUserName(e.target.value)}
                         className="w-full pl-11 pr-4 py-3.5 bg-brand-black border border-white/5 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/40 text-white font-bold transition-all placeholder:text-slate-700"
                       />
                     </div>
                   </div>

                   <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail de Autenticação</label>
                     <div className="relative">
                       <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-deep/50" />
                       <input 
                         type="email" 
                         required
                         placeholder="email@michelin.com"
                         value={newUserEmail || ''}
                         onChange={(e) => setNewUserEmail(e.target.value)}
                         className="w-full pl-11 pr-4 py-3.5 bg-brand-black border border-white/5 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/40 text-white font-bold transition-all placeholder:text-slate-700"
                       />
                     </div>
                   </div>

                   <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Telefone de Contato</label>
                     <div className="relative">
                       <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-deep/50" />
                       <input 
                         type="tel" 
                         required
                         placeholder="(00) 00000-0000"
                         value={newUserPhone || ''}
                         onChange={(e) => setNewUserPhone(formatPhone(e.target.value))}
                         className="w-full pl-11 pr-4 py-3.5 bg-brand-black border border-white/5 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/40 text-white font-bold transition-all placeholder:text-slate-700"
                       />
                     </div>
                   </div>

                   <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha Primária</label>
                     <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-deep/50" />
                       <input 
                         type={showPass ? "text" : "password"} 
                         required
                         placeholder="Mínimo 6 caracteres"
                         value={newUserPassword || ''}
                         onChange={(e) => setNewUserPassword(e.target.value)}
                         className="w-full pl-11 pr-12 py-3.5 bg-brand-black border border-white/5 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/40 text-white font-bold transition-all placeholder:text-slate-700"
                       />
                       <button 
                         type="button"
                         onClick={() => setShowPass(!showPass)}
                         className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-gold-deep transition-colors"
                       >
                         {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                       </button>
                     </div>
                   </div>

                   <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nível Hierárquico</label>
                     <div className="relative">
                       <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-deep/50 pointer-events-none" />
                       <select 
                         value={newUserRole || 'atendente'}
                         onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                         className="w-full pl-11 pr-10 py-3.5 bg-brand-black border border-white/5 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/40 appearance-none text-white font-black uppercase tracking-widest cursor-pointer"
                       >
                         <option value="atendente">ATENDENTE</option>
                         <option value="gestor">GESTOR</option>
                         <option value="admin">ADMINISTRADOR</option>
                       </select>
                     </div>
                   </div>

                   <div className="md:col-span-2 space-y-1.5">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Vincular Perfil de Acesso Customizado</label>
                     <select 
                       value={newUserProfileId || ''}
                       onChange={(e) => setNewUserProfileId(e.target.value)}
                       className="w-full px-5 py-3.5 bg-brand-black border border-white/5 rounded-2xl text-xs outline-none focus:ring-4 focus:ring-gold-deep/5 focus:border-gold-deep/40 appearance-none text-gold-deep font-black uppercase tracking-widest cursor-pointer"
                     >
                       <option value="">NENHUM PERFIL (USAR PERMISSÕES DA ROLE)</option>
                       {profiles.map(p => (
                         <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                       ))}
                     </select>
                   </div>

                   <div className="md:col-span-2 p-5 bg-gold-deep/5 rounded-2xl border border-gold-deep/10 space-y-4">
                      <div className="flex items-center justify-between">
                         <div>
                            <p className="text-[10px] font-black text-white uppercase tracking-widest">Tipo de Entidade</p>
                            <p className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Identidade operacional no sistema</p>
                         </div>
                         <button
                           type="button"
                           onClick={() => setNewUserType(newUserType === 'HUMAN' ? 'AI' : 'HUMAN')}
                           className={cn(
                             "w-12 h-6 rounded-full transition-all relative flex items-center px-1",
                             newUserType === 'AI' ? "bg-emerald-500" : "bg-slate-800"
                           )}
                         >
                           <div className={cn(
                             "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                             newUserType === 'AI' ? "translate-x-6" : "translate-x-0"
                           )} />
                         </button>
                      </div>
                   </div>
                 </div>

                 {regError && (
                   <div className="p-4 bg-red-600/10 border-2 border-red-600/20 rounded-2xl flex items-start gap-3">
                     <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                     <p className="text-[10px] font-black text-red-600 uppercase tracking-tight leading-tight">
                        {regError}
                     </p>
                   </div>
                 )}

                 <button 
                   disabled={creating}
                   className="w-full py-5 bg-gold-deep text-brand-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 hover:bg-gold-light transition-all shadow-2xl shadow-gold-deep/10 border-b-4 border-gold-deep/50 disabled:opacity-50"
                 >
                   {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                     <>
                       <ShieldCheck className="w-5 h-5" />
                       Emitir Credenciais de Acesso
                     </>
                   )}
                 </button>
               </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
