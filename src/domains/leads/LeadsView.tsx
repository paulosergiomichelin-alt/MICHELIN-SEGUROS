import React from 'react';
import {
  MessageSquare,
  FileText,
  TrendingDown,
  PlusCircle,
  Search,
  Trash2,
  Upload,
  Edit2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Lock,
  Clock,
  FileSearch,
  Send,
  Sparkles,
  Bot,
  Zap,
  ZapOff,
  Download,
  Filter,
  Flame,
  X,
  History,
  UserCheck
} from 'lucide-react';
import { Lead, LeadStatus, Permissions, UserProfile } from '../../types';
import { cn, maskCPF, maskPhone } from '../../lib/utils';
import { motion } from 'motion/react';
import { StatusBadge } from '../../components/StatusBadge';
import { SensitiveContent } from '../../components/SensitiveContent';
import { useDebounce } from '../../hooks/useDebounce';
import { LeadRowSkeleton, LeadSkeleton } from '../../components/Skeleton';

export const LeadsView = React.memo(({ 
  leads, 
  crmUsers = [],
  totalLeads,
  searchLeads, 
  setSearchLeads, 
  filters,
  setFilters,
  permissions, 
  handleEditLead, 
  handleDeleteLead, 
  setActiveTab, 
  setShowDeleteAllConfirm, 
  setShowImport, 
  setShowAddLead, 
  isImporting,
  loadMoreLeads,
  hasMoreLeads,
  leadsLoading,
  stats,
  handleRefresh,
  isRefreshing,
  handleExportLeads
}: { 
  leads: Lead[];
  crmUsers: UserProfile[];
  totalLeads: number;
  searchLeads: string; 
  setSearchLeads: (s: string) => void;
  filters: any;
  setFilters: (f: any) => void;
  permissions: Permissions;
  handleEditLead: (lead: Lead) => void;
  handleDeleteLead: (id: string) => void;
  setActiveTab: (tab: any) => void;
  setShowDeleteAllConfirm: (show: boolean) => void;
  setShowImport: (show: boolean) => void;
  setShowAddLead: (show: boolean) => void;
  isImporting: boolean;
  loadMoreLeads?: () => void;
  hasMoreLeads?: boolean;
  leadsLoading?: boolean;
  stats: { 
    total: number; 
    quente: number; 
    novosHoje: number; 
    emAtendimento: number;
    conversao: number;
  };
  handleRefresh: () => void;
  isRefreshing: boolean;
  handleExportLeads: () => void;
}) => {
  const [showFilters, setShowFilters] = React.useState(false);

  const clearFilters = () => {
    setFilters({
      status: [],
      temperature: [],
      origin: [],
      responsible: [],
      startDate: '',
      endDate: ''
    });
  };

  const hasActiveFilters = 
    filters.status.length > 0 || 
    filters.temperature.length > 0 || 
    filters.origin.length > 0 || 
    filters.responsible.length > 0 ||
    filters.startDate || 
    filters.endDate;

  React.useEffect(() => {
    console.log('[REAL_LEADS_LOADED]', leads.length);
    console.log('[REAL_METRICS_CALCULATED]', stats);
    console.log('[MOCK_DATA_REMOVED] - LeadsView is now purely dynamic');
  }, [leads, stats]);

  return (
    <div className="flex h-full bg-[#0B0B0D] text-white">
      {/* AREA CENTRAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* HEADER */}
        <header className="px-4 md:px-6 py-2.5 md:py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight uppercase">Gestão de Leads</h1>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowAddLead(true)}
              className="flex-1 sm:flex-none px-4 py-1 bg-gold-deep text-brand-dark rounded-lg font-black text-[9.5px] hover:bg-gold-light transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-gold-deep/10"
            >
              Novo Lead
              <PlusCircle className="w-3 h-3" />
            </button>
          </div>
        </header>

        {/* TOOLBAR */}
        <div className="px-4 md:px-6 mb-3 md:mb-3.5 space-y-2 md:space-y-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 w-3 h-3 transition-colors group-focus-within:text-gold-deep" />
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                value={searchLeads}
                onChange={(e) => setSearchLeads(e.target.value)}
                className="w-full bg-[#111214] border border-white/5 rounded-xl py-1.5 px-8 text-[11px] outline-none focus:border-gold-deep/30 focus:ring-4 focus:ring-gold-deep/5 transition-all placeholder:text-[10px]"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-[9.5px] font-black uppercase tracking-widest sm:w-auto",
                showFilters ? "bg-white/10 border-white/20" : "bg-[#111214] border-white/5 hover:bg-[#18191b]"
              )}
            >
              <Filter className="w-3 h-3" />
              Filtros
              {hasActiveFilters && (
                <span className="bg-gold-deep text-brand-dark px-1 py-0.5 rounded-md text-[8px]">
                  {((filters.status?.length || 0) + (filters.temperature?.length || 0) + (filters.origin?.length || 0) + (filters.responsible?.length || 0) + (filters.startDate ? 1 : 0) + (filters.endDate ? 1 : 0))}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-hide no-scrollbar">
            <button onClick={() => setShowAddLead(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gold-deep/10 border border-gold-deep/20 text-gold-deep whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
              <PlusCircle className="w-2.5 h-2.5 md:w-3 md:h-3" />
              Lead
            </button>
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111214] border border-white/5 text-white/50 whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
              <Upload className="w-2.5 h-2.5 md:w-3 md:h-3" />
              Importar
            </button>
            <button onClick={handleExportLeads} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111214] border border-white/5 text-white/50 whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
              <Download className="w-2.5 h-2.5 md:w-3 md:h-3" />
              Exportar
            </button>
            <button onClick={clearFilters} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/5 border border-red-500/10 text-red-500 whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
              <Trash2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
              Limpar
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto px-4 md:px-6 pb-4 custom-scrollbar">
          <div className="bg-[#111214] rounded-xl border border-white/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
              <thead>
                <tr className="border-b border-white/5 text-[7.5px] md:text-[8.5px] font-black uppercase tracking-wider text-white/20">
                  <th className="px-4 py-2.5">Lead</th>
                  <th className="px-4 py-2.5 hidden sm:table-cell">Contato</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-center">Temp.</th>
                  <th className="px-4 py-2.5 text-center hidden md:table-cell">IA Score</th>
                  <th className="px-4 py-2.5 hidden lg:table-cell">Responsável</th>
                  <th className="px-4 py-2.5 hidden xl:table-cell">Última</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {leads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    onClick={() => handleEditLead(lead)}
                    className="group cursor-pointer transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[9px] shrink-0 bg-gradient-to-br from-slate-700 to-slate-800">
                          {lead.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold truncate group-hover:text-gold-deep transition-colors">{lead.name}</p>
                          <div className="text-[8.5px] text-white/20 font-bold mt-0 flex items-center gap-1">
                            <span className="hidden sm:inline">CPF:</span> 
                            <SensitiveContent value={lead.cpf} maskFn={maskCPF} canView={permissions.canReadAllLeads} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1 text-white/70 font-bold text-[9px]">
                          <SensitiveContent value={lead.phone} maskFn={maskPhone} canView={permissions.canReadAllLeads} />
                        </div>
                        <div className="text-[7.5px] font-bold text-emerald-500/60 uppercase">WhatsApp</div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="px-2 py-0.5 bg-white/5 border border-white/5 rounded-md inline-block">
                        <span className="text-[7.5px] font-black uppercase text-gold-deep tracking-wider">{lead.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-center">
                        <div className={cn(
                          "px-2 py-0.5 rounded-lg text-[7.5px] font-black uppercase tracking-widest flex items-center gap-1 w-max border border-transparent transition-all",
                          lead.temperature === 'quente' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                          lead.temperature === 'morno' ? "bg-orange-500/10 text-orange-500 border-orange-500/20" :
                          "bg-blue-500/10 text-blue-500 border-blue-500/20"
                        )}>
                          <Flame className="w-2.5 h-2.5" />
                          <span className="hidden sm:inline">{lead.temperature || 'Frio'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <div className="flex justify-center">
                        <div className={cn(
                          "w-6 h-6 rounded-full border flex items-center justify-center font-black text-[8px]",
                          (lead.score || 0) > 7 ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5 shadow-inner" : 
                          (lead.score || 0) > 4 ? "border-orange-500/40 text-orange-500 bg-orange-500/5" : 
                          "border-red-500/40 text-red-500 bg-red-500/5"
                        )}>
                          {lead.score?.toFixed(1) || '0,0'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden border border-white/10 flex items-center justify-center shrink-0">
                          {(() => {
                            const user = crmUsers.find(u => u.uid === (lead.responsibleAgentId || lead.responsibleUserId));
                            if (user?.photoURL) {
                              return <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />;
                            }
                            const initial = (lead.responsibleAgentName || user?.name || 'S').charAt(0).toUpperCase();
                            return <span className="text-[10px] font-bold text-white/40">{initial}</span>;
                          })()}
                        </div>
                        <span className="text-[9px] font-bold text-white/50 truncate max-w-[90px]">{lead.responsibleAgentName || 'Sem agente'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden xl:table-cell">
                      <div className="flex flex-col">
                        <span className="text-[8.5px] font-bold text-white/50">
                          {lead.lastInteraction ? new Date(lead.lastInteraction).toLocaleDateString() : '---'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                       <div className="flex items-center justify-end gap-2">
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             handleDeleteLead(lead.id);
                           }}
                           className="p-1.5 hover:bg-red-500/10 rounded-lg transition-all text-white/10 hover:text-red-500 group/del"
                         >
                           <Trash2 className="w-3 h-3" />
                         </button>
                         <ChevronRight className="w-3 h-3 text-white/20" />
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

LeadsView.displayName = 'LeadsView';
