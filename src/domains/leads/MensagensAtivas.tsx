
import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  X,
  Tag,
  Eye,
  RefreshCw,
  ImagePlus,
  X as XIcon,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Lead, LeadStatus, LeadTemperature, Campaign, CampaignLog, VisualIdentityConfig } from '../../types';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth } from '../../lib/firebase';
import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { DataService } from '../../services/DataService';
import { useWhatsApp } from '../../contexts/WhatsAppContext';
import { StorageService } from '../../services/StorageService';

// ─── Template Engine ──────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

function getPrimeiroNome(nome: string): string {
  return toTitleCase(nome?.trim()?.split(' ')[0] || '');
}

function renderTemplate(template: string, lead: Lead): string {
  return template
    .replace(/\{\{primeiroNome\}\}/g, getPrimeiroNome(lead.name))
    .replace(/\{\{nome\}\}/g, toTitleCase(lead.name || ''));
}

function formatEstimatedTime(totalLeads: number, intervalSeconds: number): string {
  const total = totalLeads * intervalSeconds;
  if (total < 60) return `${total} segundos`;
  if (total < 3600) return `${Math.ceil(total / 60)} minutos`;
  const h = Math.floor(total / 3600);
  const m = Math.ceil((total % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ─── Variables Palette ────────────────────────────────────────────────────────

const VARIABLES = [
  { label: 'Primeiro nome', emoji: '👤', tpl: '{{primeiroNome}}' },
  { label: 'Nome completo', emoji: '📝', tpl: '{{nome}}' },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface MensagensAtivasProps {
  leads: Lead[];
  visualConfig: VisualIdentityConfig;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const MensagensAtivas = ({ leads, visualConfig }: MensagensAtivasProps) => {
  // ── Step & Leads ──────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<'leads' | 'config' | 'dispatch'>('leads');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    status: [] as LeadStatus[],
    temperature: [] as LeadTemperature[],
    origin: [] as string[],
    noResponseOnly: false,
  });
  const [limit, setLimit] = useState(50);

  // ── Campaign Config ───────────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState('');
  const [message, setMessage] = useState('');
  const [interval, setInterval] = useState(10);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageOrder, setImageOrder] = useState<'before' | 'after'>('before');
  const [imageUploading, setImageUploading] = useState(false);
  const { activeSessions } = useWhatsApp();
  const [sessionName, setSessionName] = useState('');

  // ── Preview ───────────────────────────────────────────────────────────────
  const [previewMsg, setPreviewMsg] = useState('');
  const [previewLeadIndex, setPreviewLeadIndex] = useState(0);

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [isSending, setIsSending] = useState(false);

  // ── Textarea ref for cursor-aware variable insertion ─────────────────────
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // ─── Filtered & Target Leads ──────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchStatus = filters.status.length === 0 || filters.status.includes(lead.status);
      const matchTemp   = filters.temperature.length === 0 || (lead.temperature && filters.temperature.includes(lead.temperature));
      const matchOrigin = filters.origin.length === 0 || filters.origin.includes(lead.origin);
      const matchNoResponse = !filters.noResponseOnly || (() => {
        if (!lead.lastInteraction) return true;
        const diffHours = (Date.now() - new Date(lead.lastInteraction).getTime()) / (1000 * 60 * 60);
        return diffHours > 24 && lead.lastMessageSender === 'lead';
      })();
      return matchStatus && matchTemp && matchOrigin && matchNoResponse;
    });
  }, [leads, filters]);

  const targetLeads = useMemo(() => {
    if (selectedLeads.length > 0) return selectedLeads;
    return filteredLeads.slice(0, limit).map(l => l.id);
  }, [selectedLeads, filteredLeads, limit]);

  // ─── Auto-select session when only one is available ──────────────────────
  useEffect(() => {
    if (activeSessions.length === 1 && !sessionName) {
      setSessionName(activeSessions[0].sessionName);
    }
  }, [activeSessions, sessionName]);

  // ─── Auto-preview when message changes ────────────────────────────────────
  useEffect(() => {
    if (!message.trim() || targetLeads.length === 0) { setPreviewMsg(''); return; }
    const timer = setTimeout(() => {
      const leadId = targetLeads[previewLeadIndex % targetLeads.length];
      const lead = leads.find(l => l.id === leadId);
      if (lead) setPreviewMsg(renderTemplate(message, lead));
    }, 350);
    return () => clearTimeout(timer);
  }, [message, leads, targetLeads, previewLeadIndex]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const toggleLeadSelection = (id: string) => {
    setSelectedLeads(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelectedLeads(selectedLeads.length === filteredLeads.length ? [] : filteredLeads.map(l => l.id));
  };

  const insertVariable = (tpl: string) => {
    const textarea = messageRef.current;
    if (!textarea) { setMessage(prev => prev + tpl); return; }
    const start = textarea.selectionStart ?? message.length;
    const end   = textarea.selectionEnd   ?? message.length;
    const next  = message.slice(0, start) + tpl + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      if (!messageRef.current) return;
      const pos = start + tpl.length;
      messageRef.current.selectionStart = pos;
      messageRef.current.selectionEnd   = pos;
      messageRef.current.focus();
    });
  };

  const generatePreview = () => {
    if (!message.trim() || targetLeads.length === 0) return;
    const next = (previewLeadIndex + 1) % targetLeads.length;
    setPreviewLeadIndex(next);
    const lead = leads.find(l => l.id === targetLeads[next]);
    if (lead) setPreviewMsg(renderTemplate(message, lead));
  };

  const handleCreateCampaign = async () => {
    if (!campaignName || !objective || !message.trim() || !sessionName || targetLeads.length === 0) return;
    try {
      let uploadedImageUrl = '';
      if (imageFile) {
        setImageUploading(true);
        try {
          const result = await StorageService.uploadFile(imageFile, 'campaigns', imageFile.name);
          uploadedImageUrl = result.url;
        } catch (err) {
          console.error('Erro ao fazer upload da imagem:', err);
          setImageUploading(false);
          return;
        }
        setImageUploading(false);
      }

      const campaignData = {
        name: campaignName,
        objective,
        messageTemplate: message,
        sessionName,
        imageUrl:        uploadedImageUrl,
        imageOrder:      (imageFile ? imageOrder : '') as 'before' | 'after' | '',
        status:          'idle' as any,
        totalLeads:      targetLeads.length,
        sentCount:       0,
        errorCount:      0,
        respondedCount:  0,
        createdAt:       new Date().toISOString(),
        updatedAt:       new Date().toISOString(),
        limit,
        interval,
        targetLeads,
      };
      const campaignId = await DataService.create('campaigns', campaignData);
      setActiveCampaign({ ...campaignData, id: campaignId });
      setActiveStep('dispatch');
    } catch (error) {
      console.error('Erro ao criar campanha:', error);
    }
  };

  const startCampaign = async () => {
    if (!activeCampaign) return;
    setIsSending(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      await fetch('/api/campaigns/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ campaignId: activeCampaign.id }),
      });
    } catch (err) { console.error(err); }
  };

  const pauseCampaign = async () => {
    if (!activeCampaign) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      await fetch('/api/campaigns/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ campaignId: activeCampaign.id }),
      });
    } catch (err) { console.error(err); }
  };

  // ─── Real-time Updates ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeCampaign?.id) return;
    const isRunning = activeCampaign.status === 'running';

    const unsubC = DataService.subscribe('campaign', activeCampaign.id, (data) => {
      if (data) {
        setActiveCampaign(prev => ({ ...prev!, ...data, id: activeCampaign.id }));
        setIsSending(data.status === 'running');
      }
    }, isRunning);

    const unsubL = DataService.subscribeCollection(
      'campaign_log',
      [where('campaignId', '==', activeCampaign.id), orderBy('timestamp', 'desc'), firestoreLimit(50)],
      (newLogs) => setLogs(newLogs as CampaignLog[]),
      isRunning,
    );

    return () => { if (unsubC) unsubC(); if (unsubL) unsubL(); };
  }, [activeCampaign?.id, activeCampaign?.status]);

  // ─── Derived for preview ──────────────────────────────────────────────────
  const previewLead = useMemo(() => {
    if (targetLeads.length === 0) return null;
    return leads.find(l => l.id === targetLeads[previewLeadIndex % targetLeads.length]) ?? null;
  }, [leads, targetLeads, previewLeadIndex]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full font-sans">

      {/* ── Step Bar ─────────────────────────────────────────────────────── */}
      <nav className="flex-shrink-0 sticky top-0 z-10 bg-[#050505] border-b border-white/5 px-4 flex items-center overflow-x-auto">
        {[
          { id: 'leads',    label: 'Seleção de Leads',    icon: Users },
          { id: 'config',   label: 'Configuração',         icon: Bot },
          { id: 'dispatch', label: 'Controle de Disparo',  icon: Send },
        ].map((step, i) => {
          const isActive    = activeStep === step.id;
          const isCompleted = (activeStep === 'config' && step.id === 'leads') || (activeStep === 'dispatch' && i < 2);
          return (
            <React.Fragment key={step.id}>
              <div className={cn(
                'flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-all',
                isActive    ? 'border-gold-deep text-gold-deep' :
                isCompleted ? 'border-emerald-500 text-emerald-400' :
                              'border-transparent text-white/30',
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center border flex-shrink-0',
                  isActive    ? 'bg-gold-deep/10 border-gold-deep text-gold-deep' :
                  isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' :
                                'bg-white/5 border-white/10 text-white/30',
                )}>
                  {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : <step.icon className="w-3 h-3" />}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">{step.label}</span>
              </div>
              {i < 2 && <div className="w-6 h-px bg-white/10 flex-shrink-0 self-center" />}
            </React.Fragment>
          );
        })}

        <div className="ml-auto flex items-center gap-2 pl-4 py-2 flex-shrink-0">
          <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Público Alvo</p>
          <p className="text-sm font-black text-gold-deep">{targetLeads.length}</p>
          <p className="text-[9px] text-white/30 font-medium">leads</p>
        </div>
      </nav>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 md:p-8">
          <AnimatePresence mode="wait">

            {/* ── Step 1: Lead Selection ─────────────────────────────────── */}
            {activeStep === 'leads' && (
              <motion.div
                key="leads"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6"
              >
                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-[#0B0B0D] p-6 rounded-3xl border border-white/5">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-gold-deep/10 rounded-xl">
                        <Filter className="w-5 h-5 text-gold-deep" />
                      </div>
                      <h3 className="font-bold text-white uppercase text-xs tracking-widest">Filtros Inteligentes</h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-2 block">Status do Lead</label>
                        <div className="flex flex-wrap gap-2">
                          {['Novo Lead', 'Em Atendimento', 'Aguardando Documento', 'Em Cotação', 'Perdido'].map(s => (
                            <button
                              key={s}
                              onClick={() => setFilters(prev => ({
                                ...prev,
                                status: prev.status.includes(s as LeadStatus)
                                  ? prev.status.filter(i => i !== s)
                                  : [...prev.status, s as LeadStatus],
                              }))}
                              className={cn(
                                'px-3 py-1 rounded-full text-[9px] font-bold border transition-all',
                                filters.status.includes(s as LeadStatus)
                                  ? 'bg-gold-deep text-brand-black border-gold-deep'
                                  : 'bg-white/5 text-white/40 border-white/10 hover:border-gold-deep/30',
                              )}
                            >{s}</button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-2 block">Temperatura</label>
                        <div className="flex gap-2">
                          {['quente', 'morno', 'frio'].map(t => (
                            <button
                              key={t}
                              onClick={() => setFilters(prev => ({
                                ...prev,
                                temperature: prev.temperature.includes(t as LeadTemperature)
                                  ? prev.temperature.filter(i => i !== t)
                                  : [...prev.temperature, t as LeadTemperature],
                              }))}
                              className={cn(
                                'flex-1 py-1.5 rounded-xl text-[9px] font-bold border transition-all uppercase tracking-widest',
                                filters.temperature.includes(t as LeadTemperature)
                                  ? t === 'quente' ? 'bg-red-500 text-white border-red-500'
                                  : t === 'morno'  ? 'bg-amber-500 text-white border-amber-500'
                                  :                  'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white/5 text-white/40 border-white/10',
                              )}
                            >{t}</button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-2 block">Limite de Envio</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[50, 100, 150].map(v => (
                            <button
                              key={v}
                              onClick={() => setLimit(v)}
                              className={cn(
                                'py-2 rounded-xl text-[10px] font-extrabold border transition-all',
                                limit === v
                                  ? 'bg-gold-deep/10 text-gold-deep border-gold-deep/40'
                                  : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20',
                              )}
                            >{v} Leads</button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5">
                        <button
                          onClick={() => setFilters({ status: [], temperature: [], origin: [], noResponseOnly: false })}
                          className="w-full py-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 hover:text-white/60 transition-colors"
                        >Limpar Filtros</button>
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
                        : `Baseado nos filtros, ${targetLeads.length} leads mais qualificados foram selecionados.`}
                    </p>
                    <button
                      onClick={() => setActiveStep('config')}
                      disabled={targetLeads.length === 0}
                      className="w-full mt-6 py-4 bg-gold-deep text-brand-black rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-gold-deep/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                    >Continuar para Configuração</button>
                  </div>
                </div>

                <div className="lg:col-span-8 bg-[#0B0B0D] rounded-3xl border border-white/5 overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-sm">Seleção de Leads</h3>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                        {filteredLeads.length} leads encontrados
                      </p>
                    </div>
                    <button
                      onClick={selectAll}
                      className="px-4 py-2 bg-white/5 text-white/60 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-white/10 hover:border-white/20 transition-all"
                    >
                      {selectedLeads.length === filteredLeads.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[500px]">
                    <table className="w-full text-left">
                      <thead className="bg-white/[0.03] sticky top-0 z-10">
                        <tr>
                          <th className="p-4 w-10" />
                          <th className="p-4 text-[9px] font-bold text-white/40 uppercase">Nome</th>
                          <th className="p-4 text-[9px] font-bold text-white/40 uppercase">Status</th>
                          <th className="p-4 text-[9px] font-bold text-white/40 uppercase">Temperatura</th>
                          <th className="p-4 text-[9px] font-bold text-white/40 uppercase text-right">Origem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {filteredLeads.map(lead => (
                          <tr
                            key={lead.id}
                            onClick={() => toggleLeadSelection(lead.id)}
                            className={cn(
                              'cursor-pointer transition-colors',
                              selectedLeads.includes(lead.id) ? 'bg-gold-deep/5' : 'hover:bg-white/[0.03]',
                            )}
                          >
                            <td className="p-4">
                              <div className={cn(
                                'w-5 h-5 rounded border flex items-center justify-center transition-all',
                                selectedLeads.includes(lead.id) ? 'bg-gold-deep border-gold-deep' : 'border-white/20',
                              )}>
                                {selectedLeads.includes(lead.id) && <CheckCircle2 className="w-3 h-3 text-brand-black" />}
                              </div>
                            </td>
                            <td className="p-4">
                              <p className="text-sm font-bold text-white">{lead.name}</p>
                              <p className="text-[10px] text-white/40">{lead.phone}</p>
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-white/5 text-white/60 border border-white/10 uppercase">
                                {lead.status}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={cn(
                                'px-2 py-0.5 rounded-full text-[8px] font-bold border uppercase',
                                lead.temperature === 'quente' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                lead.temperature === 'morno'  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                                'bg-blue-500/10 text-blue-400 border-blue-500/20',
                              )}>
                                {lead.temperature}
                              </span>
                            </td>
                            <td className="p-4 text-right text-[10px] font-bold text-white/40 uppercase">
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

            {/* ── Step 2: Campaign Builder ───────────────────────────────── */}
            {activeStep === 'config' && (
              <motion.div
                key="config"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 bg-gold-deep/10 rounded-2xl flex items-center justify-center text-gold-deep shadow-lg shadow-gold-deep/10 border border-gold-deep/20">
                    <MessageSquare className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Construtor de Campanha</h2>
                    <p className="text-[10px] font-black uppercase text-gold-deep/70 tracking-[0.2em] mt-0.5">
                      Configuração do Agente de Disparo Ativo
                    </p>
                  </div>
                </div>

                {/* 2-column grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">

                  {/* ── Left Column ─────────────────────────────────────── */}
                  <div className="space-y-5">

                    {/* Nome da Campanha */}
                    <div>
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                        Nome da Campanha
                      </label>
                      <input
                        type="text"
                        value={campaignName}
                        onChange={e => setCampaignName(e.target.value)}
                        placeholder="Ex: Campanha Renovação Junho 2026"
                        className="w-full px-5 py-4 bg-black/30 border border-white/5 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep/30 outline-none text-sm font-bold text-white placeholder:text-white/20 transition-all"
                      />
                    </div>

                    {/* Objetivo */}
                    <div>
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                        Objetivo da Mensagem
                      </label>
                      <select
                        value={objective}
                        onChange={e => setObjective(e.target.value)}
                        className="w-full px-5 py-4 bg-black/30 border border-white/5 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 outline-none text-sm font-bold text-white appearance-none transition-all"
                      >
                        <option value="" className="bg-[#0B0B0D]">Selecione um objetivo...</option>
                        <option value="reengajamento" className="bg-[#0B0B0D]">Reengajamento de Lead Parado</option>
                        <option value="renovacao"     className="bg-[#0B0B0D]">Oferecer Renovação de Seguro</option>
                        <option value="promocao"      className="bg-[#0B0B0D]">Promoção de Mês do Seguro</option>
                        <option value="feedback"      className="bg-[#0B0B0D]">Pesquisa de Satisfação</option>
                        <option value="cobranca"      className="bg-[#0B0B0D]">Lembrete de Pagamento ou Documento</option>
                      </select>
                    </div>

                    {/* Sessão WhatsApp */}
                    <div>
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                        Sessão WhatsApp (Evolution API)
                      </label>
                      {activeSessions.length === 0 ? (
                        <div className="w-full px-5 py-4 bg-black/30 border border-red-500/20 rounded-2xl text-sm text-red-400/70 font-medium">
                          Nenhuma sessão conectada. Conecte uma instância em WhatsApp → Sessões.
                        </div>
                      ) : (
                        <select
                          value={sessionName}
                          onChange={e => setSessionName(e.target.value)}
                          className="w-full px-5 py-4 bg-black/30 border border-white/5 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 outline-none text-sm font-bold text-white appearance-none transition-all"
                        >
                          <option value="" className="bg-[#0B0B0D]">Selecione uma sessão...</option>
                          {activeSessions.map(s => (
                            <option key={s.sessionName} value={s.sessionName} className="bg-[#0B0B0D]">{s.sessionName}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Mensagem da Campanha */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">
                        Mensagem da Campanha
                      </label>
                      <textarea
                        ref={messageRef}
                        rows={10}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder={`Olá {{primeiroNome}}, tudo bem?\n\nEstou fazendo uma parceria com a Flex Intermediações e conseguimos condições especiais em seguros.\n\nGostaria de fazer uma cotação sem compromisso?`}
                        className="w-full px-5 py-4 bg-black/30 border border-white/5 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep/30 outline-none text-sm font-medium text-white/85 placeholder:text-white/15 resize-none leading-relaxed transition-all"
                      />
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] text-white/25">
                          Use os botões ao lado para inserir variáveis personalizadas
                        </p>
                        <p className={cn(
                          'text-[10px] font-bold tabular-nums',
                          message.length > 900 ? 'text-red-400' : 'text-white/25',
                        )}>
                          {message.length} / 1024
                        </p>
                      </div>
                    </div>

                    {/* Upload de Imagem (opcional) */}
                    <div>
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                        Imagem da Mensagem <span className="text-white/20 normal-case font-normal">(opcional)</span>
                      </label>

                      {!imageFile ? (
                        <label className="flex flex-col items-center justify-center gap-3 w-full py-8 bg-black/30 border border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-gold-deep/30 hover:bg-gold-deep/5 transition-all group">
                          <ImagePlus className="w-6 h-6 text-white/25 group-hover:text-gold-deep/60 transition-colors" />
                          <span className="text-[11px] font-medium text-white/30 group-hover:text-white/50 transition-colors">
                            Clique para selecionar uma foto
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setImageFile(file);
                              const reader = new FileReader();
                              reader.onload = ev => setImagePreview(ev.target?.result as string);
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      ) : (
                        <div className="space-y-3">
                          <div className="relative rounded-2xl overflow-hidden border border-white/10">
                            <img src={imagePreview} alt="Prévia" className="w-full max-h-48 object-cover" />
                            <button
                              onClick={() => { setImageFile(null); setImagePreview(''); }}
                              className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/80 transition-colors"
                            >
                              <XIcon className="w-3.5 h-3.5 text-white" />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-black/60 text-[10px] text-white/60 truncate">
                              {imageFile.name}
                            </div>
                          </div>

                          {/* Pergunta de ordem */}
                          <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">
                              Enviar a foto antes ou depois da mensagem?
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {(['before', 'after'] as const).map(opt => (
                                <button
                                  key={opt}
                                  onClick={() => setImageOrder(opt)}
                                  className={cn(
                                    'py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all',
                                    imageOrder === opt
                                      ? 'bg-gold-deep/15 text-gold-deep border-gold-deep/40'
                                      : 'bg-white/5 text-white/30 border-white/10 hover:border-white/20',
                                  )}
                                >
                                  {opt === 'before' ? 'Antes' : 'Depois'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Right Column ─────────────────────────────────────── */}
                  <div className="space-y-5">

                    {/* Inserir Variável */}
                    <div className="bg-[#0B0B0D] rounded-2xl p-5 border border-white/5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 bg-gold-deep/10 rounded-lg">
                          <Tag className="w-3.5 h-3.5 text-gold-deep" />
                        </div>
                        <h4 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Inserir Variável</h4>
                        <span className="ml-auto text-[9px] text-white/20">clique para inserir no cursor</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {VARIABLES.map(v => (
                          <button
                            key={v.tpl}
                            onClick={() => insertVariable(v.tpl)}
                            title={v.tpl}
                            className="flex flex-col items-center gap-1 px-2 py-3 bg-black/30 hover:bg-gold-deep/10 border border-white/5 hover:border-gold-deep/30 rounded-xl transition-all group"
                          >
                            <span className="text-base leading-none">{v.emoji}</span>
                            <span className="text-[8px] font-bold text-white/40 group-hover:text-gold-deep/80 uppercase tracking-tight text-center leading-tight transition-colors">
                              {v.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pré-visualização */}
                    <div className="bg-[#0B0B0D] rounded-2xl p-5 border border-white/5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-gold-deep/10 rounded-lg">
                            <Eye className="w-3.5 h-3.5 text-gold-deep" />
                          </div>
                          <h4 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Pré-visualização</h4>
                        </div>
                        <button
                          onClick={generatePreview}
                          disabled={!message.trim() || targetLeads.length === 0}
                          className="flex items-center gap-1.5 text-[9px] font-bold text-gold-deep/70 hover:text-gold-deep uppercase tracking-wider disabled:opacity-30 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Gerar novo exemplo
                        </button>
                      </div>

                      {/* WhatsApp-style bubble */}
                      <div className="bg-[#005c4b] rounded-2xl rounded-bl-none p-4 min-h-[90px] relative">
                        {previewMsg ? (
                          <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{previewMsg}</p>
                        ) : (
                          <p className="text-white/30 text-xs italic">
                            {message.trim()
                              ? targetLeads.length === 0
                                ? 'Nenhum lead selecionado para prévia.'
                                : 'Gerando prévia...'
                              : 'Escreva a mensagem para ver a pré-visualização aqui.'}
                          </p>
                        )}
                        {previewMsg && (
                          <div className="absolute bottom-2 right-3 flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3 text-white/50" />
                            <CheckCircle2 className="w-3 h-3 text-[#53bdeb]" />
                          </div>
                        )}
                      </div>

                      {previewLead && previewMsg && (
                        <p className="text-[10px] text-white/25 mt-2 px-1">
                          Exemplo com: <span className="text-white/40 font-semibold">{previewLead.name}</span>
                          {targetLeads.length > 1 && (
                            <span className="text-white/20"> · {previewLeadIndex % targetLeads.length + 1}/{targetLeads.length}</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Intervalo entre disparos */}
                    <div className="bg-gold-deep/5 rounded-2xl p-5 border border-gold-deep/10">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 bg-gold-deep/10 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-gold-deep" />
                        </div>
                        <h4 className="text-[10px] font-black text-gold-deep uppercase tracking-widest">Intervalo entre Disparos</h4>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-white/50 uppercase tracking-tight">Tempo mínimo entre cada mensagem</p>
                          <p className="text-[9px] text-white/25 mt-0.5">Evita bloqueio por spam</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setInterval(Math.max(5, interval - 5))}
                            className="w-8 h-8 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center text-white/50 hover:border-gold-deep/30 hover:text-gold-deep transition-all text-lg leading-none"
                          >−</button>
                          <span className="text-sm font-bold text-white w-10 text-center">{interval}s</span>
                          <button
                            onClick={() => setInterval(interval + 5)}
                            className="w-8 h-8 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center text-white/50 hover:border-gold-deep/30 hover:text-gold-deep transition-all text-lg leading-none"
                          >+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Bottom Actions ───────────────────────────────────── */}
                <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-white">
                      {targetLeads.length}
                      <span className="text-white/40 font-normal text-sm ml-2">leads selecionados</span>
                    </p>
                    <p className="text-[11px] text-white/30 mt-0.5">
                      Tempo estimado de envio:&nbsp;
                      <span className="text-white/50 font-semibold">{formatEstimatedTime(targetLeads.length, interval)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => setActiveStep('leads')}
                      className="flex-1 sm:flex-none px-6 py-4 bg-white/5 text-white/50 rounded-2xl font-bold uppercase text-[10px] tracking-widest border border-white/10 hover:border-white/20 transition-all"
                    >
                      ← Voltar
                    </button>
                    <button
                      onClick={handleCreateCampaign}
                      disabled={!campaignName || !objective || !message.trim() || !sessionName || targetLeads.length === 0 || imageUploading}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-gold-deep text-brand-black rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-gold-deep/25 hover:scale-[1.02] hover:shadow-gold-deep/40 transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {imageUploading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando foto...</>
                        : <><Send className="w-4 h-4" /> Iniciar Disparo</>
                      }
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Dispatch Control ───────────────────────────────── */}
            {activeStep === 'dispatch' && activeCampaign && (
              <motion.div
                key="dispatch"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12"
              >
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-[#0B0B0D] p-8 rounded-[2.5rem] border border-white/5 overflow-hidden relative">
                    <div className="flex items-center gap-4 mb-8">
                      <div className={cn(
                        'w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg border transition-all',
                        activeCampaign.status === 'running'
                          ? 'bg-emerald-500 text-white border-emerald-400 animate-pulse'
                          : 'bg-gold-deep/10 text-gold-deep border-gold-deep/20',
                      )}>
                        {activeCampaign.status === 'running'
                          ? <Play className="w-6 h-6 fill-current" />
                          : <Pause className="w-6 h-6 fill-current" />}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">{activeCampaign.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn(
                            'text-[8px] font-black uppercase px-2 py-0.5 rounded-full border tracking-widest',
                            activeCampaign.status === 'running'   ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            activeCampaign.status === 'paused'    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                                    'bg-white/5 text-white/40 border-white/10',
                          )}>
                            {activeCampaign.status}
                          </span>
                          <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Michelin Seguros</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Enviados</p>
                        <p className="text-2xl font-bold text-white">
                          {activeCampaign.sentCount} / <span className="text-white/40">{activeCampaign.totalLeads}</span>
                        </p>
                        <div className="w-full h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
                          <div
                            className="h-full bg-gold-deep transition-all duration-500"
                            style={{ width: `${(activeCampaign.sentCount / activeCampaign.totalLeads) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Taxa de Sucesso</p>
                        <p className="text-2xl font-bold text-emerald-400">
                          {activeCampaign.sentCount > 0
                            ? Math.round(((activeCampaign.sentCount - activeCampaign.errorCount) / activeCampaign.sentCount) * 100)
                            : 100}%
                        </p>
                        <div className="flex items-center gap-1.5 mt-3">
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                          <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Conexão Estável</span>
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
                          if (window.confirm('Deseja realmente cancelar esta campanha?')) {
                            DataService.update('campaign', activeCampaign.id, { status: 'cancelled' });
                          }
                        }}
                        className="w-full py-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-all flex items-center justify-center gap-3"
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

                <div className="lg:col-span-7">
                  <div className="bg-[#0B0B0D] rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col h-full min-h-[600px]">
                    <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-[#0B0B0D] sticky top-0 z-10">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                          <LayoutDashboard className="w-5 h-5 text-white/40" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm md:text-base">Monitoramento em Tempo Real</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Logs de Processamento</p>
                          </div>
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[9px] font-black text-white/30 uppercase leading-none">Processamento</p>
                          <p className="text-xs font-bold text-white/50 mt-1">1.2s avg/msg</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
                      {logs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                          <Search className="w-12 h-12 mb-4 text-white/20" />
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Inicie o disparo para ver os logs</p>
                        </div>
                      ) : (
                        logs.map((log, i) => (
                          <motion.div
                            key={log.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className={cn(
                              'p-5 rounded-[1.5rem] border flex flex-col md:flex-row md:items-center justify-between gap-4',
                              log.status === 'sent'  ? 'bg-emerald-500/5 border-emerald-500/10' :
                              log.status === 'error' ? 'bg-red-500/5 border-red-500/10' :
                                                       'bg-white/[0.03] border-white/5',
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
                                log.status === 'sent'  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                log.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                         'bg-white/5 text-white/30 border-white/10',
                              )}>
                                {log.status === 'sent'  ? <CheckCircle2 className="w-5 h-5" /> :
                                 log.status === 'error' ? <AlertCircle className="w-5 h-5" /> :
                                                          <Clock className="w-5 h-5" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-white">{log.leadName}</p>
                                  <span className="text-[10px] text-white/20 font-medium">| {format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                                </div>
                                <p className={cn(
                                  'text-[11px] mt-1 line-clamp-1',
                                  log.status === 'sent' ? 'text-white/50 italic' : 'text-red-400 font-bold',
                                )}>
                                  {log.status === 'sent' ? `"${log.message}"` : `ERRO: ${log.error || 'Falha na conexão'}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-white/40 hover:text-gold-deep transition-all uppercase">Ver Detalhes</button>
                              <ChevronRight className="w-4 h-4 text-white/20" />
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>

                    <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                        Exibindo os últimos 50 eventos
                      </p>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">
                            Enviados: {activeCampaign.sentCount - activeCampaign.errorCount}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">
                            Erros: {activeCampaign.errorCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
