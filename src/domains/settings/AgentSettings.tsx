import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Sparkles, ShieldCheck, Zap, ShieldAlert, Globe, RefreshCcw, Clock, Plus, Trash2, CalendarRange, History, CheckCircle2, User, Brain, Shield, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, RotateCcw, Layers, Lock, RefreshCw, AlertTriangle } from 'lucide-react';
import { AgentConfig, SalesBlocks, SalesBlockKey, ResolvedAgentConfig } from '../../types';
import { cn } from '../../lib/utils';
import { DataService } from '../../services/DataService';
import { templateService } from '../../services/TemplateService';
import { usePermissions } from '../../contexts/PermissionsContext';

import { VisualIdentityConfig } from '../../types';

// ─── Default sales block content (consolidated from 19 flows) ─────────────────

const DEFAULT_SALES_BLOCKS: SalesBlocks = {
  quebra_de_gelo: `Adapte a saudação ao estilo da primeira mensagem do cliente.
- Se o cliente for informal ("oi", "ola"): responda de forma descontraída e use o nome assim que souber.
- Se o cliente for formal: mantenha tom profissional.
- Nunca comece com "Olá, eu sou uma IA".
- Exemplo informal: "Oi! Tudo bem? 😊 Pode contar comigo pra cotar seu seguro!"
- Exemplo formal: "Olá! Fico à disposição para ajudá-lo com a cotação do seu seguro."`,

  primeiro_atendimento: `Primeira interação com o lead:
1. Identifique se a pessoa já tem interesse claro ou está apenas explorando.
2. Capture o nome de forma natural — não use formulários.
3. Descubra se é renovação ou seguro novo com UMA pergunta.
4. Não pareça um robô: varie as formas de perguntar.
5. Se o cliente não souber o que quer, ajude a identificar a necessidade antes de pedir dados.`,

  reducao_atrito: `Regras para reduzir fricção na coleta de dados:
- Faça UMA pergunta por mensagem. Nunca peça CPF, placa e CEP ao mesmo tempo.
- Quando pedir documento (CNH, CRLV), explique em 1 frase por que precisa.
- Se o cliente hesitar, reduza: "Pode me mandar só a foto da CNH? Já consigo calcular com isso."
- Nunca use linguagem de formulário ("preencha o campo X").
- Confirme cada dado recebido com uma resposta curta antes de pedir o próximo.`,

  gatilhos_mentais: `Use estes gatilhos de forma natural, nunca forçada:
1. PROVA SOCIAL: "A maioria dos nossos clientes com esse perfil escolheu..."
2. URGÊNCIA REAL: "Sua apólice vence em X dias — já calculei tudo pra não perder o desconto de renovação."
3. AUTORIDADE: "Trabalho com 15 seguradoras e já negociei casos parecidos com o seu."
4. ESCASSEZ: "Essa condição especial está disponível até o fim do mês."
5. RECIPROCIDADE: "Já fiz o cálculo nas 15 seguradoras — só preciso de um dado pra fechar."
6. COMPROMETIMENTO: "Você mesmo disse que precisa renovar logo — posso adiantar tudo hoje."
7. AFEIÇÃO: Use o nome do cliente ao longo da conversa.
8. BENEFÍCIO CONCRETO: Sempre traduza preço em benefício ("por R$X você garante...".).
9. PERDA: "Sem seguro, uma batida pode custar 10x esse valor."
10. CURIOSIDADE: "Posso te mostrar uma opção que a maioria das pessoas não conhece?"`,

  objecoes: `Como tratar as principais objeções:
- "Está caro": "Entendo! Me conta o que você esperava pagar? Assim busco a opção mais próxima."
- "Vou pensar": "Claro! O que ficou de dúvida? Posso esclarecer agora."
- "Já tenho seguro": "Ótimo! Posso fazer uma comparação gratuita — às vezes economizamos bastante na renovação."
- "Não confio em seguro": "Faz sentido essa preocupação. Me conta o que te preocupa?"
- "Meu vizinho pagou menos": "Valores variam por perfil. Deixa eu verificar o que posso fazer pelo seu caso."
- "Não tenho tempo": "São menos de 2 minutos — me manda só a foto da CNH e eu resolvo o resto."
- "Vou pesquisar em outros lugares": "Pesquise sim! Mas me dá uma chance de mostrar o que tenho antes — posso surpreender."
Regra geral: acolha → valide a preocupação → reposicione com benefício → faça UMA pergunta.`,

  venda_por_cenario: `Use cenários de risco para criar consciência de valor:
- Batida leve em estacionamento: "Uma lataria amassada sem seguro pode custar R$3.000. Com seguro, R$0."
- Roubo: "No seu bairro, o índice de roubo de veículos é alto. O seguro cobre valor de mercado."
- Chuva/enchente: "Dano por alagamento cobre motor e elétrica — uma das coberturas mais usadas no Brasil."
- Carro financiado: "Com alienação fiduciária, o banco exige seguro. Prefere escolher ou deixar o banco escolher por você?"
- Condutor jovem em casa: "Com condutor de 18-25 anos no perfil, o risco sobe — e o seguro te protege sem surpresas."
Adapte o cenário ao perfil do lead. Nunca invente estatísticas.`,

  urgencia_suave: `Reengajamento de leads inativos (sem pressão):
- Abordagem leve: "Oi [nome]! Ainda estou com sua cotação por aqui caso queira retomar 😊"
- Depois de 3+ dias: "Passando pra saber se ainda posso ajudar com o seguro — sem compromisso!"
- Nunca: "Por que você sumiu?" ou "Já faz X dias que não responde."
- Use 1 gatilho por mensagem de reengajamento — nunca empilhe gatilhos.
- Se não responder após 2 tentativas, pause e espere o próximo ciclo de follow-up.`,

  fechamento: `Como conduzir o lead ao fechamento:
1. Perguntas binárias: "Prefere pagar mensal ou anual?" — não deixe em aberto.
2. Confirmação do interesse: "Então posso confirmar que você quer a opção X da [seguradora]?"
3. Próximo passo claro: "Vou encaminhar pra finalização — você receberá a apólice no seu e-mail em até 24h."
4. Não peça decisão genérica: evite "O que você acha?" — ofereça opções concretas.
5. Se hesitar no final: "O que falta pra você se sentir seguro para fechar hoje?"
6. Celebre o fechamento de forma breve: "Ótima escolha! ✅ Seu carro já está protegido."`,
};

