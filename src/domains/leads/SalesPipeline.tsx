import React, { useMemo } from 'react';
import { 
  Users, 
  MessageSquare, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  PlusCircle, 
  FileText,
  FileSearch,
  Send,
  Sparkles,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Filter,
  BarChart3,
  Calendar,
  Flame,
  Snowflake,
  Thermometer,
  Bot,
  Zap,
  ZapOff,
  RefreshCcw,
  LayoutGrid,
  MoreVertical,
  History,
  Activity,
  ChevronDown,
  List
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Lead, LeadStatus, LeadTemperature, Permissions, UserProfile } from '../../types';
import { cn, maskCPF, maskPhone } from '../../lib/utils';
import { format, differenceInMinutes, differenceInHours, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useViewport } from '../../hooks/useAppContexts';
import { useNavigate } from 'react-router-dom';
import { useLeads } from '../../contexts/LeadRealtimeContext';
import { DataService } from '../../services/DataService';

interface SalesPipelineProps {
  permissions: Permissions;
  visualConfig: any;
  setActiveTab?: (tab: any) => void;
}

const STAGES: LeadStatus[] = [
  'Novo Lead',
  'Em Atendimento',
  'Aguardando Documento',
  'Em Cotação',
  'Proposta Enviada',
  'Fechado',
  'Perdido'
];

const STAGE_CONFIG: Record<string, { color: string; icon: any; glow: string }> = {
  'Novo Lead': { color: 'text-white/60 bg-white/5', icon: History, glow: 'group-hover:shadow-white/5' },
  'Em Atendimento': { color: 'text-blue-500 bg-blue-500/10', icon: MessageSquare, glow: 'group-hover:shadow-blue-500/10' },
  'Aguardando Documento': { color: 'text-orange-500 bg-orange-500/10', icon: FileSearch, glow: 'group-hover:shadow-orange-500/10' },
  'Em Cotação': { color: 'text-gold-deep bg-gold-deep/10', icon: Clock, glow: 'group-hover:shadow-gold-deep/10' },
  'Proposta Enviada': { color: 'text-indigo-500 bg-indigo-500/10', icon: Send, glow: 'group-hover:shadow-indigo-500/10' },
  'Fechado': { color: 'text-emerald-500 bg-emerald-500/10', icon: CheckCircle2, glow: 'group-hover:shadow-emerald-500/10' },
  'Perdido': { color: 'text-red-500 bg-red-500/10', icon: X, glow: 'group-hover:shadow-red-500/10' },
};

const TemperatureBadge = ({ temp }: { temp?: LeadTemperature }) => {
  if (!temp) return null;

  const configs = {
    quente: { color: 'text-white bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]', icon: Flame, label: 'QUENTE' },
    morno: { color: 'text-brand-dark bg-gold-deep shadow-[0_0_10px_rgba(207,167,100,0.3)]', icon: Thermometer, label: 'MORNO' },
    frio: { color: 'text-white bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]', icon: Snowflake, label: 'FRIO' },
  };

  const { color, icon: Icon, label } = configs[temp];

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black tracking-widest", color)}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </div>
  );
};

