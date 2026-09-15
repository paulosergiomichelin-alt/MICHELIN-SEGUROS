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
import { cn, maskCPF, maskCNPJ, maskPhone } from '../../lib/utils';
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
  selectionMode,
  setSelectionMode,
  selectedLeadIds,
  toggleLeadSelected,
  exitSelectionMode,
  setShowDeleteSelectedConfirm,
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
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedLeadIds: Set<string>;
  toggleLeadSelected: (id: string) => void;
  exitSelectionMode: () => void;
  setShowDeleteSelectedConfirm: (show: boolean) => void;
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
    setSearchLeads('');
  };

  const hasActiveFilters =
    filters.status.length > 0 ||
    filters.temperature.length > 0 ||
    filters.origin.length > 0 ||
    filters.responsible.length > 0 ||
    filters.startDate ||
    filters.endDate ||
    !!searchLeads;

  const allLoadedSelected = leads.length > 0 && leads.every(l => selectedLeadIds.has(l.id));
  const someLoadedSelected = leads.some(l => selectedLeadIds.has(l.id));
  const handleToggleSelectAll = () => {
    if (allLoadedSelected) {
      leads.forEach(l => { if (selectedLeadIds.has(l.id)) toggleLeadSelected(l.id); });
    } else {
      leads.forEach(l => { if (!selectedLeadIds.has(l.id)) toggleLeadSelected(l.id); });
    }
  };

  React.useEffect(() => {
    console.log('[REAL_LEADS_LOADED]', leads.length);
    console.log('[REAL_METRICS_CALCULATED]', stats);
    console.log('[MOCK_DATA_REMOVED] - LeadsView is now purely dynamic');
  }, [leads, stats]);

  return (
    <div className="flex h-full bg-slate-50 text-slate-800">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3 transition-colors group-focus-within:text-slate-500" />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={searchLeads}
                onChange={(e) => setSearchLeads(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-8 text-[11px] text-slate-800 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all placeholder:text-slate-300 placeholder:text-[10px]"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-[9.5px] font-black uppercase tracking-widest sm:w-auto",
                showFilters ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-500"
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
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
              <Upload className="w-2.5 h-2.5 md:w-3 md:h-3" />
              Importar
            </button>
            <button onClick={handleExportLeads} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
              <Download className="w-2.5 h-2.5 md:w-3 md:h-3" />
              Exportar
            </button>
            <button onClick={clearFilters} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FDE4E4] border border-[#C0392B]/20 text-[#C0392B] whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
              <Trash2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
              Limpar
            </button>
            {!selectionMode ? (
              <button onClick={() => setSelectionMode(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
                Selecionar
              </button>
            ) : (
              <>
                <button onClick={exitSelectionMode} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
                  <X className="w-2.5 h-2.5 md:w-3 md:h-3" />
                  Cancelar
                </button>
                {someLoadedSelected && (
                  <button onClick={() => setShowDeleteSelectedConfirm(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C0392B] text-white whitespace-nowrap text-[7.5px] md:text-[8.5px] font-black uppercase tracking-widest shrink-0">
                    <Trash2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
                    Excluir Selecionados ({selectedLeadIds.size})
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto px-4 md:px-6 pb-4 custom-scrollbar">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
              <thead>
                <tr className="border-b border-slate-200 text-[7.5px] md:text-[8.5px] font-black uppercase tracking-wider text-slate-400">
                  {selectionMode && (
                    <th className="px-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={allLoadedSelected}
                        onChange={handleToggleSelectAll}
                        className="w-3.5 h-3.5 accent-gold-deep cursor-pointer"
                      />
                    </th>
                  )}
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
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => selectionMode ? toggleLeadSelected(lead.id) : handleEditLead(lead)}
                    className={cn(
                      "group cursor-pointer transition-colors hover:bg-slate-50",
                      selectionMode && selectedLeadIds.has(lead.id) && "bg-gold-deep/5"
                    )}
                  >
                    {selectionMode && (
                      <td className="px-4 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => toggleLeadSelected(lead.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 accent-gold-deep cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[9px] text-white shrink-0 bg-gradient-to-br from-slate-700 to-slate-800">
                          {lead.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold truncate group-hover:text-gold-deep transition-colors">{lead.name}</p>
                          <div className="text-[8.5px] text-slate-400 font-bold mt-0 flex items-center gap-1">
                            <span className="hidden sm:inline">{lead.tipoPessoa === 'juridica' ? 'CNPJ:' : 'CPF:'}</span>
                            <SensitiveContent value={lead.cpf} maskFn={lead.tipoPessoa === 'juridica' ? maskCNPJ : maskCPF} canView={permissions.canReadAllLeads} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1 text-slate-600 font-bold text-[9px]">
                          <SensitiveContent value={lead.phone} maskFn={maskPhone} canView={permissions.canReadAllLeads} />
                        </div>
                        <div className="text-[7.5px] font-bold text-[#1F8A4C]/60 uppercase">WhatsApp</div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md inline-block">
                        <span className="text-[7.5px] font-black uppercase text-gold-deep tracking-wider">{lead.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-center">
                        <div className={cn(
                          "px-2 py-0.5 rounded-lg text-[7.5px] font-black uppercase tracking-widest flex items-center gap-1 w-max border border-transparent transition-all",
                          lead.temperature === 'quente' ? "bg-[#FDE4E4] text-[#C0392B] border-[#C0392B]/20" :
                          lead.temperature === 'morno' ? "bg-[#FFF3DC] text-[#B8860B] border-[#B8860B]/20" :
                          "bg-slate-100 text-slate-500 border-slate-200"
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
                          (lead.score || 0) > 7 ? "border-[#1F8A4C]/40 text-[#1F8A4C] bg-[#1F8A4C]/5 shadow-inner" :
                          (lead.score || 0) > 4 ? "border-[#B8860B]/40 text-[#B8860B] bg-[#B8860B]/5" :
                          "border-[#C0392B]/40 text-[#C0392B] bg-[#C0392B]/5"
                        )}>
                          {lead.score?.toFixed(1) || '0,0'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      {(() => {
                        const uid = lead.responsibleAgentId || lead.responsibleUserId || lead.ownerId;
                        const user = uid ? crmUsers.find(u => (u.uid || (u as any).id) === uid) : undefined;
                        const displayName = lead.responsibleAgentName || user?.name || user?.email || 'Sem agente';
                        return (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                              {user?.photoURL
                                ? <img src={user.photoURL} alt={displayName} className="w-full h-full object-cover" />
                                : <span className="text-[10px] font-bold text-white/70">{displayName.charAt(0).toUpperCase()}</span>
                              }
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 truncate max-w-[90px]">{displayName}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5 hidden xl:table-cell">
                      <div className="flex flex-col">
                        <span className="text-[8.5px] font-bold text-slate-500">
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
                           className="p-1.5 hover:bg-[#FDE4E4] rounded-lg transition-all text-slate-300 hover:text-[#C0392B] group/del"
                         >
                           <Trash2 className="w-3 h-3" />
                         </button>
                         <ChevronRight className="w-3 h-3 text-slate-300" />
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
