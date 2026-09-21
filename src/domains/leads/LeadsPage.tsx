import React from 'react';
import { 
  Users, 
  MessageSquare, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  PlusCircle, 
  Search, 
  Trash2, 
  Upload, 
  Download,
  Edit2, 
  ChevronRight, 
  CheckCircle2, 
  Lock, 
  Clock, 
  FileSearch, 
  Send, 
  Sparkles,
  Bot,
  Zap,
  ZapOff,
  RefreshCcw,
  AlertCircle,
  BarChart3,
  Flame,
  Filter
} from 'lucide-react';
import { Lead, LeadStatus, Permissions, UserProfile } from '../../types';
import { cn, maskCPF, maskPhone } from '../../lib/utils';
import { motion } from 'motion/react';
import { StatusBadge } from '../../components/StatusBadge';
import { SensitiveContent } from '../../components/SensitiveContent';
import { useDebounce } from '../../hooks/useDebounce';
import { LeadRowSkeleton, LeadSkeleton } from '../../components/Skeleton';
import { useLeads } from '../../contexts/LeadRealtimeContext';
import { DataService } from '../../services/DataService';
import { LeadForm } from './LeadForm';
import { ContactImport } from './ContactImport';
import { Modal } from '../../components/Modal';

import { LeadsView } from './LeadsView';
import { useNavigate } from 'react-router-dom';