const DEFAULT_HARD_RULES = {
  blockExpiredLicense: true,
  requireCrlvForQuote: true,
  maxInactivityHours: 1,
  escalateToHumanScore: 8,
};

const SALES_BLOCK_META: { key: SalesBlockKey; label: string; description: string; icon: React.ElementType }[] = [
  { key: 'quebra_de_gelo', label: 'Quebra de Gelo', description: 'Como iniciar a conversa adaptando ao estilo do cliente', icon: MessageSquare },
  { key: 'primeiro_atendimento', label: 'Primeiro Atendimento', description: 'Capturar nome, identificar intenção, criar vínculo sem parecer formulário', icon: User },
  { key: 'reducao_atrito', label: 'Redução de Atrito', description: 'Regras para coletar dados sem pressionar o cliente', icon: Zap },
  { key: 'gatilhos_mentais', label: 'Gatilhos Mentais', description: '10 gatilhos com exemplos e quando usar cada um', icon: Brain },
  { key: 'objecoes', label: 'Tratamento de Objeções', description: 'Como tratar as principais objeções com scripts testados', icon: ShieldCheck },
  { key: 'venda_por_cenario', label: 'Venda por Cenário', description: 'Cenários de risco para criar consciência de valor', icon: Sparkles },
  { key: 'urgencia_suave', label: 'Urgência Suave', description: 'Como reengajar leads inativos sem pressionar', icon: Clock },
  { key: 'fechamento', label: 'Fechamento', description: 'Perguntas binárias e passos para conduzir ao sim', icon: CheckCircle2 },
];

interface AgentSettingsProps {
  onUpdate?: (config: AgentConfig) => void;
  visualConfig?: VisualIdentityConfig;
}

const SEGMENT_LABELS: Record<string, string> = {
  corretora_seguros: 'Corretora de Seguros',
  imobiliaria: 'Imobiliária',
  clinica_odontologica: 'Clínica Odontológica',
  concessionaria: 'Concessionária',
  custom: 'Personalizado',
};

