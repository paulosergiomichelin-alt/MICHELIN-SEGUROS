import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Activity, 
  Target, 
  TrendingUp, 
  AlertCircle, 
  Search, 
  Plus, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight,
  Shield,
  Briefcase,
  Zap,
  Bot,
  UserPlus,
  Clock,
  Filter,
  CheckCircle2,
  Mail,
  Phone,
  History,
  Lock,
  UserCog,
  User as UserIcon,
  Cpu,
  X,
  Eye,
  EyeOff,
  ShieldAlert,
  Settings as SettingsIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataService } from '../../services/DataService';
import { usePermissions } from '../../contexts/PermissionsContext';
import { UserProfile, AccessProfile, UserRole, SystemUser } from '../../types';
import { AccessProfileManagement } from './AccessProfileManagement';
import { UserProfileModal } from '../../components/UserProfileModal';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';
import { auditLogger } from '../../services/AuditLogger';
import { Button } from '../../components/ui';

// --- Helpers ---

const profileMetadata: Record<string, { icon: any; color: string; description: string }> = {
  'administrador': { icon: Shield, color: 'text-amber-500', description: 'Acesso total ao sistema' },
  'admin': { icon: Shield, color: 'text-amber-500', description: 'Acesso total ao sistema' },
  'supervisor': { icon: Briefcase, color: 'text-purple-500', description: 'Gestão de equipe e relatórios' },
  'vendedor': { icon: Target, color: 'text-blue-500', description: 'Acesso ao funil e clientes' },
  'atendente': { icon: Users, color: 'text-emerald-500', description: 'Atendimento e chats' },
  'agente ia': { icon: Bot, color: 'text-pink-500', description: 'Acesso ao agente IA' },
  'ia': { icon: Bot, color: 'text-pink-500', description: 'Acesso ao agente IA' },
  'default': { icon: Shield, color: 'text-gold-deep', description: 'Permissões padrão do sistema' }
};

const getUserOnlineStatus = (u: SystemUser) => {
  const lastAccess = u.activity?.lastAccess || u.lastAccess;
  if (!lastAccess) return 'OFFLINE';
  try {
    const last = (lastAccess && typeof lastAccess.toDate === 'function') ? lastAccess.toDate() : new Date(lastAccess);
    const diffMinutes = (Date.now() - last.getTime()) / (1000 * 60);
    if (diffMinutes < 5) return 'ONLINE';
    if (diffMinutes < 30) return 'AWAY';
    return 'OFFLINE';
  } catch (e) {
    return 'OFFLINE';
  }
};

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

// --- Components ---

const MetricCard = ({ title, value, label, subLabel, icon: Icon, color, trend }: any) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-gold-deep/30 transition-all">
    <div className="flex justify-between items-start mb-3">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      <div className={cn("p-1.5 rounded-lg bg-slate-50 relative", color)}>
        <Icon className="w-4 h-4 relative z-10" />
      </div>
    </div>
    <div className="flex items-baseline gap-2 mb-1">
      <h4 className="text-2xl font-black text-slate-800">{value}</h4>
      <span className={cn("text-[10px] font-bold uppercase tracking-tight", color)}>{label}</span>
    </div>
    <div className="flex items-center gap-1.5 mt-2">
      {trend && (
        <div className={cn("flex items-center gap-0.5 text-[9px] font-black", trend.value > 0 ? "text-[#1F8A4C]" : "text-[#C0392B]")}>
          <TrendingUp className={cn("w-3 h-3", trend.value < 0 && "rotate-180")} />
          <span>{trend.value > 0 ? '+' : ''}{trend.value}% vs mês anterior</span>
        </div>
      )}
      <p className="text-[9px] text-slate-400 font-medium uppercase tracking-widest ml-auto">{subLabel}</p>
    </div>
  </div>
);

