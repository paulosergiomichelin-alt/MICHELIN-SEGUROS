import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  Clock, 
  User as UserIcon, 
  Activity, 
  Globe, 
  Smartphone,
  ChevronDown,
  AlertTriangle,
  FileText,
  RefreshCw,
  Eye,
  ChevronRight,
  ChevronLeft,
  X,
  PlusCircle,
  Trash2,
  Bot,
  TrendingDown,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { orderBy, where } from '../../lib/queryConstraints';
import { DataService } from '../../services/DataService';
import { AuditLog } from '../../types';
import { PageHeader, Button } from '../../components/ui';

export const UserLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  
  // Pagination
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  const fetchLogs = useCallback(async (isMore = false) => {
    if (!isMore) setLoading(true);
    try {
      const constraints: any[] = [orderBy('timestamp', 'desc')];
      
      if (statusFilter !== 'all') {
        constraints.push(where('status', '==', statusFilter));
      }

      if (categoryFilter !== 'all') {
        constraints.push(where('category', '==', categoryFilter));
      }

      const result = await DataService.listPaginated(
        'audit_logs',
        constraints,
        PAGE_SIZE,
        isMore ? (lastVisible || undefined) : undefined
      );

      const formattedData = result.data.map(log => ({
        ...log,
        timestamp: log.timestamp?.toDate ? log.timestamp.toDate().toISOString() : log.timestamp
      }));

      if (isMore) {
        setLogs(prev => [...prev, ...formattedData]);
      } else {
        setLogs(formattedData);
      }
      
      setLastVisible(result.lastVisible);
      setHasMore(result.hasMore);
    } catch (error: any) {
      console.warn('[UserLogsView] Error fetching logs:', error);
      // DataService already handles and throws handleFirestoreError
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, lastVisible]);

  useEffect(() => {
    if (!loading || logs.length === 0) {
      const timeoutId = setTimeout(() => fetchLogs(), 0);
      return () => clearTimeout(timeoutId);
    }
  }, [statusFilter, fetchLogs, loading, logs.length]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.userName && log.userName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      log.userId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesOrigin = originFilter === 'all' || (log.origin || 'USUARIO') === originFilter;

    return matchesSearch && matchesOrigin;
  });

  const getStatusBadge = (action: string) => {
    if (action === 'DELETE') return 'border-[#C0392B]/20 text-[#C0392B] bg-[#FDE4E4] font-black';
    if (action === 'CREATE') return 'border-[#1F8A4C]/20 text-[#1F8A4C] bg-[#E4F5EA] font-black';
    if (action === 'UPDATE') return 'border-[#1B4D8F]/20 text-[#1B4D8F] bg-[#1B4D8F]/5 font-black';
    if (action.includes('DENIED')) return 'border-[#B8860B]/20 text-[#B8860B] bg-[#FFF3DC] font-black';
    return 'border-slate-200 text-slate-600 bg-slate-50 font-black';
  };

  const getActionIcon = (action: string) => {
    if (action === 'CREATE') return <PlusCircle className="w-4 h-4" />;
    if (action === 'DELETE') return <Trash2 className="w-4 h-4" />;
    if (action === 'UPDATE') return <RefreshCw className="w-4 h-4" />;
    if (action.includes('LOGIN')) return <UserIcon className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <PageHeader
          icon={ShieldAlert}
          title="Logs e Auditoria"
          subtitle="Michelin Seguros CRM Control Panel"
        />
        <Button
          variant="primary"
          icon={RefreshCw}
          onClick={() => fetchLogs()}
          disabled={loading}
          loading={loading}
        >
          Atualizar Dados
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-[#1B4D8F] transition-colors" />
          <input
            type="text"
            placeholder="Buscar por ação, entidade ou Usuário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-14 pr-6 py-5 bg-white border-2 border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-[#1B4D8F]/10 focus:border-[#1B4D8F]/60 text-sm font-bold text-slate-800 placeholder:text-slate-300 transition-all outline-none"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
            className="w-full pl-14 pr-12 py-5 bg-white border-2 border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-[#1B4D8F]/10 focus:border-[#1B4D8F]/60 text-sm font-bold text-slate-800 appearance-none transition-all outline-none cursor-pointer"
          >
            <option value="all">Todas as Origens</option>
            <option value="USUARIO">Usuário</option>
            <option value="ai">IA (Automático)</option>
          </select>
          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <Activity className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full pl-14 pr-12 py-5 bg-white border-2 border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-[#1B4D8F]/10 focus:border-[#1B4D8F]/60 text-sm font-bold text-slate-800 appearance-none transition-all outline-none cursor-pointer"
          >
            <option value="all">Todas Entidades</option>
            <option value="lead">Leads</option>
            <option value="user">Usuários</option>
            <option value="config">Configurações</option>
            <option value="follow_up">Follow-ups</option>
            <option value="notification">Notificações</option>
          </select>
          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-[3rem] border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Data / Hora</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Usuário</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ação / Entidade</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Origem</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Visualizar</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100">
              {loading && logs.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8">
                       <div className="h-4 bg-slate-100 rounded-full w-full"></div>
                    </td>
                  </tr>
                ))
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[12px] font-black text-slate-700">
                          {log.timestamp ? format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-[12px] font-black text-slate-700 truncate max-w-[150px]">
                            {log.userName || 'Sistema'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 group-hover:bg-[#1B4D8F] group-hover:border-[#1B4D8F] group-hover:text-white transition-colors">
                            {getActionIcon(log.action)}
                          </div>
                          <span className="text-[12px] font-black text-slate-800 uppercase tracking-tight">{log.action || 'AÇÃO'}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 ml-1">
                          <div className="w-1 h-1 bg-slate-300 rounded-full" />
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">{log.entity || 'SISTEMA'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border-2",
                        log.origin === 'ai' ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-slate-50 border-slate-200 text-slate-700"
                      )}>
                        {log.origin}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button
                         onClick={() => setSelectedLog(log)}
                         className="px-4 py-2 bg-white border-2 border-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F] transition-all shadow-sm active:scale-95 flex items-center gap-2"
                       >
                         <Eye className="w-3 h-3" />
                         Ver detalhes
                       </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-8 py-32 text-center">
                    <FileText className="w-20 h-20 text-slate-200 mx-auto mb-6" />
                    <p className="text-slate-500 text-lg font-black uppercase tracking-widest">Nenhum Registro Encontrado</p>
                    <p className="text-slate-400 text-sm mt-2">Os logs serão exibidos assim que houver atividade no sistema.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Load More */}
        {hasMore && (
          <div className="p-8 bg-slate-50 border-t-2 border-slate-100 text-center">
            <button
              onClick={() => fetchLogs(true)}
              disabled={loading}
              className="px-12 py-5 bg-[#1B4D8F] text-white rounded-[2rem] text-[11px] font-black uppercase tracking-[0.25em] hover:bg-[#153E73] active:scale-95 transition-all shadow-sm shadow-[#1B4D8F]/20 flex items-center justify-center gap-4 mx-auto disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <ChevronDown className="w-5 h-5 group-hover:translate-y-1 transition-transform" />
                  Carregar Mais Registros
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setSelectedLog(null)}
               className="absolute inset-0 bg-black/60 backdrop-blur-sm"
             />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl p-8 overflow-hidden border-2 border-slate-100 max-h-[90vh] overflow-y-auto"
              >
                 <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-6">
                    <div className="flex items-center gap-5">
                      <div className={cn("p-4 rounded-3xl border-2 shadow-sm", getStatusBadge(selectedLog.action))}>
                         {getActionIcon(selectedLog.action)}
                      </div>
                      <div>
                        <h3 className="text-2xl font-display font-black text-slate-900 uppercase tracking-tight leading-tight">{selectedLog.action}: {selectedLog.entity}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {format(new Date(selectedLog.timestamp), "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <button
                     onClick={() => setSelectedLog(null)}
                     className="p-3 hover:bg-slate-100 rounded-2xl transition-all active:scale-90"
                    >
                      <X className="w-6 h-6 text-slate-500" />
                    </button>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Responsável</p>
                       <div className="space-y-4">
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                             <UserIcon className="w-4 h-4 text-slate-500" />
                           </div>
                           <p className="text-[14px] font-black text-slate-800">{selectedLog.userName || 'Sistema'}</p>
                         </div>
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                              <ShieldAlert className="w-4 h-4 text-slate-400" />
                            </div>
                            <p className="text-[11px] font-bold text-slate-500 truncate">{selectedLog.userId}</p>
                         </div>
                       </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Origem da Ação</p>
                       <div className="space-y-4">
                         <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-xl flex items-center justify-center",
                              selectedLog.origin === 'ai' ? "bg-indigo-100" : "bg-slate-200"
                            )}>
                              {selectedLog.origin === 'ai' ? <Bot className="w-4 h-4 text-indigo-600" /> : <UserIcon className="w-4 h-4 text-slate-600" />}
                            </div>
                            <p className="text-[14px] font-black text-slate-800 uppercase tracking-widest">{selectedLog.origin}</p>
                         </div>
                         <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                              <Globe className="w-4 h-4 text-slate-400" />
                            </div>
                            <p className="text-[11px] font-bold text-slate-500">{selectedLog.ip || 'Interno'}</p>
                         </div>
                       </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Identificador do Registro</p>
                       <div className="space-y-4">
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                             <FileText className="w-4 h-4 text-slate-500" />
                           </div>
                           <p className="text-[14px] font-black text-slate-800 uppercase tracking-tight">{selectedLog.entity}</p>
                         </div>
                         {selectedLog.entityId && (
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-[10px] text-slate-400">ID</div>
                              <p className="text-[11px] font-bold text-slate-500 font-mono">{selectedLog.entityId}</p>
                           </div>
                         )}
                       </div>
                    </div>
                 </div>

                 {/* DIFF VIEW */}
                 <div className="space-y-6 mb-8">
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-slate-400" />
                       <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.3em]">Auditoria de Dados (Mudanças)</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <p className="text-[10px] font-black text-[#C0392B] uppercase flex items-center gap-2">
                             <TrendingDown className="w-3 h-3" /> ANTES
                          </p>
                          <div className="bg-slate-50 rounded-3xl p-6 border-2 border-slate-200">
                             <pre className="text-[12px] font-mono text-slate-600 overflow-x-auto leading-relaxed max-h-[300px]">
                               {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : "// NENHUM DADO ANTERIOR"}
                             </pre>
                          </div>
                       </div>

                       <div className="space-y-2">
                          <p className="text-[10px] font-black text-[#1F8A4C] uppercase flex items-center gap-2">
                             <TrendingUp className="w-3 h-3" /> DEPOIS
                          </p>
                          <div className="bg-slate-50 rounded-3xl p-6 border-2 border-slate-200">
                             <pre className="text-[12px] font-mono text-[#1F8A4C] overflow-x-auto leading-relaxed max-h-[300px]">
                               {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : "// NENHUM DADO NOVO"}
                             </pre>
                          </div>
                       </div>
                    </div>
                 </div>

                 {selectedLog.details && (
                    <div className="bg-[#FFF3DC] border border-[#B8860B]/20 p-6 rounded-3xl mb-8">
                        <div className="flex items-center gap-3 mb-2">
                           <AlertCircle className="w-5 h-5 text-[#B8860B]" />
                           <p className="text-[11px] font-black text-[#B8860B] uppercase tracking-widest">Observações Adicionais</p>
                        </div>
                        <p className="text-slate-700 font-medium text-sm leading-relaxed">{selectedLog.details}</p>
                    </div>
                 )}

                 <div className="flex justify-between items-center bg-slate-50 -mx-8 -mb-8 p-8 border-t border-slate-200">
                    <div className="flex items-center gap-3">
                       <div className="p-2 bg-white rounded-xl shadow-sm">
                          <ShieldAlert className="w-5 h-5 text-slate-400" />
                       </div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trilha de Auditoria Certificada</p>
                    </div>
                    <Button variant="primary" onClick={() => setSelectedLog(null)}>
                      Entendido
                    </Button>
                 </div>
              </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