export function AgentSettings({ onUpdate, visualConfig }: AgentSettingsProps) {
  const { userProfile } = usePermissions();
  const [activeTab, setActiveTab] = useState<'identity' | 'sales' | 'rules' | 'template'>('identity');
  const [resolvedConfig, setResolvedConfig] = useState<ResolvedAgentConfig | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [expandedBlock, setExpandedBlock] = useState<SalesBlockKey | null>(null);

  useEffect(() => {
    if (activeTab !== 'template' || !userProfile?.organizationId) return;
    setTemplateLoading(true);
    setTemplateError(null);
    templateService.resolveConfig(userProfile.organizationId)
      .then(setResolvedConfig)
      .catch(() => setTemplateError('Não foi possível carregar o template do agente.'))
      .finally(() => setTemplateLoading(false));
  }, [activeTab, userProfile?.organizationId]);

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
- Tente uma abordagem de curiosidade ("Sabia que a Michelin tem um dos melhores índices de satisfação?").`,

      // New AgentBrain fields
      useLLMAgent: false,
      agentPersona: {
        name: 'Ana',
        role: 'Consultora de Seguros',
        tone: 'amigável, consultiva e direta',
        usesFormalTreatment: false,
      },
      llm: {
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        maxTokens: 300,
        temperature: 0.75,
      },
      salesBlocks: DEFAULT_SALES_BLOCKS,
      hardRules: DEFAULT_HARD_RULES,
      version: 1,
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

        // Detect and fix mojibake in salesBlocks (double-encoded UTF-8)
        const isMojibake = (s: string) => /Ã[§£©¡³ºª­]|â€|Ã‡|ÃŠ|Ã‰|Ãµ|Ãƒ/.test(s);
        if (parsed.salesBlocks) {
          const sample = Object.values(parsed.salesBlocks).join('');
          if (isMojibake(sample)) {
            parsed.salesBlocks = DEFAULT_SALES_BLOCKS;
            // Flush corrected value to localStorage immediately
            try {
              const corrected = { ...initial, ...parsed };
              localStorage.setItem('michelin_agent_config', JSON.stringify(corrected));
            } catch (_) {}
          }
        }

        return { ...initial, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load agent config', e);
    }
    return initial;
  });

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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
      const newConfig: AgentConfig = { ...prev, [name]: val, isActive: true };
      
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

  // Helper to update a sales block
  const handleSalesBlockChange = (key: SalesBlockKey, value: string) => {
    setConfig(prev => ({
      ...prev,
      salesBlocks: { ...(prev.salesBlocks ?? DEFAULT_SALES_BLOCKS), [key]: value },
    }));
  };

  // Helper to update a hard rule
  const handleHardRuleChange = (key: keyof typeof DEFAULT_HARD_RULES, value: boolean | number) => {
    setConfig(prev => ({
      ...prev,
      hardRules: { ...(prev.hardRules ?? DEFAULT_HARD_RULES), [key]: value },
    }));
  };

  // Helper to update persona
  const handlePersonaChange = (key: string, value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      agentPersona: { ...(prev.agentPersona ?? { name: 'Ana', role: 'Consultora de Seguros', tone: 'amigável, consultiva e direta', usesFormalTreatment: false }), [key]: value },
    }));
  };

  return (
    <div className="flex flex-col min-h-full font-sans">
      {/* Horizontal Tab Bar */}
      <nav className="flex-shrink-0 sticky top-0 z-10 bg-[#050505] border-b border-white/5 px-2 flex items-center overflow-x-auto">
        <button
          onClick={() => setActiveTab('identity')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeTab === 'identity' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <User className="w-3.5 h-3.5 flex-shrink-0" /> Identidade
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeTab === 'sales' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <Brain className="w-3.5 h-3.5 flex-shrink-0" /> Comportamento de Vendas
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeTab === 'rules' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <Shield className="w-3.5 h-3.5 flex-shrink-0" /> Regras e Limites
        </button>
        <button
          onClick={() => setActiveTab('template')}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2",
            activeTab === 'template' ? "text-gold-deep border-gold-deep" : "text-white/40 hover:text-white border-transparent"
          )}
        >
          <Layers className="w-3.5 h-3.5 flex-shrink-0" /> Template e Segmento
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
          {activeTab === 'identity' ? (
            /* ── ABA 1: IDENTIDADE ─────────────────────────────────────────── */
            <div className="space-y-6">
              {/* LLM mode toggle */}
              <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Modo de Resposta com IA</p>
                    <p className="text-[9px] text-white/30 mt-0.5">Ativa o AgentBrain — respostas geradas por LLM com guardrails</p>
                  </div>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, useLLMAgent: !prev.useLLMAgent }))}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                      config.useLLMAgent
                        ? "bg-gold-deep/10 border-gold-deep text-gold-deep"
                        : "bg-white/5 border-white/10 text-white/40"
                    )}
                  >
                    {config.useLLMAgent ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {config.useLLMAgent ? 'Ativado' : 'Desativado'}
                  </button>
                </div>
                {config.useLLMAgent && (
                  <div className="p-3 bg-gold-deep/5 rounded-xl border border-gold-deep/10 text-[9px] text-gold-deep/70 font-medium">
                    O agente usará o LLM para gerar respostas humanizadas. O funil de vendas permanece determinístico — o LLM apenas redige o texto de cada etapa.
                  </div>
                )}
              </section>

              {/* Persona */}
              <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gold-deep/10 rounded-xl border border-gold-deep/20">
                    <User className="w-4 h-4 text-gold-deep" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Identidade da Agente</p>
                    <p className="text-[9px] text-white/30">Quem o cliente vê conversando com ele</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Nome</label>
                    <input
                      type="text"
                      value={config.agentPersona?.name ?? 'Ana'}
                      onChange={e => handlePersonaChange('name', e.target.value)}
                      placeholder="Ana"
                      className="w-full px-4 py-2.5 bg-[#050505] border border-white/5 rounded-xl text-sm text-white font-medium focus:border-gold-deep/30 focus:ring-2 focus:ring-gold-deep/5 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Cargo / Role</label>
                    <input
                      type="text"
                      value={config.agentPersona?.role ?? 'Consultora de Seguros'}
                      onChange={e => handlePersonaChange('role', e.target.value)}
                      placeholder="Consultora de Seguros"
                      className="w-full px-4 py-2.5 bg-[#050505] border border-white/5 rounded-xl text-sm text-white font-medium focus:border-gold-deep/30 focus:ring-2 focus:ring-gold-deep/5 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Tom de Voz</label>
                  <select
                    value={config.agentPersona?.tone ?? 'amigável, consultiva e direta'}
                    onChange={e => handlePersonaChange('tone', e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#050505] border border-white/5 rounded-xl text-sm text-white font-medium focus:border-gold-deep/30 outline-none appearance-none cursor-pointer"
                  >
                    <option value="amigável, consultiva e direta">Amigável e informal</option>
                    <option value="profissional, formal e precisa">Profissional e formal</option>
                    <option value="consultiva, neutra e objetiva">Consultiva e neutra</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#050505] rounded-xl border border-white/5">
                  <div>
                    <p className="text-[10px] font-bold text-white">Tratamento Formal</p>
                    <p className="text-[9px] text-white/30">Usar Senhor/Senhora em vez do nome direto</p>
                  </div>
                  <button
                    onClick={() => handlePersonaChange('usesFormalTreatment', !(config.agentPersona?.usesFormalTreatment ?? false))}
                    className={cn(
                      "w-11 h-6 rounded-full border relative transition-all flex-shrink-0",
                      config.agentPersona?.usesFormalTreatment
                        ? "bg-gold-deep border-gold-deep"
                        : "bg-white/5 border-white/10"
                    )}
                  >
                    <span className={cn(
                      "absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all",
                      config.agentPersona?.usesFormalTreatment ? "left-[22px]" : "left-[2px]"
                    )} />
                  </button>
                </div>
              </section>

              {/* LLM Config */}
              <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                    <Brain className="w-4 h-4 text-white/50" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Modelo de IA (AgentBrain)</p>
                    <p className="text-[9px] text-white/30">Modelo usado para gerar as respostas da agente</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Modelo</label>
                    <select
                      value={config.llm?.model ?? 'openai/gpt-4o-mini'}
                      onChange={e => setConfig(prev => ({ ...prev, llm: { ...(prev.llm ?? { provider: 'openrouter', maxTokens: 300, temperature: 0.75 }), model: e.target.value } }))}
                      className="w-full px-4 py-2.5 bg-[#050505] border border-white/5 rounded-xl text-sm text-gold-deep font-bold focus:border-gold-deep/30 outline-none appearance-none cursor-pointer"
                    >
                      <optgroup label="Recomendados">
                        <option value="openai/gpt-4o-mini">GPT-4o Mini (Rápido · Custo baixo)</option>
                        <option value="openai/gpt-4o">GPT-4o (Alta performance)</option>
                        <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku (Humanizado)</option>
                        <option value="anthropic/claude-3-haiku">Claude 3 Haiku (Resiliente)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                      Criatividade (Temperature: {config.llm?.temperature ?? 0.75})
                    </label>
                    <input
                      type="range" min="0.3" max="1.0" step="0.05"
                      value={config.llm?.temperature ?? 0.75}
                      onChange={e => setConfig(prev => ({ ...prev, llm: { ...(prev.llm ?? { provider: 'openrouter', model: 'openai/gpt-4o-mini', maxTokens: 300 }), temperature: parseFloat(e.target.value) } }))}
                      className="w-full accent-gold-deep"
                    />
                    <div className="flex justify-between text-[8px] text-white/20 font-bold">
                      <span>Mais consistente</span>
                      <span>Mais criativo</span>
                    </div>
                  </div>
                </div>

                {/* WhatsApp toggle */}
                <div className="flex items-center justify-between p-4 bg-[#050505] rounded-xl border border-white/5">
                  <div>
                    <p className="text-[10px] font-bold text-white">WhatsApp Ativo</p>
                    <p className="text-[9px] text-white/30">Respostas automáticas via WhatsApp Business</p>
                  </div>
                  <button
                    onClick={() => handleChange({ target: { name: 'whatsappEnabled', type: 'checkbox', checked: !config.whatsappEnabled } } as any)}
                    className={cn(
                      "w-11 h-6 rounded-full border relative transition-all flex-shrink-0",
                      config.whatsappEnabled ? "bg-gold-deep border-gold-deep" : "bg-white/5 border-white/10"
                    )}
                  >
                    <span className={cn(
                      "absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all",
                      config.whatsappEnabled ? "left-[22px]" : "left-[2px]"
                    )} />
                  </button>
                </div>
              </section>
            </div>
          ) : activeTab === 'sales' ? (
            /* ── ABA 2: COMPORTAMENTO DE VENDAS ──────────────────────────────── */
            <div className="space-y-3">
              <div className="p-4 bg-gold-deep/5 rounded-2xl border border-gold-deep/10 text-[10px] text-gold-deep/70 font-medium">
                Estes blocos definem como a agente se comporta em cada etapa da venda. O conteúdo é injetado no prompt do LLM — escreva em linguagem natural, como se fosse um roteiro de comportamento.
              </div>

              {SALES_BLOCK_META.map(({ key, label, description, icon: Icon }) => {
                const isOpen = expandedBlock === key;
                const content = config.salesBlocks?.[key] ?? DEFAULT_SALES_BLOCKS[key];
                return (
                  <div key={key} className="bg-[#0B0B0D] rounded-2xl border border-white/5 overflow-hidden">
                    <button
                      onClick={() => setExpandedBlock(isOpen ? null : key)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="p-1.5 bg-white/5 rounded-lg border border-white/5 flex-shrink-0">
                        <Icon className="w-3.5 h-3.5 text-white/50" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">{label}</p>
                        <p className="text-[9px] text-white/30 truncate">{description}</p>
                      </div>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />}
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 space-y-3 border-t border-white/5 pt-4">
                            <textarea
                              value={content}
                              onChange={e => handleSalesBlockChange(key, e.target.value)}
                              rows={10}
                              className="w-full p-4 bg-[#050505] border border-white/5 rounded-xl text-xs text-white/70 font-medium leading-relaxed resize-none focus:border-gold-deep/20 focus:ring-2 focus:ring-gold-deep/5 outline-none"
                            />
                            <div className="flex items-center justify-end">
                              <button
                                onClick={() => handleSalesBlockChange(key, DEFAULT_SALES_BLOCKS[key])}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" /> Restaurar padrão
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : activeTab === 'rules' ? (
            /* ── ABA 3: REGRAS E LIMITES ──────────────────────────────────────── */
            <div className="space-y-6">
              {/* Hard rules */}
              <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                    <Shield className="w-4 h-4 text-white/50" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Validações Hard</p>
                    <p className="text-[9px] text-white/30">Regras invioláveis que o sistema aplica automaticamente</p>
                  </div>
                </div>

                {[
                  { key: 'blockExpiredLicense' as const, label: 'Bloquear cotação com CNH vencida', desc: 'O agente alerta o cliente e pausa a cotação até regularização' },
                  { key: 'requireCrlvForQuote' as const, label: 'Exigir CRLV antes de enviar proposta', desc: 'Não envia PDF de cotação sem placa e chassis confirmados' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-[#050505] rounded-xl border border-white/5">
                    <div>
                      <p className="text-[10px] font-bold text-white">{label}</p>
                      <p className="text-[9px] text-white/30">{desc}</p>
                    </div>
                    <button
                      onClick={() => handleHardRuleChange(key, !(config.hardRules?.[key] ?? DEFAULT_HARD_RULES[key]))}
                      className={cn(
                        "w-11 h-6 rounded-full border relative transition-all flex-shrink-0",
                        (config.hardRules?.[key] ?? DEFAULT_HARD_RULES[key]) ? "bg-gold-deep border-gold-deep" : "bg-white/5 border-white/10"
                      )}
                    >
                      <span className={cn(
                        "absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all",
                        (config.hardRules?.[key] ?? DEFAULT_HARD_RULES[key]) ? "left-[22px]" : "left-[2px]"
                      )} />
                    </button>
                  </div>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                      Horas de inatividade → Lead Frio
                    </label>
                    <input
                      type="number" min={1} max={48}
                      value={config.hardRules?.maxInactivityHours ?? DEFAULT_HARD_RULES.maxInactivityHours}
                      onChange={e => handleHardRuleChange('maxInactivityHours', parseInt(e.target.value))}
                      className="w-full px-4 py-2.5 bg-[#050505] border border-white/5 rounded-xl text-sm text-white font-medium focus:border-gold-deep/30 outline-none"
                    />
                    <p className="text-[8px] text-white/20">Após X horas sem resposta, o lead é classificado como frio</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                      Score mínimo para acionar atendente
                    </label>
                    <input
                      type="number" min={1} max={10}
                      value={config.hardRules?.escalateToHumanScore ?? DEFAULT_HARD_RULES.escalateToHumanScore}
                      onChange={e => handleHardRuleChange('escalateToHumanScore', parseInt(e.target.value))}
                      className="w-full px-4 py-2.5 bg-[#050505] border border-white/5 rounded-xl text-sm text-white font-medium focus:border-gold-deep/30 outline-none"
                    />
                    <p className="text-[8px] text-white/20">Leads com score ≥ X são sinalizados para atendimento humano</p>
                  </div>
                </div>
              </section>

              {/* Follow-ups */}
              <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                      <History className="w-4 h-4 text-white/50" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-white uppercase tracking-widest">Sequências de Follow-up</p>
                      <p className="text-[9px] text-white/30">Mensagens automáticas por atraso e condição de status</p>
                    </div>
                  </div>
                  <button
                    onClick={handleAddFollowUp}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gold-deep/10 hover:bg-gold-deep/20 text-gold-deep border border-gold-deep/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Novo
                  </button>
                </div>

                {config.followUps.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-2xl">
                    <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Nenhum follow-up configurado</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {config.followUps.map(fu => (
                      <div key={fu.id} className="p-5 bg-[#050505] border border-white/5 rounded-2xl space-y-4 group relative">
                        <button
                          onClick={() => handleRemoveFollowUp(fu.id)}
                          className="absolute top-4 right-4 p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Descrição Interna</label>
                            <input
                              type="text"
                              value={fu.description}
                              onChange={e => handleUpdateFollowUp(fu.id, 'description', e.target.value)}
                              className="w-full px-3 py-2 bg-[#0B0B0D] border border-white/5 rounded-xl text-xs text-white"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Dias</label>
                              <input type="number" value={fu.daysDelay} onChange={e => handleUpdateFollowUp(fu.id, 'daysDelay', parseInt(e.target.value))} className="w-full px-3 py-2 bg-[#0B0B0D] border border-white/5 rounded-xl text-xs text-white" />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Horas</label>
                              <input type="number" value={fu.hoursDelay} onChange={e => handleUpdateFollowUp(fu.id, 'hoursDelay', parseInt(e.target.value))} className="w-full px-3 py-2 bg-[#0B0B0D] border border-white/5 rounded-xl text-xs text-white" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Condição de Gatilho</label>
                          <select value={fu.condition} onChange={e => handleUpdateFollowUp(fu.id, 'condition', e.target.value)} className="w-full px-3 py-2 bg-[#0B0B0D] border border-white/5 rounded-xl text-xs text-gold-deep font-bold">
                            <option value="status == 'Novo Lead'">Status: Novo Lead</option>
                            <option value="status == 'Em Atendimento'">Status: Em Atendimento</option>
                            <option value="status == 'Aguardando Documento'">Status: Aguardando Documento</option>
                            <option value="status == 'Em Cotação'">Status: Em Cotação</option>
                            <option value="status == 'Negociação'">Status: Negociação</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-white/30 uppercase tracking-widest">Template da Mensagem</label>
                          <textarea value={fu.template} onChange={e => handleUpdateFollowUp(fu.id, 'template', e.target.value)} rows={3} className="w-full p-3 bg-[#0B0B0D] border border-white/5 rounded-xl text-xs text-white leading-relaxed resize-none" />
                        </div>

                        <div className="pt-3 border-t border-white/5">
                          <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" /> Janelas de Horário
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {fu.windows.map((window, wIdx) => (
                              <div key={wIdx} className="p-3 bg-[#0B0B0D] border border-white/5 rounded-xl space-y-2">
                                <input type="text" value={window.label} onChange={e => handleUpdateFollowUpWindow(fu.id, wIdx, 'label', e.target.value)} className="bg-transparent border-none p-0 text-[8px] font-bold uppercase tracking-widest w-full outline-none text-gold-deep/60" />
                                <div className="flex items-center gap-2">
                                  <input type="time" value={window.start} onChange={e => handleUpdateFollowUpWindow(fu.id, wIdx, 'start', e.target.value)} className="bg-transparent border border-white/5 rounded px-1 text-[9px] text-white" />
                                  <span className="text-white/20 text-[9px]">às</span>
                                  <input type="time" value={window.end} onChange={e => handleUpdateFollowUpWindow(fu.id, wIdx, 'end', e.target.value)} className="bg-transparent border border-white/5 rounded px-1 text-[9px] text-white" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Scheduling */}
              <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                      <CalendarRange className="w-4 h-4 text-white/50" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-white uppercase tracking-widest">Agendamento Global</p>
                      <p className="text-[9px] text-white/30">Fuso horário para follow-ups e janelas de envio</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, scheduling: { ...(prev.scheduling || { timezone: 'America/Sao_Paulo' }), enabled: !(prev.scheduling?.enabled ?? true) } }))}
                    className={cn(
                      "w-11 h-6 rounded-full border relative transition-all flex-shrink-0",
                      (config.scheduling?.enabled ?? true) ? "bg-gold-deep border-gold-deep" : "bg-white/5 border-white/10"
                    )}
                  >
                    <span className={cn(
                      "absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all",
                      (config.scheduling?.enabled ?? true) ? "left-[22px]" : "left-[2px]"
                    )} />
                  </button>
                </div>

                <div className="flex items-center gap-3 p-4 bg-[#050505] rounded-xl border border-white/5">
                  <Globe className="w-4 h-4 text-white/30" />
                  <div className="flex-1">
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Fuso Horário</p>
                    <select
                      value={config.scheduling?.timezone || 'America/Sao_Paulo'}
                      onChange={e => setConfig(prev => ({ ...prev, scheduling: { ...(prev.scheduling || { enabled: true }), timezone: e.target.value } }))}
                      className="bg-transparent border-none p-0 text-xs font-bold text-gold-deep outline-none cursor-pointer"
                    >
                      <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                      <option value="America/Manaus">Manaus (GMT-4)</option>
                      <option value="America/New_York">New York (GMT-5)</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>
          ) : activeTab === 'template' ? (
            /* ── ABA 4: TEMPLATE E SEGMENTO ──────────────────────────────── */
            <div className="space-y-4">
              {templateLoading && (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-5 h-5 text-gold-deep animate-spin" />
                </div>
              )}

              {templateError && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {templateError}
                </div>
              )}

              {!templateLoading && !resolvedConfig && !templateError && (
                <div className="text-center py-16 space-y-4">
                  <Layers className="w-10 h-10 text-white/20 mx-auto" />
                  <div>
                    <p className="text-white/40 text-sm font-medium">Nenhum template configurado</p>
                    <p className="text-white/20 text-xs mt-1">Complete o wizard de configuração para ativar o agente IA.</p>
                  </div>
                  <button
                    onClick={async () => {
                      setSeeding(true);
                      try { await templateService.seedTemplates(); } catch (_) {}
                      setSeeding(false);
                    }}
                    disabled={seeding}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gold-deep/10 border border-gold-deep/20 text-gold-deep rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gold-deep/20 transition-all disabled:opacity-50"
                  >
                    {seeding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Carregar Templates Padrão
                  </button>
                </div>
              )}

              {!templateLoading && resolvedConfig && (
                <>
                  {/* Segment badge */}
                  <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gold-deep/10 rounded-xl border border-gold-deep/20">
                        <Layers className="w-4 h-4 text-gold-deep" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Template Ativo</p>
                        <p className="text-[9px] text-white/30">Modelo de agente em uso para este tenant</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gold-deep/5 border border-gold-deep/10 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-white">
                          {SEGMENT_LABELS[resolvedConfig.segment] ?? resolvedConfig.segment}
                        </p>
                        <p className="text-[9px] text-white/40 mt-0.5">
                          Template: <span className="text-gold-deep">{resolvedConfig.templateId}</span> · v{resolvedConfig.templateVersion}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider rounded-full">
                        Ativo
                      </span>
                    </div>
                  </section>

                  {/* Locked fields */}
                  {resolvedConfig.lockedFields.length > 0 && (
                    <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                          <Lock className="w-4 h-4 text-white/50" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">Campos Bloqueados</p>
                          <p className="text-[9px] text-white/30">Definidos pela plataforma — não podem ser alterados pelo tenant</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {resolvedConfig.lockedFields.map(f => (
                          <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-mono rounded-lg">
                            <Lock className="w-2.5 h-2.5" />{f}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Platform guardrails */}
                  <section className="bg-[#0B0B0D] rounded-3xl border border-white/5 p-6 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                        <ShieldCheck className="w-4 h-4 text-white/50" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">Guardrails da Plataforma</p>
                        <p className="text-[9px] text-white/30">Regras invioláveis aplicadas em todos os tenants · v{resolvedConfig.guardrails.version}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {resolvedConfig.guardrails.hardProhibitions.slice(0, 4).map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-[9px] text-white/40">
                          <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>{r}
                        </div>
                      ))}
                      {resolvedConfig.guardrails.hardRequirements.slice(0, 3).map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-[9px] text-white/40">
                          <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span>{r}
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Seed button for admins */}
                  {(userProfile as any)?.superadmin && (
                    <section className="bg-[#0B0B0D] rounded-3xl border border-amber-500/10 p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Admin · Re-seed de Templates</p>
                        <p className="text-[9px] text-white/30">Atualiza os templates padrão no Firestore</p>
                      </div>
                      <button
                        onClick={async () => {
                          setSeeding(true);
                          try { await templateService.seedTemplates(); } catch (_) {}
                          setSeeding(false);
                        }}
                        disabled={seeding}
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all disabled:opacity-50"
                      >
                        {seeding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                        Re-seed
                      </button>
                    </section>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