export const LeadsPage = React.memo(({
  permissions,
  visualConfig,
  setActiveTab
}: {
  permissions: Permissions;
  visualConfig: any;
  setActiveTab: (tab: any) => void;
}) => {
  const navigate = useNavigate();
  const { leads, loading: leadsLoading, setSelectedLeadId, hasMore: hasMoreLeads, loadMoreLeads } = useLeads();
  const [searchLeads, setSearchLeads] = React.useState('');
  const [showAddLead, setShowAddLead] = React.useState(false);
  const [editingLead, setEditingLead] = React.useState<Lead | null>(null);
  const [showImport, setShowImport] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = React.useState<Set<string>>(new Set());
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [deleteProgress, setDeleteProgress] = React.useState({ done: 0, total: 0 });

  const [crmUsers, setCrmUsers] = React.useState<UserProfile[]>([]);

  React.useEffect(() => {
    DataService.list('users').then(users => {
      setCrmUsers(users as UserProfile[]);
    });
  }, []);

  const handleDeleteLead = async (id: string) => {
    if (window.confirm('Excluir este lead?')) {
      await DataService.delete('lead', id);
    }
  };

  const toggleLeadSelected = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedLeadIds(new Set());
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedLeadIds);
    setIsBulkDeleting(true);
    setDeleteProgress({ done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i++) {
        await DataService.delete('lead', ids[i]);
        setDeleteProgress({ done: i + 1, total: ids.length });
      }
      setShowDeleteSelectedConfirm(false);
      exitSelectionMode();
    } finally {
      setIsBulkDeleting(false);
      setDeleteProgress({ done: 0, total: 0 });
    }
  };

  const handleImportLeads = async (importedLeads: Lead[]) => {
    setIsImporting(true);
    try {
      for (const lead of importedLeads) {
        await DataService.create('lead', lead);
      }
      setShowImport(false);
      alert('Importação concluída com sucesso!');
    } catch (error) {
      console.error('Import error:', error);
      alert('Erro ao importar leads.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveLead = async (lead: Lead, options?: { silent?: boolean }) => {
    try {
      if (editingLead || (lead.id && leads.find(l => l.id === lead.id))) {
        await DataService.update('lead', lead.id, lead);
      } else {
        await DataService.create('lead', lead);
      }
      
      if (!options?.silent) {
        setShowAddLead(false);
        setEditingLead(null);
      }
    } catch (error) {
      console.error('Error saving lead:', error);
    }
  };

  const handleEditLead = (lead: Lead) => {
    navigate('/leads/' + lead.id);
  };

  const handleExportLeads = () => {
    try {
      const headers = ['Nome', 'Telefone', 'Telefone 2', 'CPF', 'Placa', 'Chassi', 'Status', 'Temperatura', 'Score', 'IA Ativa'];
      const rows = leads.map(l => [
        l.name,
        l.phone,
        l.phone2 || '',
        l.cpf,
        l.plate || '',
        l.chassis || '',
        l.status,
        l.temperature || '',
        l.score || '',
        l.iaActive !== false ? 'Sim' : 'Não'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `leads_michelin_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // F-24 da auditoria: URL de blob nunca era liberada
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const stats = React.useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    return {
      total: leads.length,
      quente: leads.filter(l => l.temperature === 'quente').length,
      novosHoje: leads.filter(l => l.createdAt.startsWith(today)).length,
      emAtendimento: leads.filter(l => l.status === 'Em Atendimento').length,
      conversao: leads.length > 0 ? Math.round((leads.filter(l => l.status === 'Fechado').length / leads.length) * 100) : 0
    };
  }, [leads]);

  const [filters, setFilters] = React.useState({
    status: [] as LeadStatus[],
    temperature: [] as string[],
    origin: [] as string[],
    responsible: [] as string[],
    startDate: '',
    endDate: ''
  });

  const filteredLeads = React.useMemo(() => {
    // Exclude leads already converted to clients
    let result = leads.filter(l => !l.clienteId);

    // Search filter
    if (searchLeads) {
      const query = searchLeads.toLowerCase();
      result = result.filter(l => 
        l.name.toLowerCase().includes(query) ||
        l.phone.includes(query) ||
        (l.cpf && l.cpf.includes(query)) ||
        (l.plate && l.plate.toLowerCase().includes(query))
      );
    }

    // Advanced filters
    if (filters.status.length > 0) result = result.filter(l => filters.status.includes(l.status));
    if (filters.temperature.length > 0) result = result.filter(l => filters.temperature.includes(l.temperature || 'frio'));
    if (filters.origin.length > 0) result = result.filter(l => filters.origin.includes(l.origin || ''));
    if (filters.responsible.length > 0) result = result.filter(l => filters.responsible.includes(l.responsibleAgentId || ''));
    
    if (filters.startDate) result = result.filter(l => l.createdAt >= filters.startDate);
    if (filters.endDate) result = result.filter(l => l.createdAt <= filters.endDate);

    return result;
  }, [leads, searchLeads, filters]);

  return (
    <>
      <LeadsView 
        leads={filteredLeads}
        crmUsers={crmUsers}
        totalLeads={leads.length}
        searchLeads={searchLeads}
        setSearchLeads={setSearchLeads}
        filters={filters}
        setFilters={setFilters}
        permissions={permissions}
        handleEditLead={handleEditLead}
        handleDeleteLead={handleDeleteLead}
        setActiveTab={setActiveTab}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        selectedLeadIds={selectedLeadIds}
        toggleLeadSelected={toggleLeadSelected}
        exitSelectionMode={exitSelectionMode}
        setShowDeleteSelectedConfirm={setShowDeleteSelectedConfirm}
        setShowImport={setShowImport}
        setShowAddLead={(show) => { if (show) navigate('/leads/new'); }}
        isImporting={isImporting}
        loadMoreLeads={loadMoreLeads}
        hasMoreLeads={hasMoreLeads}
        leadsLoading={leadsLoading}
        stats={stats}
        handleRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        handleExportLeads={handleExportLeads}
      />

      {/* MODALS */}
      {showImport && (
        <Modal 
          isOpen={showImport} 
          onClose={() => setShowImport(false)}
          title="Importar Leads"
        >
          <ContactImport 
            onImport={handleImportLeads}
            onCancel={() => setShowImport(false)}
            isImporting={isImporting}
          />
        </Modal>
      )}

      {showDeleteSelectedConfirm && (
        <Modal
          isOpen={showDeleteSelectedConfirm}
          onClose={() => { if (!isBulkDeleting) setShowDeleteSelectedConfirm(false); }}
          title="Confirmar Exclusão"
        >
          <div className="space-y-4 p-4">
            <div className="p-4 bg-[#FDE4E4] border border-[#C0392B]/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#C0392B] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#C0392B] uppercase tracking-tight">ATENÇÃO: Ação irreversível!</p>
                <p className="text-xs text-slate-500 mt-1">
                  Isso apagará permanentemente {selectedLeadIds.size} lead{selectedLeadIds.size === 1 ? '' : 's'} selecionado{selectedLeadIds.size === 1 ? '' : 's'}.
                </p>
              </div>
            </div>

            {isBulkDeleting && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                  <span className="text-slate-500">Excluindo {deleteProgress.done} de {deleteProgress.total}...</span>
                  <span className="text-[#C0392B]">
                    {deleteProgress.total > 0 ? Math.round((deleteProgress.done / deleteProgress.total) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C0392B] transition-all duration-200 ease-out"
                    style={{ width: `${deleteProgress.total > 0 ? (deleteProgress.done / deleteProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDeleteSelectedConfirm(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-slate-700 transition-colors disabled:opacity-30"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={isBulkDeleting}
                className="px-6 py-2 bg-[#C0392B] text-white rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-sm shadow-[#C0392B]/20 disabled:opacity-50"
              >
                {isBulkDeleting ? `Excluindo... ${deleteProgress.total > 0 ? Math.round((deleteProgress.done / deleteProgress.total) * 100) : 0}%` : `Sim, Excluir ${selectedLeadIds.size}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
});

LeadsView.displayName = 'LeadsView';