export const TeamPage = () => {
  const { userProfile: currentUser, permissions } = usePermissions();
  const navigate = useNavigate();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'usuarios' | 'perfis' | 'permissoes'>('usuarios');

  // Filters
  const [search, setSearch] = useState('');
  const [filterProfile, setFilterProfile] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOnline, setFilterOnline] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);

  // Modal only used for creating new users; editing navigates to /users/:uid
  const [showUserManagement, setShowUserManagement] = useState<{ mode: 'create' } | null>(null);

  // Fetch Data
  useEffect(() => {
    const unsubUsers = DataService.subscribeCollection('users', [], (data: any[]) => {
      setUsers(data);
      setLoading(false);
    });

    const unsubProfiles = DataService.subscribeCollection('access_profile', [], (data: any[]) => {
      setProfiles(data);
    });

    return () => {
      unsubUsers();
      unsubProfiles();
    };
  }, []);

  // Calculated Stats
  const stats = useMemo(() => {
    const total = users.length;
    const online = users.filter(u => getUserOnlineStatus(u) === 'ONLINE').length;
    const active = users.filter(u => u.status === 'active').length;
    const inactive = total - active;
    const avgLeads = users.length > 0 ? users.reduce((acc, u) => acc + (u.metrics?.totalLeads || 0), 0) / users.length : 0;
    const avgConv = users.length > 0 ? users.reduce((acc, u) => acc + (u.metrics?.conversionRate || 0), 0) / users.length : 0;
    const noLeads = users.filter(u => (u.metrics?.totalLeads || 0) === 0).length;

    return { total, online, avgLeads, avgConv, noLeads, inactive };
  }, [users]);

  // Filtering Logic
  const filteredUsers = useMemo(() => {
    const normalize = (s: string) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
    const term = normalize(search);

    return users.filter(u => {
      const uName = normalize(u.name || "");
      const uEmail = normalize(u.email || "");
      
      const matchesSearch = uName.includes(term) || uEmail.includes(term);
      const matchesProfile = filterProfile === 'all' || u.profileId === filterProfile;
      const matchesStatus = filterStatus === 'all' || u.status === filterStatus;
      const matchesOnline = filterOnline === 'all' || (filterOnline === 'online' && getUserOnlineStatus(u) === 'ONLINE') || (filterOnline === 'offline' && getUserOnlineStatus(u) === 'OFFLINE');
      return matchesSearch && matchesProfile && matchesStatus && matchesOnline;
    });
  }, [users, search, filterProfile, filterStatus, filterOnline]);

  // Pagination Logic
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredUsers.slice(start, start + rowsPerPage);
  }, [filteredUsers, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredUsers.length / rowsPerPage);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      {/* Top Metrics Bar */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total de Usuários"
          value={stats.total}
          label="Ativos"
          subLabel={`${stats.inactive} inativos`}
          icon={Users}
          color="text-gold-deep"
        />
        <MetricCard
          title="Usuários Online"
          value={stats.online}
          label="Online"
          subLabel={`${Math.round((stats.online / (stats.total || 1)) * 100)}% do total`}
          icon={Activity}
          color="text-[#1F8A4C]"
        />
         <MetricCard
          title="Leads por Usuário"
          value={stats.avgLeads.toFixed(1)}
          label="Média"
          trend={{ value: 12, label: 'vs mês anterior' }}
          icon={Target}
          color="text-gold-deep"
        />
        <MetricCard
          title="Conversão Média"
          value={`${stats.avgConv.toFixed(1)}%`}
          label="Benchmark"
          trend={{ value: 3.2, label: 'vs mês anterior' }}
          icon={TrendingUp}
          color="text-[#1F8A4C]"
        />
        <MetricCard
          title="Usuários Sem Leads"
          value={stats.noLeads}
          label="Atenção"
          subLabel="Requer ação"
          icon={Users}
          color="text-[#B8860B]"
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 p-6 pt-0">
        <div className="flex-1 flex gap-6 min-h-0">
          
          {/* Left Column: Grid & Controls */}
          <div className="flex-1 flex flex-col gap-6 min-h-0">
            
            {/* Tabs */}
            <div className="flex items-center gap-8 border-b border-slate-200">
              {[
                { id: 'usuarios', label: 'USUÁRIOS', icon: Users },
                { id: 'perfis', label: 'PERFIS DE ACESSO', icon: Shield },
                { id: 'permissoes', label: 'PERMISSÕES', icon: SettingsIcon }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex items-center gap-2 py-4 text-[11px] font-black tracking-widest transition-all relative",
                    activeTab === tab.id ? "text-[#1B4D8F]" : "text-slate-400 hover:text-slate-700"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1B4D8F]"
                    />
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'usuarios' && (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="relative flex-1 min-w-[280px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar usuários..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-2 text-sm text-slate-800 focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 outline-none transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Perfil</span>
                      <select
                        value={filterProfile}
                        onChange={(e) => setFilterProfile(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1B4D8F]/60"
                      >
                        <option value="all">Todos</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</span>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1B4D8F]/60"
                      >
                        <option value="all">Todos</option>
                        <option value="active">Ativos</option>
                        <option value="inactive">Inativos</option>
                        <option value="suspended">Suspensos</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Online</span>
                      <select
                        value={filterOnline}
                        onChange={(e) => setFilterOnline(e.target.value)}
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#1B4D8F]/60"
                      >
                        <option value="all">Todos</option>
                        <option value="online">Sim</option>
                        <option value="offline">Não</option>
                      </select>
                    </div>

                    <Button
                      variant="primary"
                      icon={Plus}
                      onClick={() => setShowUserManagement({ mode: 'create' })}
                      className="mt-4"
                    >
                      Novo Usuário
                    </Button>
                  </div>
                </div>

                {/* User Grid */}
                <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-gold-deep/20 border-t-gold-deep rounded-full animate-spin" />
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                      <Users className="w-16 h-16 mb-4 opacity-30" />
                      <p className="text-sm font-bold uppercase tracking-widest">Nenhum usuário encontrado</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {paginatedUsers.map((u, idx) => {
                        const status = getUserOnlineStatus(u);
                        const roleName = profiles.find(p => p.id === u.profileId)?.name || u.role;
                        const userKey = u.uid || u.id || `user-${u.email || idx}`;
                        
                        return (
                           <motion.div
                             key={userKey}
                             initial={{ opacity: 0, y: 10 }}
                             animate={{ opacity: 1, y: 0 }}
                             onClick={() => navigate('/users/' + u.uid)}
                             className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col items-center text-center relative group hover:border-gold-deep/40 hover:shadow-md transition-all cursor-pointer"
                           >
                            <button className="absolute top-4 right-4 text-slate-300 hover:text-slate-600 transition-colors">
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Avatar */}
                            <div className="relative mb-4">
                              <div className={cn(
                                "w-20 h-20 rounded-full border-4 border-white overflow-hidden bg-slate-100 shadow relative z-10",
                                status === 'ONLINE' ? "ring-2 ring-[#1F8A4C]/50" : "ring-1 ring-slate-200"
                              )}>
                                {u.photoURL ? (
                                  <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gold-deep/40">
                                    <UserIcon className="w-10 h-10" />
                                  </div>
                                )}
                              </div>
                              <div className={cn(
                                "absolute bottom-1 right-1 w-4 h-4 rounded-full border-4 border-white z-20",
                                status === 'ONLINE' ? "bg-[#1F8A4C]" : "bg-slate-300"
                              )} />
                            </div>

                            <h3 className="text-base font-black text-slate-800 px-2 truncate w-full">{u.name}</h3>
                            <p className="text-[10px] font-bold text-gold-deep uppercase tracking-widest mb-6">{roleName}</p>

                            <div className="w-full grid grid-cols-3 gap-2 border-t border-slate-100 pt-6 relative z-10">
                              <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Leads</span>
                                <span className="text-xs font-black text-slate-800">{u.metrics?.totalLeads || 0}</span>
                              </div>
                              <div className="flex flex-col gap-1 border-x border-slate-100">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Conversão</span>
                                <span className="text-xs font-black text-slate-800">{u.metrics?.conversionRate || 0}%</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Último acesso</span>
                                <span className={cn(
                                  "text-[10px] font-black uppercase whitespace-nowrap",
                                  status === 'ONLINE' ? "text-[#1F8A4C]" : "text-slate-400"
                                )}>
                                  {status === 'ONLINE' ? 'Online' : u.lastAccess ? formatDistanceToNow((u.lastAccess as any).toDate ? (u.lastAccess as any).toDate() : new Date(u.lastAccess), { locale: ptBR }) : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                  <p className="text-[11px] font-medium text-slate-400">
                    Mostrando <span className="text-slate-800 font-bold">{Math.min(filteredUsers.length, (currentPage - 1) * rowsPerPage + 1)}</span> a <span className="text-slate-800 font-bold">{Math.min(filteredUsers.length, currentPage * rowsPerPage)}</span> de <span className="text-slate-800 font-bold">{filteredUsers.length}</span> usuários
                  </p>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-1">
                        {[...Array(totalPages)].map((_, i) => (
                          <button
                            key={i === 0 ? 'page-first' : `page-${i}`}
                            onClick={() => setCurrentPage(i + 1)}
                            className={cn(
                              "w-8 h-8 rounded-lg text-[11px] font-black transition-all",
                              currentPage === i + 1 ? "bg-gold-deep/10 text-gold-deep border border-gold-deep/25" : "text-slate-400 hover:bg-slate-100"
                            )}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-slate-400">Linhas por página</span>
                      <select
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1B4D8F]/60"
                      >
                        <option value={4}>4</option>
                        <option value={8}>8</option>
                        <option value={12}>12</option>
                        <option value={16}>16</option>
                        <option value={20}>20</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'perfis' && (
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                <AccessProfileManagement />
              </div>
            )}

            {activeTab === 'permissoes' && (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <ShieldAlert className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-sm font-bold uppercase tracking-widest">Configurações de Permissões Básicas</p>
                <p className="text-[10px] mt-2 opacity-70 uppercase tracking-widest">Acesse Perfil de Acesso para configurar</p>
              </div>
            )}
          </div>

          {/* Right Column: Profiles Summary */}
          <div className="w-[320px] shrink-0 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Perfís de Acesso</h3>
                <button
                  onClick={() => setActiveTab('perfis')}
                  className="text-[10px] font-black text-slate-400 hover:text-gold-deep uppercase tracking-widest transition-colors flex items-center gap-1"
                >
                  Ver todos
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto no-scrollbar pr-1">
                {profiles.map((p, idx) => {
                  const userCount = users.filter(u => u.profileId === p.id).length;
                  const meta = profileMetadata[p.name.toLowerCase()] || profileMetadata.default;
                  const Icon = meta.icon;

                  return (
                    <div key={p.id || `profile-${idx}`} className="p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-all group cursor-pointer">
                      <div className="flex items-start gap-4">
                        <div className={cn("w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center transition-colors", meta.color)}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-black text-slate-800 uppercase truncate">{p.name}</h4>
                            <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">{userCount} usuários</span>
                          </div>
                          <p className="text-[9px] text-slate-400 font-medium leading-relaxed mt-1 line-clamp-1">{p.description || meta.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botão para Gerencial (Exemplo) */}
              <div className="mt-auto pt-6">
                <div className="p-4 rounded-xl bg-gold-deep/5 border border-gold-deep/20 text-center">
                   <p className="text-[9px] font-bold text-gold-deep uppercase tracking-widest mb-1">Dica de Segurança</p>
                   <p className="text-[8px] text-slate-500 leading-relaxed">Sempre revise as permissões de novos perfis antes de atribuir a usuários.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Management Unified Modal */}
      <AnimatePresence>
        {showUserManagement && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setShowUserManagement(null)}
               className="absolute inset-0 bg-black/70 backdrop-blur-sm"
             />
             <motion.div
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full h-full md:max-w-[1400px] md:max-h-[95vh] overflow-hidden md:rounded-[2.5rem] md:border border-slate-200 shadow-2xl"
             >
               <UserProfileModal
                 mode="create"
                 user={currentUser}
                 profile={currentUser}
                 onClose={() => setShowUserManagement(null)}
               />
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};
