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

// --- Helpers ---

const profileMetadata: Record<string, { icon: any; color: string; description: string }> = {
  'administrador': { icon: Shield, color: 'text-amber-500', description: 'Acesso total ao sistema' },
  'admin': { icon: Shield, color: 'text-amber-500', description: 'Acesso total ao sistema' },
  'supervisor': { icon: Briefcase, color: 'text-purple-500', description: 'Gestão de equipe e relatórios' },
  'vendedor': { icon: Target, color: 'text-blue-500', description: 'Acesso ao funil e clientes' },
  'atendente': { icon: Users, color: 'text-emerald-500', description: 'Atendimento e chats' },
  'agente ia': { icon: Bot, color: 'text-pink-500', description: 'Acesso ao agente IA' },
  'ia': { icon: Bot, color: 'text-pink-500', description: 'Acesso ao agente IA' },
  'default': { icon: Shield, color: 'text-[#D4A94D]', description: 'Permissões padrão do sistema' }
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
  <div className="bg-[#0B0B0D] p-5 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-[#D4A94D]/20 transition-all">
    <div className="flex justify-between items-start mb-3">
      <p className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-widest">{title}</p>
      <div className={cn("p-1.5 rounded-lg bg-white/5 relative", color)}>
        <Icon className="w-4 h-4 relative z-10" />
        <div className="absolute inset-0 bg-current opacity-10 blur-md" />
      </div>
    </div>
    <div className="flex items-baseline gap-2 mb-1">
      <h4 className="text-2xl font-black text-white">{value}</h4>
      <span className={cn("text-[10px] font-bold uppercase tracking-tight", color)}>{label}</span>
    </div>
    <div className="flex items-center gap-1.5 mt-2">
      {trend && (
        <div className={cn("flex items-center gap-0.5 text-[9px] font-black", trend.value > 0 ? "text-emerald-500" : "text-red-500")}>
          <TrendingUp className={cn("w-3 h-3", trend.value < 0 && "rotate-180")} />
          <span>{trend.value > 0 ? '+' : ''}{trend.value}% vs mês anterior</span>
        </div>
      )}
      <p className="text-[9px] text-[#9CA3AF] font-medium uppercase tracking-widest ml-auto">{subLabel}</p>
    </div>
    {/* Subtle glow border item */}
    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#D4A94D]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
  </div>
);