const PipelineCard = React.memo(({
  lead,
  index,
  stageIndex,
  onEditLead,
  onOpenChat,
  canEditLeads,
  crmUsers
}: {
  lead: Lead;
  index: number;
  stageIndex: number;
  onEditLead: (lead: Lead) => void;
  onOpenChat: (leadId: string) => void;
  canEditLeads: boolean;
  crmUsers: UserProfile[];
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min((stageIndex * 0.02) + (index * 0.01), 0.5) }}
      draggable={canEditLeads}
      onDragStart={(e: any) => {
        e.dataTransfer.setData('leadId', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        console.log('[PIPELINE_DRAG_STARTED]', lead.id);
      }}
      onClick={() => onEditLead(lead)}
      className="bg-[#111214] p-3 rounded-xl border border-white/5 hover:border-gold-deep/20 transition-all cursor-grab active:cursor-grabbing group/card relative mb-2 hover:shadow-[0_0_20px_rgba(207,167,100,0.03)]"
    >
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <div className="min-w-0 flex-1">
            <h4 className="text-[10px] font-black text-white leading-tight group-hover/card:text-gold-deep transition-colors uppercase tracking-wide truncate">
              {lead.name}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <TemperatureBadge temp={lead.temperature} />
          {lead.iaActive !== false && (
            <Zap className="w-3 h-3 text-emerald-500" />
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-white/30">
            <Activity className="w-3 h-3 text-gold-deep" />
            <span className="text-[9px] font-bold">{maskPhone(lead.phone)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2.5 mt-0.5 border-t border-white/5">
          <div className="flex items-center gap-2">
            {(() => {
              const uid = lead.responsibleAgentId || lead.responsibleUserId || lead.ownerId;
              const user = uid ? crmUsers.find(u => (u.uid || (u as any).id) === uid) : undefined;
              const displayName = lead.responsibleAgentName || user?.name || user?.email || 'Sem agente';
              const initials = displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
              return (
                <>
                  <div className="w-6 h-6 rounded-full bg-gold-deep/10 border border-gold-deep/20 flex items-center justify-center overflow-hidden">
                    {user?.photoURL
                      ? <img src={user.photoURL} alt={displayName} className="w-full h-full object-cover" />
                      : <span className="text-[8px] font-black text-gold-deep">{initials}</span>
                    }
                  </div>
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest truncate max-w-[70px]">
                    {displayName}
                  </span>
                </>
              );
            })()}
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onOpenChat(lead.id); }}
            className="w-7 h-7 rounded-lg bg-white/5 text-white/20 hover:bg-gold-deep/10 hover:text-gold-deep transition-all flex items-center justify-center border border-white/5 shadow-inner"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

PipelineCard.displayName = 'PipelineCard';



export const SalesPipeline: React.FC<SalesPipelineProps> = React.memo(({ permissions, visualConfig, setActiveTab }) => {
  const EmptyColumn = React.useMemo(() => () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
      <div className="w-16 h-16 bg-white/[0.03] rounded-full flex items-center justify-center mb-4 border border-white/5">
        <PlusCircle className="w-8 h-8 text-white/10" />
      </div>
      <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Nenhum lead nesta etapa</p>
      <p className="text-[9px] font-bold text-white/10 uppercase tracking-widest">Arraste um lead para cá</p>
    </div>
  ), []);

  const PipelineStage = React.useMemo(() => ({ stage, stageLeads, sIdx, draggedLeadId, handleDragOver, handleDrop, onEditLead, onOpenChat, canEditLeads, crmUsers }: any) => {
    const { color, icon: Icon } = STAGE_CONFIG[stage] || STAGE_CONFIG['Novo Lead'];
    const Empty = EmptyColumn;
    return (
      <div 
        className={cn(
          "flex flex-col w-[80vw] sm:w-[280px] md:w-64 h-full group snap-center md:snap-align-none transition-opacity duration-300",
          draggedLeadId && "opacity-50"
        )}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, stage as LeadStatus)}
      >
        <div className="flex items-center justify-between mb-3.5 px-0.5">
          <div className="flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", color)}>
              <Icon className="w-3 h-3" />
            </div>
            <div className="flex flex-col">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-white leading-none">{stage}</h3>
              <span className="text-[8px] font-bold text-white/15 mt-0.5 uppercase tracking-tighter">
                {stageLeads.length} items
              </span>
            </div>
          </div>
        </div>

        <div className={cn(
          "flex-1 bg-white/[0.015] rounded-2xl p-2.5 flex flex-col border border-white/5 border-dashed transition-all duration-300 overflow-y-auto scrollbar-hide",
          draggedLeadId && "bg-white/[0.04] border-gold-deep/20 scale-[1.01]"
        )}>
          <AnimatePresence mode="popLayout">
            {stageLeads.map((lead: Lead, lIdx: number) => (
              <PipelineCard
                key={lead.id}
                lead={lead}
                index={lIdx}
                stageIndex={sIdx}
                onEditLead={onEditLead}
                onOpenChat={onOpenChat}
                canEditLeads={canEditLeads}
                crmUsers={crmUsers}
              />
            ))}
          </AnimatePresence>
          {stageLeads.length === 0 && <Empty />}
        </div>
      </div>
    );
  }, [EmptyColumn]);
  const { leads, loading: leadsLoading, setSelectedLeadId } = useLeads();
  const navigate = useNavigate();
  const viewport = useViewport();
  const [draggedLeadId, setDraggedLeadId] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [crmUsers, setCrmUsers] = React.useState<UserProfile[]>([]);

  React.useEffect(() => {
    DataService.list('users').then(users => setCrmUsers(users as UserProfile[])).catch(() => {});
  }, []);

  const initialRender = React.useRef(true);

  React.useEffect(() => {
    if (initialRender.current) {
      console.log('[PIPELINE_RENDER_START]');
      console.log('[PIPELINE_REALTIME_CONNECTED]');
      initialRender.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (leads.length > 0 && !initialRender.current) {
      // throttled logging
    }
  }, [leads]);

  const onStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      console.log('[PIPELINE_STATUS_UPDATED] Lead:', leadId, 'New Status:', newStatus);
      await DataService.update('lead', leadId, { status: newStatus });
    } catch (error) {
      console.error('Error updating lead status:', error);
    }
  };

  const onOpenChat = (leadId: string) => {
    setSelectedLeadId(leadId);
    if (setActiveTab) setActiveTab('chat');
  };

  const onEditLead = (lead: Lead) => {
    navigate('/leads/' + lead.id);
  };

  const groupedLeads = useMemo(() => {
    const groups = {} as Record<string, Lead[]>;
    STAGES.forEach(stage => {
      groups[stage] = leads.filter(l => (l.status || 'Novo Lead') === stage);
    });
    return groups;
  }, [leads]);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = React.useCallback((e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      onStatusChange(leadId, status);
    }
    setDraggedLeadId(null);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0B0D] text-white font-sans overflow-hidden">
      {/* HEADER */}
      <header className="px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between border-b border-white/5 bg-[#0B0B0D]/50 backdrop-blur-xl z-20">
        <div>
          <h1 className="text-base md:text-lg font-black tracking-tighter flex items-center gap-2 md:gap-2.5 uppercase">
             <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-gold-deep" />
             PIPELINE
          </h1>
          <div className="flex items-center gap-2 md:gap-2.5 mt-0.5">
            <p className="text-[7px] md:text-[8px] font-bold text-white/30 uppercase tracking-widest hidden sm:block">Gestão de funil</p>
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[7px] md:text-[8px] font-bold text-emerald-500/80 uppercase tracking-widest">Live</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-2.5">
          <button 
            onClick={handleRefresh}
            className={cn(
              "p-1.5 md:px-3 md:py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all font-black text-[9px] uppercase tracking-widest text-white/60",
              isRefreshing && "opacity-50 pointer-events-none"
            )}
          >
            <RefreshCcw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
          </button>
          <button 
            onClick={() => navigate('/leads/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-1.5 rounded-lg bg-gold-deep text-brand-dark hover:bg-gold-deep/90 transition-all font-black text-[9px] uppercase tracking-widest shadow-[0_0_15px_rgba(207,167,100,0.1)]"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Lead</span>
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="px-4 md:px-6 py-2 md:py-2 flex items-center justify-between border-b border-white/5 bg-[#0B0B0D]">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex items-center gap-2 group">
            <div className="flex flex-col">
              <span className="text-base md:text-lg font-black leading-none">{leads.length}</span>
              <span className="text-[7px] md:text-[8px] font-bold text-white/20 uppercase tracking-widest mt-0.5">Leads</span>
            </div>
          </div>
          
          <div className="h-4 md:h-5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-lg border border-white/5 max-w-[100px] md:max-w-none">
            <span className="px-2 text-[8px] md:text-[9px] font-bold text-white/30 uppercase tracking-widest">Responsáveis</span>
            <ChevronDown className="w-3 h-3 text-white/20" />
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <button className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 rounded-xl bg-white/5 border border-white/5 text-white/40 font-bold text-[10px] uppercase tracking-widest hover:text-white transition-all">
            <Filter className="w-3.5 h-3.5 md:w-4 md:h-4 text-gold-deep" />
            <span className="hidden sm:inline">Filtros</span>
          </button>
          
          <div className="flex items-center p-1 bg-white/5 rounded-xl border border-white/5">
            <button className="p-1.5 md:p-2 rounded-lg bg-gold-deep text-brand-dark shadow-lg">
              <LayoutGrid className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <button className="p-1.5 md:p-2 rounded-lg text-white/20 hover:text-white/60 transition-all">
              <List className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KANBAN BOARD */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-[#0B0B0D] scrollbar-hide snap-x snap-mandatory relative">
        {leadsLoading && leads.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#0B0B0D]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Carregando leads...</span>
            </div>
          </div>
        )}
        <div className="flex h-full p-3 md:p-4 gap-3 min-w-max">
          {STAGES.map((stage, sIdx) => (
            <PipelineStage
              key={stage}
              stage={stage}
              stageLeads={groupedLeads[stage] || []}
              sIdx={sIdx}
              draggedLeadId={draggedLeadId}
              handleDragOver={handleDragOver}
              handleDrop={handleDrop}
              onEditLead={onEditLead}
              onOpenChat={onOpenChat}
              canEditLeads={permissions.canWriteAllLeads}
              crmUsers={crmUsers}
            />
          ))}
        </div>
      </div>
      
      {/* FOOTER */}
      <footer className="px-8 py-3 bg-[#0B0B0D] border-t border-white/5 flex items-center justify-between z-20">
         <div className="flex items-center gap-6">
            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Prioridade:</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                <span className="text-[10px] font-bold text-white/40 uppercase">Quente</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gold-deep shadow-[0_0_8px_rgba(207,167,100,0.5)]" />
                <span className="text-[10px] font-bold text-white/40 uppercase">Morno</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                <span className="text-[10px] font-bold text-white/40 uppercase">Frio</span>
              </div>
            </div>
         </div>

         <div className="flex items-center gap-3 px-4 py-1.5 bg-gold-deep/5 rounded-xl border border-gold-deep/20">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-gold-deep animate-pulse" />
              <span className="text-[10px] font-black text-gold-deep uppercase tracking-widest">IA ATIVA</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-gold-deep/40" />
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">ON-LINE</span>
            </div>
         </div>
      </footer>
    </div>
  );
});

SalesPipeline.displayName = 'SalesPipeline';
