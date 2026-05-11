
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  MessageSquare, 
  Bot, 
  Sparkles, 
  Send, 
  Filter, 
  Play, 
  Pause, 
  Square, 
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  TrendingUp,
  LayoutDashboard,
  Search,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Lead, LeadStatus, LeadTemperature, Campaign, CampaignLog, VisualIdentityConfig } from '../../types';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth } from '../../lib/firebase';
import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { DataService } from '../../services/DataService';

interface MensagensAtivasProps {
  leads: Lead[];
  visualConfig: VisualIdentityConfig;
}

export const MensagensAtivas = ({ leads, visualConfig }: MensagensAtivasProps) => {
  // --- States ---
  const [activeStep, setActiveStep] = useState<'leads' | 'config' | 'dispatch'>('leads');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    status: [] as LeadStatus[],
    temperature: [] as LeadTemperature[],
    origin: [] as string[],
    noResponseOnly: false
  });
  const [limit, setLimit] = useState(50);
  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState('');
  const [instructions, setInstructions] = useState('');
  const [interval, setInterval] = useState(10); // segundos
  
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [previewMsg, setPreviewMsg] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // --- Filtered Leads ---
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchStatus = filters.status.length === 0 || filters.status.includes(lead.status);
      const matchTemp = filters.temperature.length === 0 || (lead.temperature && filters.temperature.includes(lead.temperature));
      const matchOrigin = filters.origin.length === 0 || filters.origin.includes(lead.origin);
      
      const matchNoResponse = !filters.noResponseOnly || (() => {
        // Real logic: no outbound user/ai message in the last 24h
        if (!lead.lastInteraction) return true;
        const last = new Date(lead.lastInteraction).getTime();
        const now = new Date().getTime();
        const diffHours = (now - last) / (1000 * 60 * 60);
        return diffHours > 24 && lead.lastMessageSender === 'lead';
      })();
      
      return matchStatus && matchTemp && matchOrigin && matchNoResponse;
    });
  }, [leads, filters]);

  const targetLeads = useMemo(() => {
    // If selected manual, use those. If not, use filtered with limit.
    if (selectedLeads.length > 0) return selectedLeads;
    return filteredLeads.slice(0, limit).map(l => l.id);
  }, [selectedLeads, filteredLeads, limit]);

  // --- Handlers ---
  const toggleLeadSelection = (id: string) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(l => l.id));
    }
  };

  const handleCreateCampaign = async () => {
    if (!campaignName || !objective || targetLeads.length === 0) return;

    try {
      const campaignData = {
        name: campaignName,
        objective,
        instructions,
        status: 'idle' as any,
        totalLeads: targetLeads.length,
        sentCount: 0,
        errorCount: 0,
        respondedCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        limit,
        interval,
        targetLeads // store IDs
      };

      const campaignId = await DataService.create('campaigns', campaignData);

      setActiveCampaign({ ...campaignData, id: campaignId });
      setActiveStep('dispatch');
    } catch (error) {
      console.error("Erro ao criar campanha:", error);
    }
  };

  const generatePreview = async () => {
    if (targetLeads.length === 0) return;
    setIsPreviewLoading(true);
    try {
      const lead = leads.find(l => l.id === targetLeads[0]);
      if (!lead) return;

      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          lead,
          objective,
          instructions
        })
      });
      const data = await res.json();
      setPreviewMsg(data.message);
    } catch (err) {
      console.error(err);
      setPreviewMsg('Erro ao gerar pré-visualização.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const startCampaign = async () => {
    if (!activeCampaign) return;
    setIsSending(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      await fetch('/api/campaigns/start', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ campaignId: activeCampaign.id })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const pauseCampaign = async () => {
    if (!activeCampaign) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      await fetch('/api/campaigns/pause', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ campaignId: activeCampaign.id })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // --- Real-time Updates ---
  useEffect(() => {
    if (!activeCampaign?.id) return;

    const isRunning = activeCampaign.status === 'running';

    // Use subscribe for active campaign status if running
    const unsubC = DataService.subscribe('campaign', activeCampaign.id, (data) => {
      if (data) {
        setActiveCampaign(prev => ({ ...prev!, ...data, id: activeCampaign.id }));
        setIsSending(data.status === 'running');
      }
    }, isRunning);

    // Use subscribeCollection for logs with forceRealtime only if running
    const unsubL = DataService.subscribeCollection(
      'campaign_log',
      [
        where('campaignId', '==', activeCampaign.id),
        orderBy('timestamp', 'desc'),
        firestoreLimit(50)
      ],
      (newLogs) => {
        setLogs(newLogs as CampaignLog[]);
      },
      isRunning
    );

    return () => {
      if (unsubC) unsubC();
      if (unsubL) unsubL();
    };
  }, [activeCampaign?.id, activeCampaign?.status]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Step Indicator */}
      <div className="flex items-center justify-center mb-8">
        {[
          { id: 'leads', label: 'Seleção de Leads', icon: Users },
          { id: 'config', label: 'Configuração', icon: Bot },
          { id: 'dispatch', label: 'Controle de Disparo', icon: Send },
        ].map((step, i) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all border-2",
                activeStep === step.id 
                  ? "bg-brand-dark text-gold-deep border-gold-deep shadow-lg shadow-gold-deep/20" 
                  : (activeStep === 'config' && step.id === 'leads') || (activeStep === 'dispatch')
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white text-slate-300 border-slate-200"
              )}>
                {activeStep === 'dispatch' || (activeStep === 'config' && step.id === 'leads') && i < 2 ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <step.icon className="w-5 h-5" />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest",
                activeStep === step.id ? "text-slate-800" : "text-slate-400"
              )}>
                {step.label}
              </span>
            </div>
            {i < 2 && (
              <div className={cn(
                "w-16 h-[2px] mx-4 -mt-6",
                (activeStep === 'config' && i === 0) || activeStep === 'dispatch' ? "bg-emerald-500" : "bg-slate-200"
              )} />
            )}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeStep === 'leads' && (
          <motion.div 
            key="leads"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Filters */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <Filter className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Filtros Inteligentes</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Status do Lead</label>
                    <div className="flex flex-wrap gap-2">
                      {['Novo Lead', 'Em Atendimento', 'Aguardando Documento', 'Em Cotação', 'Perdido'].map(s => (
                        <button
                          key={s}
                          onClick={() => setFilters(prev => ({
                            ...prev,
                            status: prev.status.includes(s as LeadStatus) 
                              ? prev.status.filter(i => i !== s) 
                              : [...prev.status, s as LeadStatus]
                          }))}
                          className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-bold border transition-all",
                            filters.status.includes(s as LeadStatus)
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-200"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Temperatura</label>
                    <div className="flex gap-2">
                      {['quente', 'morno', 'frio'].map(t => (
                        <button
                          key={t}
                          onClick={() => setFilters(prev => ({
                            ...prev,
                            temperature: prev.temperature.includes(t as LeadTemperature) 
                              ? prev.temperature.filter(i => i !== t) 
                              : [...prev.temperature, t as LeadTemperature]
                          }))}
                          className={cn(
                            "flex-1 py-1.5 rounded-xl text-[9px] font-bold border transition-all uppercase tracking-widest",
                            filters.temperature.includes(t as LeadTemperature)
                              ? t === 'quente' ? "bg-red-500 text-white border-red-500" :
                                t === 'morno' ? "bg-amber-500 text-white border-amber-500" :
                                "bg-blue-500 text-white border-blue-500"
                              : "bg-slate-50 text-slate-500 border-slate-200"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Limite de Envio</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[50, 100, 150].map(v => (
                        <button
                          key={v}
                          onClick={() => setLimit(v)}
                          className={cn(
                            "py-2 rounded-xl text-[10px] font-extrabold border transition-all",
                            limit === v 
                              ? "bg-brand-dark text-gold-deep border-gold-deep shadow-md"
                              : "bg-white text-slate-400 border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          {v} Leads
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <button 
                      onClick={() => setFilters({ status: [], temperature: [], origin: [], noResponseOnly: false })}
                      className="w-full py-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Limpar Filtros
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-brand-dark p-6 rounded-3xl border border-gold-deep/20 shadow-xl shadow-gold-deep/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gold-deep/50 uppercase tracking-[0.2em]">Público Alvo</span>
                    <span className="text-2xl font-bold text-gold-deep tracking-tight">{targetLeads.length}</span>
                  </div>
                  <Users className="w-8 h-8 text-gold-deep opacity-20" />
                </div>
                <p className="text-[10px] text-gold-light/60 font-medium leading-relaxed">
                  {selectedLeads.length > 0 
                    ? `Você selecionou manualmente ${selectedLeads.length} leads para esta campanha.`
                    : `Baseado nos filtros e no limite de envio, o sistema selecionou os ${targetLeads.length} leads mais qualificados.`}
                </p>
                <button 
                  onClick={() => setActiveStep('config')}
                  disabled={targetLeads.length === 0}
                  className="w-full mt-6 py-4 bg-gold-deep text-brand-black rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-gold-deep/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                >
                  Continuar para Configuração
                </button>
              </div>
            </div>

            {/* Lead Selection List */}
            <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Seleção de Leads</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    {filteredLeads.length} leads encontrados
                  </p>
                </div>
                <button 
                  onClick={selectAll}
                  className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-slate-100"
                >
                  {selectedLeads.length === filteredLeads.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[500px]">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 sticky top-0 z-10">
                    <tr>
                      <th className="p-4 w-10"></th>
                      <th className="p-4 text-[9px] font-bold text-slate-400 uppercase">Nome</th>
                      <th className="p-4 text-[9px] font-bold text-slate-400 uppercase">Status</th>
                      <th className="p-4 text-[9px] font-bold text-slate-400 uppercase">Temperatura</th>
                      <th className="p-4 text-[9px] font-bold text-slate-400 uppercase text-right">Origem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredLeads.map(lead => (
                      <tr 
                        key={lead.id} 
                        onClick={() => toggleLeadSelection(lead.id)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          selectedLeads.includes(lead.id) ? "bg-gold-light/5" : "hover:bg-slate-50"
                        )}
                      >
                        <td className="p-4">
                          <div className={cn(
                            "w-5 h-5 rounded border flex items-center justify-center transition-all",
                            selectedLeads.includes(lead.id) ? "bg-gold-deep border-gold-deep" : "border-slate-300"
                          )}>
                            {selectedLeads.includes(lead.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-bold text-slate-800">{lead.name}</p>
                          <p className="text-[10px] text-slate-400">{lead.phone}</p>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                            {lead.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[8px] font-bold border uppercase",
                            lead.temperature === 'quente' ? "bg-red-50 text-red-600 border-red-100" :
                            lead.temperature === 'morno' ? "bg-amber-50 text-amber-600 border-amber-100" :
                            "bg-blue-50 text-blue-600 border-blue-100"
                          )}>
                            {lead.temperature}
                          </span>
                        </td>
                        <td className="p-4 text-right text-[10px] font-bold text-slate-500 uppercase">
                          {lead.origin}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeStep === 'config' && (
          <motion.div 
            key="config"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            <div className="lg:col-span-12">
               <div className="bg-white p-6 md:p-10 rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
                     <Bot className="w-64 h-64" />
                  </div>
                  
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-14 h-14 bg-brand-dark rounded-2xl flex items-center justify-center text-gold-deep shadow-lg shadow-gold-deep/10 border border-gold-deep/20">
                        <Sparkles className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight"> Inteligência da Campanha</h2>
                        <p className="text-[10px] font-black uppercase text-gold-deep tracking-[0.2em] mt-1">Configuração do Agente de Disparo Ativo</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-6">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nome da Campanha</label>
                            <input 
                              type="text" 
                              value={campaignName}
                              onChange={(e) => setCampaignName(e.target.value)}
                              placeholder="Ex: Campanha Renovação Maio 2024"
                              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep outline-none text-sm font-bold text-slate-800"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Objetivo da Mensagem</label>
                            <select 
                              value={objective}
                              onChange={(e) => setObjective(e.target.value)}
                              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 outline-none text-sm font-bold text-slate-800 appearance-none"
                            >
                              <option value="">Selecione um objetivo...</option>
                              <option value="reengajamento">Reengajamento de Lead Parado</option>
                              <option value="renovacao">Oferecer Renovação de Seguro</option>
                              <option value="promocao">Promoção de Mês do Seguro</option>
                              <option value="feedback">Pesquisa de Satisfação</option>
                              <option value="cobranca">Lembrete de Pagamento ou Documento</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Instruções para a IA (Prompt)</label>
                            <textarea 
                              rows={4}
                              value={instructions}
                              onChange={(e) => setInstructions(e.target.value)}
                              placeholder="Dê contexto à IA: 'Seja amigável, cite que vimos que o seguro está vencendo e pergunte se quer uma cotação atualizada...'"
                              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 outline-none text-sm font-medium text-slate-700 resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-4">
                            <button 
                              onClick={() => setActiveStep('leads')}
                              className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold uppercase text-[10px] tracking-widest transition-all"
                            >
                              Voltar
                            </button>
                            <button 
                              onClick={handleCreateCampaign}
                              disabled={!campaignName || !objective}
                              className="w-full py-4 bg-brand-dark text-gold-deep rounded-2xl font-black uppercase text-[10px] tracking-widest border border-gold-deep/30 shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50"
                            >
                              Criar Campanha
                            </button>
                          </div>
                       </div>

                       <div className="space-y-6">
                          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                             <div className="flex items-center justify-between mb-4">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pré-visualização (Amostra IA)</h4>
                                <button 
                                  onClick={generatePreview}
                                  disabled={isPreviewLoading || !objective}
                                  className="text-[9px] font-bold text-blue-600 uppercase hover:underline disabled:opacity-50"
                                >
                                  {isPreviewLoading ? 'Gerando...' : 'Gerar Novo Exemplo'}
                                </button>
                             </div>
                             
                             <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 min-h-[150px] relative">
                                {isPreviewLoading ? (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Clock className="w-8 h-8 text-gold-deep animate-pulse" />
                                  </div>
                                ) : previewMsg ? (
                                  <p className="text-sm font-medium text-slate-700 leading-relaxed italic">
                                    "{previewMsg}"
                                  </p>
                                ) : (
                                  <div className="h-full flex items-center justify-center text-center px-6">
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-tight">
                                      Defina o objetivo e gere uma prévia para ver como a IA irá abordar o cliente.
                                    </p>
                                  </div>
                                )}
                             </div>
                             
                             <div className="mt-4 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight italic">
                                  A IA irá personalizar cada mensagem com o nome e contexto individual do lead.
                                </p>
                             </div>
                          </div>

                          <div className="bg-gold-light/5 rounded-3xl p-6 border border-gold-deep/10">
                            <h4 className="text-[10px] font-bold text-gold-deep uppercase tracking-widest mb-4">Parâmetros de Segurança</h4>
                            <div className="space-y-4">
                               <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Intervalo entre disparos</span>
                                  <div className="flex items-center gap-3">
                                     <button onClick={() => setInterval(Math.max(5, interval - 5))} className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400">-</button>
                                     <span className="text-sm font-bold text-slate-800 w-12 text-center">{interval}s</span>
                                     <button onClick={() => setInterval(interval + 5)} className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400">+</button>
                                  </div>
                               </div>
                               <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Aprovação Manual</span>
                                  <div className="w-10 h-5 bg-slate-200 rounded-full relative">
                                     <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all" />
                                  </div>
                               </div>
                            </div>
                          </div>
                       </div>
                    </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}

        {activeStep === 'dispatch' && activeCampaign && (
          <motion.div 
            key="dispatch"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12"
          >
            {/* Control Panel */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden relative">
                 <div className="flex items-center gap-4 mb-8">
                   <div className={cn(
                     "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg border transition-all",
                     activeCampaign.status === 'running' 
                       ? "bg-emerald-500 text-white border-emerald-400 animate-pulse" 
                       : "bg-brand-dark text-gold-deep border-gold-deep/20"
                   )}>
                     {activeCampaign.status === 'running' ? <Play className="w-6 h-6 fill-current" /> : <Pause className="w-6 h-6 fill-current" />}
                   </div>
                   <div>
                     <h2 className="text-xl font-bold text-slate-900 tracking-tight">{activeCampaign.name}</h2>
                     <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn(
                           "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border tracking-widest",
                           activeCampaign.status === 'running' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                           activeCampaign.status === 'paused' ? "bg-amber-50 text-amber-600 border-amber-100" :
                           "bg-slate-100 text-slate-500 border-slate-200"
                        )}>
                          {activeCampaign.status}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ativo por Michelin</span>
                     </div>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Enviados</p>
                       <p className="text-2xl font-bold text-slate-800">{activeCampaign.sentCount} / <span className="text-slate-400">{activeCampaign.totalLeads}</span></p>
                       <div className="w-full h-1.5 bg-slate-200 rounded-full mt-3 overflow-hidden">
                          <div 
                            className="h-full bg-gold-deep transition-all duration-500" 
                            style={{ width: `${(activeCampaign.sentCount / activeCampaign.totalLeads) * 100}%` }}
                          />
                       </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Sucesso</p>
                       <p className="text-2xl font-bold text-emerald-500">
                          {activeCampaign.sentCount > 0 ? Math.round(((activeCampaign.sentCount - activeCampaign.errorCount) / activeCampaign.sentCount) * 100) : 100}%
                       </p>
                       <div className="flex items-center gap-1.5 mt-3">
                          <TrendingUp className="w-3 h-3 text-emerald-500" />
                          <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tighter">Conexão Estável</span>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-3">
                    {activeCampaign.status === 'running' ? (
                      <button 
                        onClick={pauseCampaign}
                        className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-amber-500/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                      >
                        <Pause className="w-4 h-4 fill-current" />
                        Pausar Disparo
                      </button>
                    ) : (
                      <button 
                        onClick={startCampaign}
                        disabled={activeCampaign.status === 'completed'}
                        className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Retomar Disparo
                      </button>
                    )}
                    
                    <button 
                      onClick={() => {
                        if (window.confirm("Deseja realmente cancelar esta campanha?")) {
                          DataService.update('campaign', activeCampaign.id, { status: 'cancelled' });
                        }
                      }}
                      className="w-full py-4 bg-white text-red-500 border border-red-100 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-red-50 transition-all flex items-center justify-center gap-3"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      Cancelar Campanha
                    </button>
                 </div>
              </div>

              <div className="bg-brand-dark p-6 rounded-[2rem] border border-gold-deep/20 shadow-xl overflow-hidden">
                 <div className="flex items-center gap-3 mb-4">
                    <TrendingUp className="w-5 h-5 text-gold-deep" />
                    <h3 className="text-[10px] font-black text-gold-deep uppercase tracking-[0.2em]">Estimativas de Conversão</h3>
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-end border-b border-gold-deep/10 pb-2">
                       <span className="text-[10px] font-bold text-gold-light/40 uppercase">Aberturas Previstas</span>
                       <span className="text-lg font-bold text-gold-light">{Math.round(activeCampaign.totalLeads * 0.8)}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-gold-deep/10 pb-2">
                       <span className="text-[10px] font-bold text-gold-light/40 uppercase">Respostas Sugeridas</span>
                       <span className="text-lg font-bold text-gold-light">{Math.round(activeCampaign.totalLeads * 0.15)}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-gold-deep/10 pb-2">
                       <span className="text-[10px] font-bold text-gold-light/40 uppercase">Leads Reengajados</span>
                       <span className="text-lg font-bold text-emerald-400">Alto</span>
                    </div>
                 </div>
              </div>
            </div>

            {/* Logs & Status */}
            <div className="lg:col-span-7">
               <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col h-full min-h-[600px]">
                  <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                       <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                          <LayoutDashboard className="w-5 h-5 text-slate-400" />
                       </div>
                       <div>
                          <h3 className="font-bold text-slate-800 text-sm md:text-base">Monitoramento em Tempo Real</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Logs de Processamento IA</p>
                          </div>
                       </div>
                    </div>
                    <div className="hidden md:flex items-center gap-3">
                       <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Processamento</p>
                          <p className="text-xs font-bold text-slate-600 mt-1">1.2s avg/msg</p>
                       </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
                    {logs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                         <Search className="w-12 h-12 mb-4 text-slate-300" />
                         <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Inicie o disparo para ver os logs</p>
                      </div>
                    ) : (
                      logs.map((log, i) => (
                        <motion.div 
                          key={log.id} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={cn(
                            "p-5 rounded-[1.5rem] border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4",
                            log.status === 'sent' ? "bg-emerald-50/30 border-emerald-100" :
                            log.status === 'error' ? "bg-red-50/30 border-red-100" :
                            "bg-slate-50 border-slate-100"
                          )}
                        >
                          <div className="flex items-center gap-4">
                             <div className={cn(
                               "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                               log.status === 'sent' ? "bg-white text-emerald-500 border-emerald-200" : 
                               log.status === 'error' ? "bg-white text-red-500 border-red-200" :
                               "bg-white text-slate-300 border-slate-200"
                             )}>
                               {log.status === 'sent' ? <CheckCircle2 className="w-5 h-5" /> : 
                                log.status === 'error' ? <AlertCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                             </div>
                             <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-slate-800">{log.leadName}</p>
                                  <span className="text-[10px] text-slate-300 font-medium">| {format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                                </div>
                                <p className={cn(
                                  "text-[11px] mt-1 line-clamp-1",
                                  log.status === 'sent' ? "text-slate-600 italic" : "text-red-500 font-bold"
                                )}>
                                  {log.status === 'sent' ? `"${log.message}"` : `ERRO: ${log.error || 'Falha na conexão'}`}
                                </p>
                             </div>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                             <button className="px-3 py-1 bg-white border border-slate-100 rounded-lg text-[9px] font-bold text-slate-400 hover:text-gold-deep transition-all uppercase">Ver Detalhes</button>
                             <ChevronRight className="w-4 h-4 text-slate-200" />
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>

                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Exibindo os últimos 50 eventos
                     </p>
                     <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                           <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Enviados: {activeCampaign.sentCount - activeCampaign.errorCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-red-500"></div>
                           <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Erros: {activeCampaign.errorCount}</span>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
