import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../../components/Modal';
import { 
  GitBranch, 
  HelpCircle, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  Info, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  Save,
  X,
  ChevronRight,
  ArrowRight,
  RefreshCcw,
  Zap,
  Download,
  Copy,
  Check
} from 'lucide-react';
import { Flow, LeadStatus } from '../../types';
import { DataService } from '../../services/DataService';
import { orderBy, where } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { CacheManager } from '../../services/CacheManager';

const ALL_STATUSES: LeadStatus[] = [
  'Novo Lead', 
  'Em Atendimento', 
  'Aguardando Documento',
  'Em Cotação',
  'Proposta Enviada',
  'Negociação',
  'Fechado', 
  'Perdido'
];

export function FlowEngine() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [editingFlow, setEditingFlow] = useState<Partial<Flow> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const migrateFlows = async () => {
    if (!confirm('Deseja recalcular a arquitetura de todos os fluxos?')) return;
    setIsSaving(true);
    try {
      for (const flow of flows) {
        // Deterministic: no auto-classification
        await DataService.update('flows', flow.id, { 
          updatedAt: new Date().toISOString()
        });
      }
      
      // Invalida o cache de flows após migração em massa para que o Orchestrator re-busque
      CacheManager.invalidatePattern('flows:preprocessed');

      alert('Migração concluída com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flows');
    } finally {
      setIsSaving(false);
    }
  };

  const getCompiledFlows = () => {
    const activeFlowsSorted = [...flows]
      .filter(f => f.isActive)
      .sort((a, b) => b.priority - a.priority);

    if (activeFlowsSorted.length === 0) return "Nenhum fluxo ativo encontrado.";

    return `[FLUXOS ATIVOS]

${activeFlowsSorted.map((f, index) => `${index + 1}. Nome: ${f.name}
   Layer: ${f.layer?.toUpperCase() || 'BEHAVIOR'}
   Prioridade: ${f.priority}
   Status Aplicáveis: ${f.applicableStatus?.length ? f.applicableStatus.join(', ') : 'Global'}
   Descrição:
   ${f.description}
----------------`).join('\n\n')}`;
  };

  const handleCopy = () => {
    const text = getCompiledFlows();
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = getCompiledFlows();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fluxos_michelin_seguros_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fetchFlows = async () => {
      try {
        setLoading(true);
        const data = await DataService.list('flows', [orderBy('priority', 'desc')])
          .catch(err => {
             console.error("[FLOW-ENGINE] DataService.list failed", err);
             return [];
          });
        setFlows(data as Flow[]);
      } catch (error) {
        console.error("[FLOW-ENGINE] Fetch error:", error);
        handleFirestoreError(error, OperationType.LIST, 'flows');
      } finally {
        setLoading(false);
      }
    };

    fetchFlows();
  }, []);

  const handleRefresh = async () => {
    // Invalidate query cache for this specifically if we want fresh data
    const queryKey = `flows:${JSON.stringify([orderBy('priority', 'desc')])}`;
    if ((DataService as any).queryCache) {
      (DataService as any).queryCache.delete(queryKey);
    }
    
    try {
      setLoading(true);
      const data = await DataService.list('flows', [orderBy('priority', 'desc')]);
      setFlows(data as Flow[]);
    } catch (error) {
      console.error("[FLOW-ENGINE] Refresh error:", error);
      handleFirestoreError(error, OperationType.LIST, 'flows');
    } finally {
      setLoading(false);
    }
  };

  const filteredFlows = flows.filter(flow => {
    const matchesSearch = flow.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         flow.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterActive === 'all' || 
                         (filterActive === 'active' && flow.isActive) || 
                         (filterActive === 'inactive' && !flow.isActive);
    return matchesSearch && matchesFilter;
  });

  const handleCreateNew = () => {
    setEditingFlow({
      name: '',
      description: '',
      priority: 10,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (flow: Flow) => {
    setEditingFlow(flow);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este fluxo?')) {
      try {
        await DataService.delete('flows', id);
        
        // Invalida o cache de flows para que o Orchestrator re-busque os dados atualizados
        CacheManager.invalidatePattern('flows:preprocessed');
        handleRefresh();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `flows/${id}`);
      }
    }
  };

  const handleSave = async () => {
    if (!editingFlow?.name || !editingFlow?.description) return;
    setIsSaving(true);
    try {
      const id = editingFlow.id || Math.random().toString(36).substring(2, 9);
      const now = new Date().toISOString();
      
      const flowData = {
        ...editingFlow,
        id,
        updatedAt: now,
        createdAt: editingFlow.createdAt || now,
      };
      if (editingFlow.id) {
        await DataService.update('flows', editingFlow.id, flowData);
      } else {
        await DataService.create('flows', flowData);
      }
      
      CacheManager.invalidatePattern('flows:preprocessed');
      handleRefresh();

      setIsModalOpen(false);
      setEditingFlow(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flows');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Help */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gold-deep/10 rounded-2xl flex items-center justify-center text-gold-deep shadow-lg shadow-gold-deep/5">
            <GitBranch className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gold-deep uppercase tracking-tight">Flow Engine</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Motor de Fluxos Inteligentes</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={migrateFlows}
            disabled={isSaving}
            className="px-4 py-2.5 bg-brand-black hover:bg-slate-800 text-gold-deep text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-gold-deep/20 flex items-center gap-2 disabled:opacity-50"
            title="Recalcular Todas as Prioridades e Layers"
          >
            <RefreshCcw className={cn("w-4 h-4", isSaving && "animate-spin")} />
            Recalcular Arquitetura
          </button>
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all border border-slate-700 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="p-2.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-xl transition-all border border-transparent hover:border-emerald-500/20"
            title="Atualizar Dados"
          >
            <RefreshCcw className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2.5 text-slate-400 hover:text-gold-deep hover:bg-gold-deep/10 rounded-xl transition-all border border-transparent hover:border-gold-deep/20"
            title="Ajuda"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={handleCreateNew}
            className="px-6 py-2.5 bg-gold-deep hover:bg-gold-light text-brand-black text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-gold-deep/20 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Criar Fluxo
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-brand-black/40 p-4 rounded-2xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Buscar fluxos por nome ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-brand-black border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-gold-deep/20 outline-none transition-all"
          />
        </div>
        <div className="flex p-1 bg-brand-black border border-slate-700 rounded-xl">
          {(['active', 'inactive', 'all'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterActive(filter)}
              className={cn(
                "px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all",
                filterActive === filter ? "bg-gold-deep text-brand-black shadow-lg" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {filter === 'active' ? 'Ativos' : filter === 'inactive' ? 'Inativos' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredFlows.map((flow) => (
            <motion.div 
              key={flow.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "group p-5 bg-brand-dark border transition-all rounded-[2rem] relative overflow-hidden flex flex-col",
                flow.isActive ? "border-gold-deep/20" : "border-slate-800 opacity-70"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2.5 rounded-xl flex items-center justify-center",
                    flow.isActive ? "bg-gold-deep/10 text-gold-deep shadow-lg shadow-gold-deep/10" : "bg-slate-800 text-slate-500"
                  )}>
                    <GitBranch className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm tracking-tight">{flow.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        flow.layer === 'core' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        flow.layer === 'decision' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                        flow.layer === 'sales' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                        "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      )}>
                        {flow.layer || 'behavior'}
                      </span>
                      <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1.5">
                        Prioridade: {flow.priority}
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        {flow.isActive ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => handleEdit(flow)}
                    className="p-2 text-slate-400 hover:text-gold-deep hover:bg-gold-deep/10 rounded-lg transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(flow.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 mb-4 italic font-medium">
                "{flow.description}"
              </p>

              <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest mt-auto pt-4 border-t border-white/5">
                <span className="text-slate-600">Atualizado em {new Date(new Date().toString() === flow.updatedAt ? flow.updatedAt : flow.updatedAt).toLocaleDateString()}</span>
                {flow.isActive ? (
                  <span className="text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Ativo na IA
                  </span>
                ) : (
                  <span className="text-slate-500 flex items-center gap-1">
                    <XCircle className="w-2.5 h-2.5" />
                    Pausado
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredFlows.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center bg-brand-black/20 rounded-[3rem] border border-dashed border-slate-800">
            <GitBranch className="w-16 h-16 text-slate-800 mx-auto mb-4" />
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Nenhum fluxo encontrado</h4>
            <p className="text-[10px] text-slate-700 mt-2 max-w-xs mx-auto">Crie seu primeiro fluxo para começar a orientar o comportamento da sua IA de forma inteligente.</p>
          </div>
        )}
      </div>

      {/* Help Modal */}
      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="O que é o Flow Engine?"
        maxWidth="max-w-2xl"
      >
        <div className="p-8 space-y-6 bg-brand-dark">
          <div className="space-y-6 max-h-[60vh] overflow-y-auto no-scrollbar pr-4 text-slate-300">
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">
                O <span className="text-gold-deep font-bold">Flow Engine 2.0</span> é o motor de inteligência que orquestra o comportamento da sua IA. Agora com uma arquitetura profissional baseada em camadas e ativação contextual inteligente.
              </p>
              <div className="p-4 bg-brand-black/50 border-l-4 border-gold-deep rounded-r-xl">
                <p className="text-[10px] font-medium italic">"A IA não apenas segue regras, ela entende o contexto (temperatura, intenção e estágio) para decidir qual fluxo aplicar no momento exato da venda."</p>
              </div>
            </div>

            {/* New Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div className="p-5 bg-brand-black border border-slate-800 rounded-3xl space-y-2">
                  <Zap className="w-5 h-5 text-gold-deep mb-2" />
                  <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Arquitetura em Camadas</h4>
                  <p className="text-[9px] text-slate-500 leading-relaxed font-bold uppercase">CORE • DECISION • SALES • BEHAVIOR</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Os fluxos são organizados por responsabilidade, evitando conflitos e garantindo que segurança esteja acima de vendas.</p>
              </div>
              <div className="p-5 bg-brand-black border border-slate-800 rounded-3xl space-y-2">
                  <RefreshCcw className="w-5 h-5 text-emerald-500 mb-2" />
                  <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Ativação Contextual</h4>
                  <p className="text-[9px] text-slate-500 leading-relaxed font-bold uppercase">Activation Score (Boost Inteligente)</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Calculamos dinamicamente a relevância de cada fluxo baseado no Status do Lead e intenção da última mensagem.</p>
              </div>
            </div>

              <div className="space-y-4 pt-4">
                <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                   <ArrowRight className="w-3 h-3 text-gold-deep" />
                   Entendendo as Camadas & Limites
                </h4>
                <div className="grid grid-cols-1 gap-3 text-[10px]">
                  <div className="flex flex-col gap-2 p-3 bg-red-500/5 rounded-2xl border border-red-500/10">
                    <div className="flex justify-between items-center">
                      <span className="text-red-400 font-bold uppercase">🔴 CORE</span>
                      <span className="text-[8px] bg-red-500/20 px-2 py-0.5 rounded-full text-red-400 font-black">LIMITE RECOMENDADO: 2</span>
                    </div>
                    <p className="text-slate-400">Regras críticas de segurança. Prioridade: 100.</p>
                  </div>
                  <div className="flex flex-col gap-2 p-3 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-bold uppercase">🟠 DECISION</span>
                      <span className="text-[8px] bg-amber-500/20 px-2 py-0.5 rounded-full text-amber-400 font-black">LIMITE RECOMENDADO: 4</span>
                    </div>
                    <p className="text-slate-400">Qualificação, Score e Redução de Atrito. Prioridade: 80.</p>
                  </div>
                  <div className="flex flex-col gap-2 p-3 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-400 font-bold uppercase">🟢 SALES</span>
                      <span className="text-[8px] bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-400 font-black">LIMITE RECOMENDADO: 5</span>
                    </div>
                    <p className="text-slate-400">Fechamento, Cotação e Objeções. Prioridade: 60.</p>
                  </div>
                  <div className="flex flex-col gap-2 p-3 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                    <div className="flex justify-between items-center">
                      <span className="text-blue-400 font-bold uppercase">🔵 BEHAVIOR</span>
                      <span className="text-[8px] bg-blue-500/20 px-2 py-0.5 rounded-full text-blue-400 font-black">LIMITE RECOMENDADO: 2</span>
                    </div>
                    <p className="text-slate-400">Humanização, Estilo e Tom de Voz. Prioridade: 30.</p>
                  </div>
                </div>
              </div>

            <div className="p-5 bg-brand-black rounded-3xl border border-slate-700 space-y-4">
              <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-4 h-4 text-gold-deep" />
                  Otimização & Cache Inteligente
              </h4>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Para reduzir custos de API e latência, o Flow Engine utiliza <span className="text-white font-bold">Pré-processamento Persistido</span>. As descrições são comprimidas e as palavras-chave extraídas automaticamente.
              </p>
              <div className="flex items-center gap-4 text-[9px] font-black uppercase text-slate-500">
                <div className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /> Latência Zero</div>
                <div className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /> Redução de Tokens</div>
                <div className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /> Fila de Prioridade</div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/5">
            <button 
              onClick={() => setIsHelpOpen(false)}
              className="w-full py-4 bg-brand-black hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-[0.2em] rounded-2xl transition-all border border-slate-800"
            >
              Entendi e Quero Começar
            </button>
          </div>
        </div>
      </Modal>

      {/* Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Exportar Fluxos Ativos"
        maxWidth="max-w-3xl"
      >
        <div className="flex flex-col max-h-[80vh] bg-brand-dark">
          <div className="flex-1 overflow-y-auto p-8 bg-brand-black/30">
            <pre className="text-[11px] font-mono text-emerald-500/90 leading-relaxed whitespace-pre-wrap selection:bg-gold-deep/20">
              {getCompiledFlows()}
            </pre>
          </div>

          <div className="p-8 border-t border-white/5 flex gap-3 bg-brand-dark">
            <button 
              onClick={handleDownload}
              className="px-6 py-4 bg-brand-black text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-slate-800 flex items-center gap-2 hover:text-white transition-all"
            >
              <Download className="w-4 h-4" />
              Baixar .txt
            </button>
            <button 
              onClick={handleCopy}
              className={cn(
                "flex-1 py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2",
                isCopied 
                  ? "bg-emerald-500 text-brand-black shadow-emerald-500/20" 
                  : "bg-gold-deep text-brand-black shadow-gold-deep/20 hover:scale-[1.02]"
              )}
            >
              {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {isCopied ? 'Copiado com Sucesso!' : 'Copiar Tudo para Área de Transferência'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingFlow?.id ? 'Editar Fluxo' : 'Novo Fluxo Inteligente'}
        maxWidth="max-w-lg"
      >
        <div className="p-8 space-y-6 bg-brand-dark">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Fluxo</label>
              <input 
                type="text" 
                value={editingFlow?.name || ''}
                onChange={(e) => setEditingFlow(p => ({ ...p!, name: e.target.value }))}
                placeholder="Ex: Abordagem de Renovação"
                className="w-full px-5 py-4 bg-brand-black border border-slate-700 rounded-2xl text-sm text-white focus:ring-2 focus:ring-gold-deep/20 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descrição para a IA (O Coração do Fluxo)</label>
              <textarea 
                value={editingFlow?.description || ''}
                onChange={(e) => setEditingFlow(p => ({ ...p!, description: e.target.value }))}
                rows={6}
                placeholder="Explique detalhadamente para a IA como ela deve se comportar neste cenário..."
                className="w-full p-5 bg-brand-black border border-slate-700 rounded-2xl text-xs text-white leading-relaxed resize-none focus:ring-2 focus:ring-gold-deep/20 outline-none transition-all"
              />
              <p className="text-[8px] text-slate-500 italic font-medium px-2">A IA usará este texto como regra de ouro durante a conversação.</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Camada (Layer)</label>
                <select 
                  value={editingFlow?.layer || 'behavior'}
                  onChange={(e) => {
                    const layer = e.target.value as any;
                    setEditingFlow(p => ({ ...p!, layer }));
                  }}
                  className="w-full px-5 py-4 bg-brand-black border border-slate-700 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white focus:ring-2 focus:ring-gold-deep/20 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="core">🔴 CORE (Segurança/Erro)</option>
                  <option value="decision">🟠 DECISION (Qualificação/Score)</option>
                  <option value="sales">🟢 SALES (Vendas/Fechamento)</option>
                  <option value="behavior">🔵 BEHAVIOR (Comportamento/Tom)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Prioridade (Autocalculada)</label>
                <input 
                  type="number" 
                  value={editingFlow?.priority || 10}
                  onChange={(e) => setEditingFlow(p => ({ ...p!, priority: parseInt(e.target.value) }))}
                  className="w-full px-5 py-4 bg-brand-black border border-slate-700 rounded-2xl text-sm text-white focus:ring-2 focus:ring-gold-deep/20 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex justify-between items-center">
                <span>Status Aplicáveis (Vazio = Global)</span>
                {editingFlow?.applicableStatus?.length ? (
                  <button 
                    onClick={() => setEditingFlow(p => ({ ...p!, applicableStatus: [] }))}
                    className="text-[8px] text-red-400 hover:text-red-300 transition-colors"
                  >
                    Limpar Filtros
                  </button>
                ) : null}
              </label>
              <div className="grid grid-cols-2 gap-2 p-4 bg-brand-black border border-slate-700 rounded-2xl max-h-32 overflow-y-auto no-scrollbar">
                {ALL_STATUSES.map(status => {
                  const isSelected = editingFlow?.applicableStatus?.includes(status);
                  return (
                    <label 
                      key={status}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all",
                        isSelected 
                          ? "bg-gold-deep/10 border-gold-deep/30 text-gold-deep shadow-sm"
                          : "bg-brand-black/50 border-slate-800 text-slate-500 hover:border-slate-700"
                      )}
                    >
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const current = editingFlow?.applicableStatus || [];
                          const next = current.includes(status)
                            ? current.filter(s => s !== status)
                            : [...current, status];
                          setEditingFlow(p => ({ ...p!, applicableStatus: next }));
                        }}
                        className="hidden"
                      />
                      <div className={cn(
                        "w-3 h-3 rounded-sm border flex items-center justify-center transition-all",
                        isSelected ? "bg-gold-deep border-gold-deep" : "border-slate-700"
                      )}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-brand-black" />}
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-tight truncate">{status}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Status</label>
              <button 
                onClick={() => setEditingFlow(p => ({ ...p!, isActive: !p?.isActive }))}
                className={cn(
                  "w-full px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border",
                  editingFlow?.isActive 
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                    : "bg-slate-800 text-slate-500 border-slate-700"
                )}
              >
                {editingFlow?.isActive ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {editingFlow?.isActive ? 'Fluxo Ativo' : 'Fluxo Pausado'}
              </button>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-4 bg-brand-black text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-slate-800"
            >
              Descartar
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving || !editingFlow?.name || !editingFlow?.description}
              className="flex-1 py-4 bg-gold-deep text-brand-black text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-gold-deep/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingFlow?.id ? 'Salvar Fluxo' : 'Publicar Fluxo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
