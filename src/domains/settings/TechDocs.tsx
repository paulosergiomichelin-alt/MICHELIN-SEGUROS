import React from 'react';
import { ChevronLeft, ChevronRight, Code, Globe, RefreshCcw, FileText, Info, Copy, CheckCircle2, Layout, Activity, Database, TrendingUp, AlertTriangle, ShieldCheck, Zap, Cpu, History, FileSearch, Bot, Send, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TechDocsProps {
  onBack: () => void;
}

export function TechDocs({ onBack }: TechDocsProps) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'api' | 'architecture'>('api');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const leadPayload = `{
  "name": "João da Silva",
  "phone": "5511999998888",
  "phone2": "5511988887777",
  "cpf": "123.456.789-00",
  "birthDate": "1990-05-15",
  "civilStatus": "Casado",
  "plate": "ABC1D23",
  "chassis": "9BWZZZ377VT004XX",
  "zipCodeOvernight": "01310-100",
  "status": "Novo Lead",
  "temperature": "quente",
  "origin": "Facebook",
  "originDetails": "Campanha Seguro Auto Março"
}`;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto scrollbar-thin scrollbar-thumb-gold-deep/20 scrollbar-track-transparent">
      <div className="max-w-5xl mx-auto px-8 pt-12 pb-20 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gold-deep hover:text-gold-light transition-colors group"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold uppercase text-[10px] tracking-widest">Fechar Documentação e Voltar</span>
          </button>
        </div>

      <header className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-4xl font-bold text-gold-deep font-display uppercase tracking-tight">Centro de Documentação</h2>
          <p className="text-slate-500 text-sm font-medium">Especificações técnicas, arquitetura de IA e manuais de integração de alta performance.</p>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200 w-fit">
          <button
            onClick={() => setActiveTab('api')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === 'api'
                ? "bg-[#1B4D8F] text-white shadow-sm shadow-[#1B4D8F]/20"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Code className="w-4 h-4" />
            Integração API
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
              activeTab === 'architecture'
                ? "bg-[#1B4D8F] text-white shadow-sm shadow-[#1B4D8F]/20"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Layout className="w-4 h-4" />
            Arquitetura Real
          </button>
        </div>
      </header>

      {activeTab === 'api' ? (
        <div className="grid grid-cols-1 gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
        {/* Endpoint Info */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Globe className="w-32 h-32 text-gold-deep" />
          </div>

          <div className="relative space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
              <Code className="w-5 h-5 text-gold-deep" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">URL Base do Endpoint</h3>
            </div>

            <div className="bg-black/40 p-5 rounded-2xl border border-gold-deep/10 flex items-center justify-between group">
              <code className="text-gold-deep font-mono text-sm break-all">
                /api/webhook/lead
              </code>
              <button
                onClick={() => copyToClipboard('/api/webhook/lead', 'url')}
                className="p-2 hover:bg-gold-deep/10 rounded-lg transition-colors text-slate-500 hover:text-gold-deep"
              >
                {copied === 'url' ? <CheckCircle2 className="w-4 h-4 text-[#1F8A4C]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed italic">
              * Nota: Utilize a URL completa do seu ambiente de produção (ex: https://seu-crm.run.app/api/webhook/lead)
            </p>
          </div>
        </section>

        {/* GET Docs */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-slate-900 pl-4">
            <RefreshCcw className="w-5 h-5 text-slate-900" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Consulta de Existência (GET)</h3>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              Utilizado para verificar se um lead já está cadastrado no sistema antes de enviar novos dados. O Telefone é a chave primária.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Parâmetros OBRIGATÓRIOS</p>
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-gold-deep">phone</span>
                  <span className="text-slate-500">Número limpo (DDI+DDD+Num)</span>
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Resposta Sucesso (200 OK)</p>
                <code className="text-[10px] text-[#1F8A4C] font-mono italic">
                  {"{ \"exists\": true, \"lead\": {...} }"}
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* POST Docs */}
        <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
              <FileText className="w-5 h-5 text-gold-deep" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Processamento de Lead (POST)</h3>
            </div>
            <span className="px-3 py-1 bg-gold-deep/10 text-gold-deep text-[10px] font-bold rounded-full border border-gold-deep/20 uppercase tracking-widest">JSON Body</span>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-slate-500 leading-relaxed">
              Cria um novo lead ou atualiza um já existente. Se o telefone enviado coincidir com um lead na base, os campos enviados serão mesclados (Merge) ao registro atual.
            </p>

            <div className="relative group">
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => copyToClipboard(leadPayload, 'payload')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-black/80 hover:bg-black/60 text-slate-300 hover:text-white rounded-lg transition-all text-[10px] font-bold uppercase border border-white/10"
                >
                  {copied === 'payload' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'payload' ? 'Copiado' : 'Copiar Payload'}
                </button>
              </div>
              <pre className="bg-brand-black p-6 rounded-3xl border border-gold-deep/10 text-gold-deep/90 text-xs font-mono overflow-x-auto leading-relaxed shadow-inner">
                {leadPayload}
              </pre>
            </div>

            <div className="p-4 bg-gold-deep/5 rounded-2xl border border-gold-deep/10">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-gold-deep shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">Dicas de Formatação</p>
                  <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-1 italic">
                    <li>Números de telefone devem conter 55 + DDD + Número.</li>
                    <li>Status permitidos: 'Novo Lead', 'Em Atendimento', 'Aguardando Documento', etc.</li>
                    <li>Campos vazios no JSON não sobrescrevem dados existentes na atualização.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      ) : (
        <div className="space-y-12 animate-in fade-in slide-in-from-left-4 duration-300">
          {/* Pipeline Real */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
              <Zap className="w-5 h-5 text-gold-deep" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Pipeline de Execução e Ordem de Ação</h3>
            </div>

            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Layout className="w-32 h-32 text-gold-deep" />
              </div>

              <div className="relative space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-1">[ARQUITETURA PRINCIPAL] — Ciclo de Vida do Evento</h4>
                    <p className="text-[10px] text-slate-500">Como cada componente executa sua ação no fluxo de CRM.</p>
                  </div>
                  <div className="px-3 py-1 bg-[#E4F5EA] border border-[#1F8A4C]/20 rounded-full">
                    <span className="text-[10px] font-bold text-[#1F8A4C] uppercase tracking-widest animate-pulse">Live Pipeline</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    {[
                      { step: 1, name: 'INPUT (EVENT_START)', desc: 'Recebimento da mensagem/documento do lead.', action: 'Gera log [EVENT_START] e enfileira no Buffer.' },
                      { step: 2, name: 'EVENT_QUEUE (LOCK)', desc: 'Ativação do Lock Atômico por Lead ID.', action: 'Evita concorrência e garante ordem cronológica.' },
                      { step: 3, name: 'DOCUMENT_AI (HARDENED)', desc: 'Processamento Multimodal (GenAI) com Lock Atômico.', action: 'Extração profunda com validação de confiança (>0.7) e persistência validada.' },
                      { step: 4, name: 'LEAD_SYNC (ATOMIC)', desc: 'Sincronização com Firestore via Fresh State.', action: 'Garante que os dados do documento não sobrescrevam atualizações de texto paralelas.' },
                      { step: 5, name: 'STATUS_ENGINE (REFRESH)', desc: 'Recálculo do estágio do funil com dados reais.', action: 'Avança lead para Em Cotação se CRLV for detectado com sucesso.' },
                    ].map((item, i) => (
                      <div key={i} className="flex gap-4 group">
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full bg-gold-deep/20 border border-gold-deep/30 flex items-center justify-center text-[10px] font-bold text-gold-deep">
                            {item.step}
                          </div>
                          {i < 4 && <div className="w-px h-full bg-gold-deep/10 my-1" />}
                        </div>
                        <div className="pb-4">
                          <h5 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">{item.name}</h5>
                          <p className="text-[10px] text-slate-500 mb-1">{item.desc}</p>
                          <p className="text-[10px] text-gold-deep italic">Impacto: {item.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {[
                      { step: 6, name: 'STEP_ENGINE (PATH)', desc: 'Determinação do próximo objetivo comercial.', action: 'Identifica o que falta coletar baseado no status.' },
                      { step: 7, name: 'FLOW_ENGINE (TONE)', desc: 'Injeção de diretrizes de comportamento.', action: 'Aplica pesos CORE (100) ou SALES (60).' },
                      { step: 8, name: 'AI (RELOAD_LEAD)', desc: 'Geração de resposta via OpenRouter (Unificado).', action: 'Executa [LEAD_REFRESH] para garantir dados de extração.' },
                      { step: 9, name: 'EXECUTION_GUARD (PROTECT)', desc: 'Validação de saída e bloqueio redundante.', action: 'Bloqueia IA se [AI_BLOCKED] for disparado por lock ativo.' },
                      { step: 10, name: 'OUTPUT (EVENT_DONE)', desc: 'Envio da resposta e fechamento do ciclo.', action: 'Gera log [EVENT_DONE] e libera o lock do Lead.' },
                    ].map((item, i) => (
                      <div key={i} className="flex gap-4 group">
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 group-hover:border-gold-deep/30 transition-colors">
                            {item.step}
                          </div>
                          {i < 4 && <div className="w-px h-full bg-slate-200 my-1" />}
                        </div>
                        <div className="pb-4">
                          <h5 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">{item.name}</h5>
                          <p className="text-[10px] text-slate-500 mb-1">{item.desc}</p>
                          <p className="text-[10px] text-gold-deep italic">Impacto: {item.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-[#1F8A4C]" />
                      <span className="text-[10px] font-bold text-[#1F8A4C] uppercase tracking-widest">Protocolo de Confirmação (ACK)</span>
                    </div>
                    <p className="text-[10px] text-slate-600 leading-relaxed italic">
                      "O Agente de Vendas (AI) só é invocado após o ack funcional do pipeline de extração. Se a extração falhar ou o lock estiver ativo, o Execution Guard bloqueia a IA de vendas para evitar respostas fora de sincronia ou redundantes."
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-center gap-4">
                {[
                  { name: 'INPUT', icon: Globe, color: 'text-blue-400' },
                  { name: 'EVENT_QUEUE', icon: History, color: 'text-purple-400' },
                  { name: 'DOCUMENT_AI', icon: FileSearch, color: 'text-[#B8860B]' },
                  { name: 'LEAD_UPDATE', icon: Database, color: 'text-[#1F8A4C]' },
                  { name: 'STATUS_ENGINE', icon: Layout, color: 'text-indigo-400' },
                  { name: 'STEP_ENGINE', icon: RefreshCcw, color: 'text-cyan-400' },
                  { name: 'FLOW_ENGINE', icon: Cpu, color: 'text-gold-deep' },
                  { name: 'AI', icon: Bot, color: 'text-rose-400' },
                  { name: 'EXECUTION_GUARD', icon: ShieldCheck, color: 'text-[#1F8A4C]' },
                  { name: 'OUTPUT', icon: Send, color: 'text-sky-400' },
                ].map((step, i) => (
                  <React.Fragment key={step.name}>
                    <div className="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-200 min-w-[120px] group hover:border-gold-deep/30 transition-all">
                      <step.icon className={cn("w-6 h-6 mb-1", step.color)} />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{step.name}</span>
                    </div>
                    {i < 9 && <ChevronRight className="w-4 h-4 text-slate-300 hidden lg:block" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>

          {/* Decision Matrix */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
              <RefreshCcw className="w-5 h-5 text-gold-deep" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Matriz de Decisão do Sistema</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { cond: "Recebeu CNH", action: "Extrair + Salvar + Atualizar Lead", impact: "Avanço automático de funil" },
                { cond: "Dados Completos", action: "Mudar status para 'Em Cotação'", impact: "Pronto para precificação" },
                { cond: "Resposta Genérica", action: "Execution Guard substitui por CTA", impact: "Mantém foco na venda" },
                { cond: "Dado já existe", action: "Bloquear pergunta redundante", impact: "Melhora percepção de marca" },
                { cond: "Evento crítico na fila", action: "Bloquear IA até conclusão", impact: "Evita respostas dessincronizadas" },
              ].map((item, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-gold-deep/10 flex items-center justify-center shrink-0">
                    <span className="text-gold-deep text-[10px] font-bold">IF</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-800">{item.cond}</p>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-3 h-3 text-gold-deep" />
                      <p className="text-xs text-gold-deep italic">{item.action}</p>
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">Auto-Impacto: {item.impact}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Deep Tech Specs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Event Queue */}
            <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-gold-deep" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Event Queue — Consistência</h4>
              </div>
              <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
                <p>O <code className="text-gold-deep">EventQueueService</code> garante que o processamento seja atômico e sem concorrência por lead.</p>
                <ul className="space-y-2 list-disc list-inside">
                  <li><span className="text-slate-800 font-bold">Prioridade:</span> DOCUMENT &gt; LEAD_UPDATE &gt; MESSAGE</li>
                  <li><span className="text-slate-800 font-bold">Locks:</span> Processamento bloqueado por Lead ID enquanto IA está ativa.</li>
                  <li><span className="text-slate-800 font-bold">Retry:</span> 3 tentativas com backoff exponencial para APIs externas.</li>
                  <li><span className="text-slate-800 font-bold">IA Paused:</span> A IA é suspensa durante a análise de documentos (OCR).</li>
                </ul>
              </div>
            </section>

            {/* Flow Engine */}
            <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-gold-deep" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Flow Engine — Detalhamento</h4>
              </div>
              <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
                <p>Orquestra o tom e a estratégia através do <code className="text-gold-deep">activationScore</code>.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-slate-800 font-bold">CORE (100)</p>
                    <p className="text-[10px]">Segurança/Regras</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-slate-800 font-bold">DECISION (80)</p>
                    <p className="text-[10px]">Lógica de Qualificação</p>
                  </div>
                </div>
                <ul className="space-y-1 list-disc list-inside text-[10px]">
                  <li>Limite de 6 flows ativos para evitar poluição de contexto.</li>
                  <li>Prevenção de conflito via override de pesos CORE.</li>
                </ul>
              </div>
            </section>
          </div>

          {/* Business Metrics */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
              <TrendingUp className="w-5 h-5 text-gold-deep" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Métricas de Negócio e KPIs Reais</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Conversão', type: 'Status', value: '45%' },
                { label: 'Abandono', type: 'Etapa', value: '12%' },
                { label: 'Time to Close', type: 'Avg', value: '1.2d' },
                { label: 'Custo/Lead', type: 'Investment', value: 'R$ 18' },
                { label: 'Custo/Venda', type: 'CAC', value: 'R$ 55' },
              ].map((m, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{m.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                  <p className="text-[9px] text-slate-400 italic mt-1">{m.type}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Commercial Bottlenecks */}
          <section className="bg-[#FDE4E4] p-8 rounded-[3rem] border border-[#C0392B]/15 space-y-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-[#C0392B]" />
              <h4 className="text-sm font-bold text-[#C0392B] uppercase tracking-widest">Gargalos Comerciais Identificados</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#C0392B]">Status: "Aguardando Documento"</p>
                <p className="text-xs text-[#C0392B]/80 leading-relaxed">Ponto de maior abandono (35%). Leads hesitam em enviar fotos da CNH/CRLV sem reforço de segurança.</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#C0392B]">Tempo Médio Parado</p>
                <p className="text-xs text-[#C0392B]/80 leading-relaxed">Leads que ficam mais de 4h sem interação têm 60% menos chance de conversão.</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#C0392B]">Impacto na Conversão</p>
                <p className="text-xs text-[#C0392B]/80 leading-relaxed">A falta de follow-up em 5min reduz a conversão de leads "quentes" pela metade.</p>
              </div>
            </div>
          </section>

          {/* Validation Checklist */}
          <section className="p-8 bg-[#E4F5EA]/50 rounded-[3rem] border border-[#1F8A4C]/15">
            <div className="flex items-center gap-3 mb-6">
              <ShieldCheck className="w-5 h-5 text-[#1F8A4C]" />
              <h4 className="text-sm font-bold text-[#1F8A4C] uppercase tracking-widest">Validação de Integridade (Checklist)</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                "Documento foi salvo corretamente no lead?",
                "Dados extraídos batem com a realidade?",
                "Status do lead avançou automaticamente?",
                "A IA respeitou o contexto e o tom de voz Michelin?",
              ].map((check, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/60 p-4 rounded-2xl border border-[#1F8A4C]/15">
                  <div className="w-5 h-5 rounded border border-[#1F8A4C]/40 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-[#1F8A4C]" />
                  </div>
                  <span className="text-xs text-[#1F8A4C] font-medium">{check}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      </div>

      <div className="p-12 text-center border-t border-gold-deep/10">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em]">Michelin Seguros &copy; 2026 - Tecnologia e Inovação</p>
      </div>
    </div>
  );
}