export const TeamPage = () => {
  const { userProfile: currentUser, permissions } = usePermissions();
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

  // New User Modal replaced by UserProfileModal
  const [showUserManagement, setShowUserManagement] = useState<{ mode: 'create' | 'edit', userId?: string } | null>(null);

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
    <div className="flex-1 flex flex-col min-h-0 bg-[#050505] text-white">
      {/* Top Metrics Bar */}
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard 
          title="Total de Usuários"
          value={stats.total}
          label="Ativos"
          subLabel={`${stats.inactive} inativos`}
          icon={Users}
          color="text-[#D4A94D]"
        />
        <MetricCard 
          title="Usuários Online"
          value={stats.online}
          label="Online"
          subLabel={`${Math.round((stats.online / (stats.total || 1)) * 100)}% do total`}
          icon={Activity}
          color="text-emerald-500"
        />
         <MetricCard 
          title="Leads por Usuário"
          value={stats.avgLeads.toFixed(1)}
          label="Média"
          trend={{ value: 12, label: 'vs mês anterior' }}
          icon={Target}
          color="text-[#D4A94D]"
        />
        <MetricCard 
          title="Conversão Média"
          value={`${stats.avgConv.toFixed(1)}%`}
          label="Benchmark"
          trend={{ value: 3.2, label: 'vs mês anterior' }}
          icon={TrendingUp}
          color="text-emerald-500"
        />
        <MetricCard 
          title="Usuários Sem Leads"
          value={stats.noLeads}
          label="Atenção"
          subLabel="Requer ação"
          icon={Users}
          color="text-amber-500"
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 p-6 pt-0">
        <div className="flex-1 flex gap-6 min-h-0">
          
          {/* Left Column: Grid & Controls */}
          <div className="flex-1 flex flex-col gap-6 min-h-0">
            
            {/* Tabs */}
            <div className="flex items-center gap-8 border-b border-white/5">
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
                    activeTab === tab.id ? "text-[#D4A94D]" : "text-[#9CA3AF] hover:text-white"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4A94D]" 
                    />
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'usuarios' && (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-4 bg-[#0B0B0D] p-4 rounded-2xl border border-white/5">
                  <div className="relative flex-1 min-w-[280px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                    <input 
                      type="text"
                      placeholder="Buscar usuários..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-transparent border border-white/10 rounded-xl pl-11 pr-4 py-2 text-sm focus:border-[#D4A94D]/50 outline-none transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Perfil</span>
                      <select 
                        value={filterProfile}
                        onChange={(e) => setFilterProfile(e.target.value)}
                        className="bg-transparent border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none focus:border-[#D4A94D]/50"
                      >
                        <option value="all" className="bg-[#0B0B0D]">Todos</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id} className="bg-[#0B0B0D]">{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Status</span>
                      <select 
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-transparent border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none focus:border-[#D4A94D]/50"
                      >
                        <option value="all" className="bg-[#0B0B0D]">Todos</option>
                        <option value="active" className="bg-[#0B0B0D]">Ativos</option>
                        <option value="inactive" className="bg-[#0B0B0D]">Inativos</option>
                        <option value="suspended" className="bg-[#0B0B0D]">Suspensos</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest ml-1">Online</span>
                      <select 
                        value={filterOnline}
                        onChange={(e) => setFilterOnline(e.target.value)}
                        className="bg-transparent border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none focus:border-[#D4A94D]/50"
                      >
                        <option value="all" className="bg-[#0B0B0D]">Todos</option>
                        <option value="online" className="bg-[#0B0B0D]">Sim</option>
                        <option value="offline" className="bg-[#0B0B0D]">Não</option>
                      </select>
                    </div>

                    <button 
                      onClick={() => setShowUserManagement({ mode: 'create' })}
                      className="bg-[#D4A94D] hover:bg-[#CFA764] text-[#050505] px-6 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-[0.15em] flex items-center gap-2 transition-all mt-4"
                    >
                      <Plus className="w-4 h-4" />
                      Novo Usuário
                    </button>
                  </div>
                </div>

                {/* User Grid */}
                <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-[#D4A94D]/20 border-t-[#D4A94D] rounded-full animate-spin" />
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#9CA3AF]">
                      <Users className="w-16 h-16 mb-4 opacity-20" />
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
                             onClick={() => setShowUserManagement({ mode: 'edit', userId: u.uid })}
                             className="bg-[#0B0B0D] rounded-2xl border border-white/5 p-6 flex flex-col items-center text-center relative group hover:border-[#D4A94D]/30 transition-all border-glow cursor-pointer"
                           >
                            <button className="absolute top-4 right-4 text-[#9CA3AF] hover:text-white transition-colors">
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Avatar with Glow */}
                            <div className="relative mb-4">
                              <div className={cn(
                                "w-20 h-20 rounded-full border-4 border-[#050505] overflow-hidden bg-[#1A1A1F] shadow-2xl relative z-10",
                                status === 'ONLINE' ? "ring-2 ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]" : "ring-1 ring-white/10"
                              )}>
                                {u.photoURL ? (
                                  <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[#D4A94D]/30">
                                    <UserIcon className="w-10 h-10" />
                                  </div>
                                )}
                              </div>
                              {/* Gold Glow behind avatar */}
                              <div className="absolute inset-0 bg-[#D4A94D]/5 blur-2xl rounded-full scale-150 animate-pulse" />
                              <div className={cn(
                                "absolute bottom-1 right-1 w-4 h-4 rounded-full border-4 border-[#0B0B0D] z-20",
                                status === 'ONLINE' ? "bg-emerald-500" : "bg-[#9CA3AF]"
                              )} />
                            </div>

                            <h3 className="text-base font-black text-white px-2 truncate w-full">{u.name}</h3>
                            <p className="text-[10px] font-bold text-[#D4A94D] uppercase tracking-widest mb-6">{roleName}</p>

                            <div className="w-full grid grid-cols-3 gap-2 border-t border-white/5 pt-6 relative z-10">
                              <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest">Leads</span>
                                <span className="text-xs font-black text-white">{u.metrics?.totalLeads || 0}</span>
                              </div>
                              <div className="flex flex-col gap-1 border-x border-white/10">
                                <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest">Conversão</span>
                                <span className="text-xs font-black text-white">{u.metrics?.conversionRate || 0}%</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[8px] font-black text-[#9CA3AF] uppercase tracking-widest">Último acesso</span>
                                <span className={cn(
                                  "text-[10px] font-black uppercase whitespace-nowrap",
                                  status === 'ONLINE' ? "text-emerald-500" : "text-[#9CA3AF]"
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
                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                  <p className="text-[11px] font-medium text-[#9CA3AF]">
                    Mostrando <span className="text-white font-bold">{Math.min(filteredUsers.length, (currentPage - 1) * rowsPerPage + 1)}</span> a <span className="text-white font-bold">{Math.min(filteredUsers.length, currentPage * rowsPerPage)}</span> de <span className="text-white font-bold">{filteredUsers.length}</span> usuários
                  </p>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-white/10 text-[#9CA3AF] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                              currentPage === i + 1 ? "bg-[#D4A94D]/10 text-[#D4A94D] border border-[#D4A94D]/20 shadow-glow" : "text-[#9CA3AF] hover:bg-white/5"
                            )}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-white/10 text-[#9CA3AF] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-[#9CA3AF]">Linhas por página</span>
                      <select 
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-[#0B0B0D] border border-white/10 rounded-xl px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-[#D4A94D]/50"
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
              <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF]">
                <ShieldAlert className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">Configurações de Permissões Básicas</p>
                <p className="text-[10px] mt-2 opacity-50 uppercase tracking-widest">Acesse Perfil de Acesso para configurar</p>
              </div>
            )}
          </div>

          {/* Right Column: Profiles Summary */}
          <div className="w-[320px] shrink-0 flex flex-col gap-6">
            <div className="bg-[#0B0B0D] rounded-2xl border border-white/5 p-6 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[11px] font-black text-white uppercase tracking-widest">Perfís de Acesso</h3>
                <button 
                  onClick={() => setActiveTab('perfis')}
                  className="text-[10px] font-black text-[#9CA3AF] hover:text-[#D4A94D] uppercase tracking-widest transition-colors flex items-center gap-1"
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
                    <div key={p.id || `profile-${idx}`} className="p-4 rounded-xl border border-white/5 bg-white/0 hover:bg-white/5 transition-all group cursor-pointer">
                      <div className="flex items-start gap-4">
                        <div className={cn("w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-opacity-10 transition-colors", meta.color)}>
                          <Icon className="w-5 h-5 shadow-[0_0_10px_currentColor]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-black text-white uppercase truncate">{p.name}</h4>
                            <span className="text-[9px] font-bold text-[#9CA3AF] whitespace-nowrap">{userCount} usuários</span>
                          </div>
                          <p className="text-[9px] text-[#9CA3AF] font-medium leading-relaxed mt-1 line-clamp-1">{p.description || meta.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botão para Gerencial (Exemplo) */}
              <div className="mt-auto pt-6">
                <div className="p-4 rounded-xl bg-[#D4A94D]/5 border border-[#D4A94D]/10 text-center">
                   <p className="text-[9px] font-bold text-[#D4A94D] uppercase tracking-widest mb-1">Dica de Segurança</p>
                   <p className="text-[8px] text-[#9CA3AF] leading-relaxed">Sempre revise as permissões de novos perfis antes de atribuir a usuários.</p>
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
               className="absolute inset-0 bg-brand-black/95 backdrop-blur-xl"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full h-full md:max-w-[1400px] md:max-h-[95vh] overflow-hidden md:rounded-[2.5rem] md:border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)]"
             >
               <UserProfileModal 
                 mode={showUserManagement.mode}
                 targetUserId={showUserManagement.userId}
                 user={currentUser}
                 profile={currentUser}
                 onClose={() => setShowUserManagement(null)}
               />
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .border-glow {
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
        }
        .border-glow:hover {
          box-shadow: 0 0 30px rgba(212, 169, 77, 0.05);
        }
        .shadow-glow {
          box-shadow: 0 0 10px rgba(212, 169, 77, 0.2);
        }
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
