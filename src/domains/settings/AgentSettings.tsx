import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, Save, Power, MessageSquare, Sparkles, Wand2, ShieldCheck, Zap, Info, ShieldAlert, FileText, Key, Globe, RefreshCcw, Clock, Plus, Trash2, CalendarRange, History, CheckCircle2 } from 'lucide-react';
import { AgentConfig } from '../../types';
import { cn } from '../../lib/utils';
import { agentService } from '../../services/agentService';
import { DataService } from '../../services/DataService';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { FlowEngine } from './FlowEngine';

import { VisualIdentityConfig } from '../../types';

interface AgentSettingsProps {
  onUpdate?: (config: AgentConfig) => void;
  visualConfig?: VisualIdentityConfig;
}

export function AgentSettings({ onUpdate, visualConfig }: AgentSettingsProps) {
  const [activeTab, setActiveTab] = useState<'documents' | 'automation' | 'flows'>('flows');

  const [config, setConfig] = useState<AgentConfig>(() => {
    const initial: AgentConfig = {
      name: `Assistente ${visualConfig?.companyName?.split(' ')[0] || 'Michelin'}`,
      persona: 'Consultor Especialista em Seguros de Automóvel',
      instructions: `Você é um assistente virtual humano e empático da ${visualConfig?.companyName || 'Michelin Seguros'}. 

REGRA DE OURO (OBRIGATÓRIA):
- Faça apenas UMA pergunta por vez.
- Nunca solicite múltiplas informações na mesma mensagem.
- Sempre aguarde a resposta do cliente antes de avançar para a próxima pergunta.

📌 ESTRUTURA DE CONVERSA:
Conduza a conversa em etapas sequenciais:
1. Quebra de gelo + contexto
2. Identificação da necessidade
3. Coleta de dados (um por vez)
4. Validação
5. Fechamento ou avanço

📌 REGRA DE FORMATAÇÃO:
- Mensagens curtas (máx. 2–3 linhas)
- Linguagem simples (estilo WhatsApp)
- Sempre terminar com pergunta
- Nunca listar vários itens na mesma mensagem

📌 FLUXO IDEAL (PASSO A PASSO):
1. ABERTURA: “Olá, tudo bem? Vou te ajudar a cotar seu seguro rapidinho 👌” -> Pergunta: “Seu seguro é renovação ou seria um seguro novo?”
2. EXPERIÊNCIA: (Se renovação) Pergunta: “Você ainda tem a apólice ou sabe quando vence?”
3. COLETA: 
   - Pergunta 1: “Qual a placa do veículo?” (aguarda)
   - Pergunta 2: “Perfeito 👍 Qual o seu CPF?” (aguarda)
   - Pergunta 3: “E o CEP onde o carro fica à noite?” (aguarda)
4. OTIMIZAÇÃO: “Se preferir, pode me mandar a CNH e o documento do carro que eu agilizo tudo pra você”

📌 REGRA DE ENGAJAMENTO:
Se o cliente demorar, envie um lembrete leve: “Conseguiu ver pra mim a placa? Assim já adianto sua cotação aqui 👍”

📌 REGRA DE CONTROLE DE ANSIEDADE:
Nunca demonstrar urgência excessiva ou pedir muitos dados de uma vez. Use a ferramenta 'update_lead_info' silenciosamente sempre que coletar um dado.`,
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      whatsappEnabled: false,
      extraction: {
        name: 'Analisador de Documentos',
        persona: 'Especialista em OCR e Extração de Dados',
        instructions: `Sua missão única é extrair dados deste documento com precisão militar.
        
# DOCUMENTOS SUPORTADOS:
1. CNH: Localize NOME (Top), CPF (Abaixo do nome), DATA NASCIMENTO (Ao lado do CPF).
2. CRLV/CRV: Localize plate (Placa), chassis (Chassi), ownerName (Nome do Proprietário), ownerCpfCnpj (CPF/CNPJ do Proprietário).
3. APÓLICE: Localize insuranceExpiry (Vencimento), name (Segurado), plate (Placa).

# REGRAS DE OURO:
- Se Proprietário for diferente do Cliente, defina isOwnerDriver: false.
- Use sempre o formato DD/MM/AAAA para datas.
- Extraia apenas números para CPF e Chassis.`,
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini'
      },
      followUps: [],
      scheduling: {
        timezone: 'America/Sao_Paulo',
        enabled: true
      },
      isActive: true, // Always active
      classificationRules: `Analise o comportamento e histórico para calcular o SCORE (0-10) e a TEMPERATURA:

PONTOS POSITIVOS (+):
- Pediu cotação: +3
- Enviou dados (CPF, Placa, etc): +3
- Urgência ("preciso hoje", "vence logo"): +2
- Responde rápido (< 5 min): +2
- Perguntou preço/condições: +1

PONTOS NEGATIVOS (-):
- Demora (> 1 hora): -2
- Parou de responder: -3
- Recusa enviar dados: -2

CLASSIFICAÇÃO:
- 0 a 3: 'frio'
- 4 a 7: 'morno'
- 8 a 10: 'quente'`,
      automaticActions: `🔥 LEAD QUENTE (Score 8-10):
- Prioridade máxima no tom de voz.
- Sugira fechamento imediato e solicite dados finais (CNH/CRV).
- Seja direto e persuasivo.

⚠️ LEAD MORNO (Score 4-7):
- Continue o atendimento consultivo.
- Foque em educar o cliente sobre os benefícios da Michelin Seguros.
- Incentive o envio de dados para cotação.

❄️ LEAD FRIO (Score 0-3):
- Use 'schedule_follow_up' para reengajamento futuro.
- Evite ser invasivo.
- Tente uma abordagem de curiosidade ("Sabia que a Michelin tem um dos melhores índices de satisfação?").`
    };
    try {
      const saved = localStorage.getItem('michelin_agent_config');
      if (saved) {
        const parsed = JSON.parse(saved) as AgentConfig;
        
        // Sanitize model names to avoid 404s on OpenRouter and GEMINI BLOCK
        if (parsed.model === 'anthropic/claude-3.5-sonnet') {
          parsed.model = 'anthropic/claude-3.5-sonnet:beta';
        }
        if (parsed.model?.toLowerCase().includes('gemini')) {
          parsed.model = 'openai/gpt-4o';
        }
        if (parsed.extraction?.model === 'anthropic/claude-3.5-sonnet') {
          parsed.extraction.model = 'anthropic/claude-3.5-sonnet:beta';
        }
        if (parsed.extraction?.model?.toLowerCase().includes('gemini')) {
          parsed.extraction.model = 'openai/gpt-4o';
        }
        
        return { ...initial, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load agent config', e);
    }
    return initial;
  });

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const validatingRef = useRef(false);

  // Removed redundant localStorage synced effects as state is now initialized directly from storage.

  useEffect(() => {
    // Deterministic: no usage polling
  }, [config.provider, config.extraction?.provider, activeTab]);

  const handleSaveOrKey = async () => {
    // Deterministic mode: key management removed from here
    return;
  };

  const handleSelectProvider = async (provider: 'openrouter') => {
    const defaultModel = activeTab === 'documents' ? 'openai/gpt-4o' : 'openai/gpt-4o-mini';

    if (activeTab === 'documents') {
      setConfig(p => ({ 
        ...p, 
        extraction: { ...(p.extraction || { name: 'Analisador de Documentos', persona: 'Especialista em OCR e Extração de Dados', instructions: 'Sua tarefa é extrair com precisão máxima...', provider: 'openrouter', model: 'openai/gpt-4o-mini' }), provider: 'openrouter', model: defaultModel } 
      }));
    } else {
      setConfig(p => ({ ...p, provider: 'openrouter', model: defaultModel }));
    }
  };

  const handleModelChange = (model: string) => {
    setConfig(prev => {
      if (activeTab === 'documents') {
        return {
          ...prev,
          extraction: { ...(prev.extraction || { name: 'Analisador de Documentos', persona: 'Especialista em OCR e Extração de Dados', instructions: '...', provider: 'openrouter', model: 'openai/gpt-4o-mini' }), model }
        };
      } else {
        return { ...prev, model };
      }
    });
  };

  const handleSave = useCallback(async (configToSave: AgentConfig) => {
    setAutoSaveStatus('saving');
    try {
      // 1. Sync to LocalStorage (Immediate UI fallback)
      localStorage.setItem('michelin_agent_config', JSON.stringify(configToSave));
      
      // 2. Sync to Firestore via DataService (Global sync)
      await DataService.update('config', 'agent', configToSave);
      
      if (onUpdate) onUpdate(configToSave);
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save agent config to DataService:', error);
      // Fallback: already in localStorage
      if (onUpdate) onUpdate(configToSave);
      setAutoSaveStatus('error');
    }
  }, [onUpdate]);

  useEffect(() => {
    const timer = setTimeout(() => {
       handleSave(config);
    }, 2000);

    return () => clearTimeout(timer);
  }, [config, handleSave]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setConfig(prev => {
      let newConfig: AgentConfig;
      
      if (activeTab === 'documents' && (name === 'name' || name === 'persona' || name === 'instructions')) {
        newConfig = { 
          ...prev, 
          extraction: { ...(prev.extraction || { name: 'Analisador de Documentos', persona: 'Especialista em OCR e Extração de Dados', instructions: '...', provider: 'openrouter', model: 'openai/gpt-4o-mini' }), [name]: val } 
        };
      } else {
        newConfig = { ...prev, [name]: val, isActive: true }; // Force isActive
      }
      
      // Auto-save if it's the whatsappEnabled toggle
      if (name === 'whatsappEnabled') {
        localStorage.setItem('michelin_agent_config', JSON.stringify(newConfig));
        DataService.update('config', 'agent', newConfig).catch(e => {
          console.warn('Silent sync fail via DataService', e);
        });
        if (onUpdate) onUpdate(newConfig);
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      }
      
      return newConfig;
    });
  };

  const handleAddFollowUp = () => {
    const newFollowUp = {
      id: Math.random().toString(36).substring(2, 9),
      description: 'Lembrete de Cotação',
      daysDelay: 1,
      hoursDelay: 0,
      condition: "status == 'Novo Lead'",
      template: 'Oi! Conseguiu ver minha última mensagem? Ainda estou com sua cotação quase pronta aqui 📝',
      windows: [
        { start: '07:00', end: '12:00', label: 'Manhã' },
        { start: '13:00', end: '18:00', label: 'Tarde' }
      ]
    };
    setConfig(prev => ({
      ...prev,
      followUps: [...prev.followUps, newFollowUp]
    }));
  };

  const handleRemoveFollowUp = (id: string) => {
    setConfig(prev => ({
      ...prev,
      followUps: prev.followUps.filter(f => f.id !== id)
    }));
  };

  const handleUpdateFollowUp = (id: string, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      followUps: prev.followUps.map(f => f.id === id ? { ...f, [field]: value } : f)
    }));
  };

  const handleUpdateFollowUpWindow = (followUpId: string, windowIndex: number, field: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      followUps: prev.followUps.map(fu => {
        if (fu.id === followUpId) {
          const newWindows = [...fu.windows];
          newWindows[windowIndex] = { ...newWindows[windowIndex], [field]: value };
          return { ...fu, windows: newWindows };
        }
        return fu;
      })
    }));
  };

  return (
    <div className="flex flex-col min-h-full font-sans">
      {/* Horizontal Tab Bar */}
      <nav className="flex-shrink-0 sticky top-0 z-10 bg-[#050505] border-b border-white/5 px-2 flex items-center overflow-x-auto">
        <button
          onClick={() => setActiveTab('flows')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeTab === 'flows' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <Zap className="w-3.5 h-3.5 flex-shrink-0" /> Fluxos Inteligentes
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeTab === 'documents' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0" /> Extração de Docs
        </button>
        <button
          onClick={() => setActiveTab('automation')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeTab === 'automation' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <History className="w-3.5 h-3.5 flex-shrink-0" /> Automação & Follow-up
        </button>

        <div className="ml-auto flex items-center gap-3 pl-4 py-2 flex-shrink-0">
          <AnimatePresence>
            {autoSaveStatus !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest",
                  autoSaveStatus === 'saving' ? "bg-brand-black text-gold-deep border-gold-deep/20" :
                  autoSaveStatus === 'saved' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                  "bg-red-500/10 text-red-500 border-red-500/20"
                )}
              >
                {autoSaveStatus === 'saving' ? (
                  <><RefreshCcw className="w-2 h-2 animate-spin" /> Salvando...</>
                ) : autoSaveStatus === 'saved' ? (
                  <><CheckCircle2 className="w-2 h-2" /> Salvo</>
                ) : (
                  <><ShieldAlert className="w-2 h-2" /> Erro</>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <Zap className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Always-On</span>
          </div>
        </div>
      </nav>

      {/* Dynamic Content Area */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-8 space-y-6">
          <div>
          {activeTab === 'flows' ? (
            <div className="space-y-6">
              <section className="bg-brand-dark p-3 md:p-4 rounded-[1.5rem] border border-gold-deep/20 shadow-lg space-y-3">
                <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
                  <ShieldCheck className="w-5 h-5 text-gold-deep" />
                  <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Modelo & Performance</h3>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-brand-black/60 rounded-2xl border border-white/5">
                    <div className="mb-4 pb-4 border-b border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-white uppercase tracking-widest">WhatsApp Ativo</p>
                          <p className="text-[8px] text-slate-500 font-medium">Respostas automáticas via IA</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            name="whatsappEnabled"
                            checked={config.whatsappEnabled}
                            onChange={handleChange}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-deep transition-all"></div>
                        </label>
                      </div>
                    </div>

                    {config.provider === 'openrouter' && (
                      <div className="mb-4 p-3 bg-brand-black/40 border border-white/5 rounded-xl">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-bold text-gold-light uppercase tracking-widest flex items-center gap-2">
                             <Key className="w-3 h-3" />
                             Arquetipo de Conexão: Determinístico
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="text-[9px] font-bold text-gold-light uppercase mb-3 tracking-widest">Flow Engine</p>
                    <div className="grid grid-cols-1 gap-2 mb-4">
                      <button
                        onClick={() => handleSelectProvider('openrouter')}
                        className={cn(
                          "py-2 rounded-xl text-[9px] font-bold uppercase transition-all border flex items-center justify-center gap-1",
                          "bg-gold-deep/20 border-gold-deep text-gold-deep"
                        )}
                      >
                        OpenRouter (Ativo)
                      </button>
                    </div>

                    {quotaError && (
                      <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
                        <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{quotaError}</p>
                        </div>
                      </div>
                    )}

                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Modelo Ativo</p>
                    
                    <div className="space-y-2">
                        <select
                          value={config.model}
                          onChange={(e) => handleModelChange(e.target.value)}
                          className="w-full px-3 py-2 bg-brand-black border border-white/5 rounded-xl text-xs font-bold text-gold-deep focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep outline-none appearance-none cursor-pointer"
                        >
                          <optgroup label="Recomendados (Estáveis)">
                             <option value="openai/gpt-4o-mini">GPT-4o Mini (Sales Primary)</option>
                             <option value="openai/gpt-4o">GPT-4o (Alta Performance)</option>
                             <option value="anthropic/claude-3-haiku">Claude Haiku (Resiliência)</option>
                          </optgroup>
                          <optgroup label="OpenAI">
                            <option value="openai/gpt-4o">GPT-4o</option>
                          </optgroup>
                          <optgroup label="Anthropic">
                            <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku</option>
                            <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
                          </optgroup>
                        </select>
                      </div>
                  </div>
                </div>
              </section>
              <FlowEngine />
            </div>
          ) : activeTab === 'documents' ? (
            <>
              <section className="bg-brand-dark p-3 md:p-4 rounded-[1.5rem] border border-gold-deep/20 shadow-lg space-y-3 mb-6">
                <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
                  <ShieldCheck className="w-5 h-5 text-gold-deep" />
                  <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Modelo & Performance (Extração)</h3>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-brand-black/60 rounded-2xl border border-white/5">
                    <p className="text-[9px] font-bold text-gold-light uppercase mb-3 tracking-widest">Motor de Extração</p>
                    <div className="grid grid-cols-1 gap-2 mb-4">
                      <button
                        onClick={() => handleSelectProvider('openrouter')}
                        className={cn(
                          "py-2 rounded-xl text-[9px] font-bold uppercase transition-all border flex items-center justify-center gap-1",
                          "bg-gold-deep/20 border-gold-deep text-gold-deep"
                        )}
                      >
                        OpenRouter (Ativo)
                      </button>
                    </div>

                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Modelo Ativo para OCR</p>
                    
                    <div className="space-y-2">
                      <select
                        value={config.extraction?.model || config.model}
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-full px-3 py-2 bg-brand-black border border-white/5 rounded-xl text-xs font-bold text-gold-deep focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep outline-none appearance-none cursor-pointer"
                      >
                        <optgroup label="Recomendados (Document AI)">
                           <option value="gpt-4o">GPT-4o (Precisão Máxima)</option>
                           <option value="openai/gpt-4o-mini">GPT-4o Mini (Alta Velocidade)</option>
                           <option value="mistralai/mistral-small-24b-instruct-2501">Mistral Small (Resiliência)</option>
                        </optgroup>
                        <optgroup label="Outros (Suporte Vision)">
                          <option value="openai/gpt-4o">GPT-4o</option>
                          <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-brand-dark p-6 md:p-8 rounded-[2.5rem] border border-gold-deep/20 shadow-xl space-y-6">
                <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
                  <Sparkles className="w-5 h-5 text-gold-deep" />
                  <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">
                    Identidade do Agente (Documentos)
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-300 uppercase ml-1 tracking-wider">Nome de Exibição</label>
                    <div className="relative">
                      <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        name="name"
                        value={config.extraction?.name || 'Analisador de Documentos'}
                        onChange={handleChange}
                        placeholder="Ex: Assistente Michelin"
                        className="w-full pl-10 pr-4 py-3 bg-brand-black border border-white/5 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep text-white text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-300 uppercase ml-1 tracking-wider">Persona / Especialidade</label>
                    <div className="relative">
                      <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        name="persona"
                        value={config.extraction?.persona || 'Especialista em OCR e Extração de Dados'}
                        onChange={handleChange}
                        placeholder="Ex: Consultor de Seguros Auto"
                        className="w-full pl-10 pr-4 py-3 bg-brand-black border border-white/5 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep text-white text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-300 uppercase ml-1 tracking-wider">Instruções de Sistema (Prompt)</label>
                  <textarea 
                    name="instructions"
                    value={config.extraction?.instructions || 'Sua tarefa é extrair com precisão máxima todos os campos do documento fornecido...'}
                    onChange={handleChange}
                    rows={6}
                    placeholder="Descreva detalhadamente como o agente deve se comportar..."
                    className="w-full p-4 bg-brand-black border border-white/5 rounded-2xl focus:ring-2 focus:ring-gold-deep/20 focus:border-gold-deep text-white text-sm font-medium leading-relaxed resize-none"
                  />
                  <p className="text-[9px] text-slate-500 mt-1 italic italic-medium px-2 italic text-left">
                    Defina como a IA deve extrair e validar os campos dos documentos (Placa, CPF, etc).
                  </p>
                </div>
              </section>

              <div className="p-6 bg-gold-deep/5 rounded-[2rem] border border-gold-deep/10 flex items-start gap-4">
                <Info className="w-6 h-6 text-gold-deep shrink-0" />
                <div>
                    <h4 className="text-xs font-bold text-gold-light uppercase mb-1">Dica de Extração</h4>
                    <p className="text-[11px] text-white/70 leading-relaxed font-bold bg-gold-deep/10 p-2 rounded-lg">
                      O Agente de Documentos é especializado em ler fotos de CNH, CRV e Apólices. Recomendamos o **Claude 3.5 Sonnet** (via OpenRouter) para uma visão computacional superior em documentos complexos.
                    </p>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <section className="bg-brand-dark p-6 md:p-8 rounded-[2.5rem] border border-gold-deep/20 shadow-xl space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
                    <History className="w-5 h-5 text-gold-deep" />
                    <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Sequências de Follow-up</h3>
                  </div>
                  <button 
                    onClick={handleAddFollowUp}
                    className="flex items-center gap-2 px-4 py-2 bg-gold-deep/10 hover:bg-gold-deep/20 text-gold-deep rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Novo Follow-up
                  </button>
                </div>

                <div className="space-y-4">
                  {config.followUps.length === 0 ? (
                    <div className="text-center py-12 px-6 border-2 border-dashed border-white/5 rounded-[2rem]">
                      <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Nenhum follow-up configurado</p>
                      <p className="text-[10px] text-slate-600 mt-2">Clique em "Novo Follow-up" para criar uma regra de retorno automático.</p>
                    </div>
                  ) : (
                    config.followUps.map((fu) => (
                      <div key={fu.id} className="p-6 bg-brand-black/60 border border-white/5 rounded-3xl space-y-6 group relative">
                        <button 
                          onClick={() => handleRemoveFollowUp(fu.id)}
                          className="absolute top-6 right-6 p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Descrição Interna</label>
                            <input 
                              type="text" 
                              value={fu.description}
                              onChange={(e) => handleUpdateFollowUp(fu.id, 'description', e.target.value)}
                              className="w-full px-4 py-2.5 bg-brand-black border border-white/5 rounded-xl text-xs text-white"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Dias de Atraso</label>
                              <input 
                                type="number" 
                                value={fu.daysDelay}
                                onChange={(e) => handleUpdateFollowUp(fu.id, 'daysDelay', parseInt(e.target.value))}
                                className="w-full px-4 py-2.5 bg-brand-black border border-white/5 rounded-xl text-xs text-white"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Horas de Atraso</label>
                              <input 
                                type="number" 
                                value={fu.hoursDelay}
                                onChange={(e) => handleUpdateFollowUp(fu.id, 'hoursDelay', parseInt(e.target.value))}
                                className="w-full px-4 py-2.5 bg-brand-black border border-white/5 rounded-xl text-xs text-white"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Condição de Gatilho (Status)</label>
                          <select 
                            value={fu.condition}
                            onChange={(e) => handleUpdateFollowUp(fu.id, 'condition', e.target.value)}
                            className="w-full px-4 py-2.5 bg-brand-black border border-white/5 rounded-xl text-xs text-gold-deep font-bold"
                          >
                            <option value="status == 'Novo Lead'">Se Status for "Novo Lead"</option>
                            <option value="status == 'Em Atendimento'">Se Status for "Em Atendimento"</option>
                            <option value="status == 'Aguardando Documento'">Se Status for "Aguardando Documento"</option>
                            <option value="status == 'Em Cotação'">Se Status for "Em Cotação"</option>
                            <option value="status == 'Negociação'">Se Status for "Negociação"</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Template da Mensagem (WhatsApp)</label>
                          <textarea 
                            value={fu.template}
                            onChange={(e) => handleUpdateFollowUp(fu.id, 'template', e.target.value)}
                            rows={3}
                            className="w-full p-4 bg-brand-black border border-white/5 rounded-2xl text-xs text-white leading-relaxed resize-none"
                            placeholder="Escreva a mensagem que o agente enviará..."
                          />
                        </div>

                        <div className="pt-4 border-t border-white/5">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                             <Clock className="w-3 h-3" />
                             Janelas de Horário para este Follow-up
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {fu.windows.map((window, wIdx) => (
                              <div key={wIdx} className="p-3 bg-brand-black/40 border border-white/5 rounded-xl space-y-3">
                                <input 
                                  type="text"
                                  value={window.label}
                                  onChange={(e) => handleUpdateFollowUpWindow(fu.id, wIdx, 'label', e.target.value)}
                                  className="bg-transparent border-none p-0 text-[8px] font-bold uppercase tracking-widest w-full outline-none text-gold-light"
                                />
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="time" 
                                    value={window.start}
                                    onChange={(e) => handleUpdateFollowUpWindow(fu.id, wIdx, 'start', e.target.value)}
                                    className="bg-transparent border border-white/5 rounded px-1 text-[9px] text-white"
                                  />
                                  <span className="text-slate-600">às</span>
                                  <input 
                                    type="time" 
                                    value={window.end}
                                    onChange={(e) => handleUpdateFollowUpWindow(fu.id, wIdx, 'end', e.target.value)}
                                    className="bg-transparent border border-white/5 rounded px-1 text-[9px] text-white"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="bg-brand-dark p-6 md:p-8 rounded-[2.5rem] border border-gold-deep/20 shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
                    <CalendarRange className="w-5 h-5 text-gold-deep" />
                    <h3 className="text-sm font-bold text-gold-light uppercase tracking-widest">Configurações Globais de Agendamento</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={config.scheduling?.enabled ?? true}
                        onChange={(e) => setConfig(prev => ({ 
                          ...prev, 
                          scheduling: { ...(prev.scheduling || { timezone: 'America/Sao_Paulo' }), enabled: e.target.checked } 
                        }))}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gold-deep transition-all"></div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5">
                  <Globe className="w-4 h-4 text-slate-500" />
                  <div className="flex-1">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Fuso Horário</p>
                    <select 
                      value={config.scheduling?.timezone || 'America/Sao_Paulo'}
                      onChange={(e) => setConfig(prev => ({ 
                        ...prev, 
                        scheduling: { ...(prev.scheduling || { enabled: true }), timezone: e.target.value } 
                      }))}
                      className="bg-transparent border-none p-0 text-[11px] font-bold text-gold-deep outline-none cursor-pointer"
                    >
                      <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                      <option value="America/Manaus">Manaus (GMT-4)</option>
                      <option value="America/New_York">New York (GMT-5)</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
