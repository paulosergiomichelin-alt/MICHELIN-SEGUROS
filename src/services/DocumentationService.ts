import { limit } from 'firebase/firestore';
import { DataService } from './DataService';

export interface SystemInfo {
  version: string;
  lastUpdate: string;
  metrics: {
    leadsByStatus: Record<string, number>;
    totalLeads: number;
    overrideCount: number;
    learningUsage: number;
  };
}

export class DocumentationService {
  private static readonly SYSTEM_VERSION = "3.0.0-ORCHESTRATOR-BRAIN";

  public static async generateDocumentation(): Promise<string> {
    const metrics = await this.getRealMetrics();

    const info: SystemInfo = {
      version: this.SYSTEM_VERSION,
      lastUpdate: new Date().toLocaleString('pt-BR'),
      metrics
    };

    return this.buildDocumentationMarkdown(info);
  }

  private static async getRealMetrics() {
    try {
      const leads = await DataService.list('leads', [limit(200)]);

      const counts: Record<string, number> = {};
      leads.forEach((l: any) => {
        const s = l.status || 'Desconhecido';
        counts[s] = (counts[s] || 0) + 1;
      });

      const audit_logs = await DataService.list('audit_logs', [limit(100)]);
      const overrides = audit_logs.filter((d: any) => d.action === 'execution_override').length;

      const learning_memory = await DataService.list('learning_memory', [limit(100)]);
      const usage = learning_memory.length;

      return {
        leadsByStatus: counts,
        totalLeads: leads.length,
        overrideCount: overrides,
        learningUsage: usage
      };
    } catch (e) {
      console.error("Erro ao coletar métricas para doc:", e);
      return { leadsByStatus: {}, totalLeads: 0, overrideCount: 0, learningUsage: 0 };
    }
  }

  private static buildDocumentationMarkdown(info: any): string {
    const total = info.metrics.totalLeads || 0;

    let md = `# Documentação do Sistema — CRM Michelin Seguros\n\n`;
    md += `> **Versão:** ${info.version} · **Gerado em:** ${info.lastUpdate}\n\n`;
    md += `Este documento descreve a arquitetura completa do sistema, o papel de cada arquivo envolvido no agente de IA, o fluxo de acionamento, o pipeline de vendas via WhatsApp e uma auditoria conclusiva com análise de melhorias prioritárias.\n\n`;
    md += `---\n\n`;

    // ─── SEÇÃO 1: ARQUIVOS DO AGENTE ───
    md += `## 1. Arquivos SRC — Agente de IA\n\n`;
    md += `Todos os arquivos que compõem o agente inteligente, agrupados por camada.\n\n`;

    md += `### Serviços Principais (src/services/)\n\n`;
    md += `| Arquivo | Papel no Agente |\n`;
    md += `|---|---|\n`;
    md += `| \`OrchestratorService.ts\` | **Cérebro central.** Recebe cada mensagem, decide o próximo passo no fluxo de vendas e executa a ação (processar documento, enviar resposta, atualizar lead). Loop de até 3 iterações por mensagem. |\n`;
    md += `| \`leadAutomation.ts\` | **Porta de entrada única.** Garante idempotência (anti-duplicata), popula cache instantâneo e aciona o Orchestrator com lock distribuído para evitar corridas. |\n`;
    md += `| \`agentService.ts\` | **Gerador de respostas determinísticas.** Produz as mensagens do agente baseado no estado atual do lead, sem chamada aleatória a LLM — previsível e auditável. |\n`;
    md += `| \`metaService.ts\` | **Canal WhatsApp / Instagram / Messenger.** Envia mensagens via Meta Graph API com retry automático para rate-limit (429) e erros transientes. |\n`;
    md += `| \`OCRService.ts\` | **Pipeline de leitura de documentos.** Recebe foto/PDF, extrai texto via IA multimodal (OpenRouter) e retorna dados estruturados com score de confiança. |\n`;
    md += `| \`DataService.ts\` | **CRUD centralizado Firestore.** Todas as gravações e leituras passam aqui — com isolamento multi-tenant, cache TTL 5 min, auditoria e proteção de quota. |\n`;
    md += `| \`CacheManager.ts\` | **Cache em memória com TTL.** Reduz leituras ao Firestore para configurações e leads recentemente acessados. |\n`;
    md += `| \`LockService.ts\` | **Locks distribuídos.** Garante que apenas um worker processa a mesma mensagem ao mesmo tempo, eliminando respostas duplicadas. |\n`;
    md += `| \`MetricsService.ts\` | **Coleta de telemetria.** Registra latência, taxa de sucesso e uso de quota para dashboards de saúde. |\n\n`;

    md += `### Document Engine (src/services/document-engine/)\n\n`;
    md += `| Arquivo | Papel no Agente |\n`;
    md += `|---|---|\n`;
    md += `| \`DocumentEngine.ts\` | Orquestrador de documentos: normaliza texto OCR → classifica tipo (CNH / CRLV / Apólice) → extrai campos → calcula confiança. |\n`;
    md += `| \`DeterministicParser.ts\` | Parser baseado em regex e heurística de posicionamento. Extrai CPF, placa, chassis, datas sem depender de LLM. |\n`;
    md += `| \`ConfidenceEngine.ts\` | Calcula score de confiança (0–100%) por campo extraído. Campos abaixo de 60% são sinalizados para revisão. |\n`;
    md += `| \`DocumentClassifier.ts\` | Identifica o tipo do documento por tokens âncora (ex: "HABILITAÇÃO" → CNH, "RENAVAM" → CRLV). |\n\n`;

    md += `### Contextos React (src/contexts/)\n\n`;
    md += `| Arquivo | Papel no Agente |\n`;
    md += `|---|---|\n`;
    md += `| \`ChatContext.tsx\` | Despacha mensagens do operador para o Orchestrator e mantém o histórico local de chat em memória. |\n`;
    md += `| \`LeadRealtimeContext.tsx\` | Subscription Firestore em tempo real. Quando o agente atualiza o lead, a UI reflete imediatamente sem reload. |\n\n`;

    md += `### Domínio de Leads (src/domains/leads/)\n\n`;
    md += `| Arquivo | Papel no Agente |\n`;
    md += `|---|---|\n`;
    md += `| \`ChatView.tsx\` | Interface de chat. Exibe histórico, permite envio manual, upload de documentos e toggle de IA ativa/pausada. |\n`;
    md += `| \`LeadForm.tsx\` | Formulário CRM com upload de arquivos. Ao receber um documento, aciona OCRService diretamente. |\n`;
    md += `| \`SalesPipeline.tsx\` | Kanban de status. Atualizado em tempo real conforme o agente avança o lead pelo funil. |\n`;
    md += `| \`MensagensAtivas.tsx\` | Disparo de campanhas em lote para grupos de leads selecionados. |\n\n`;

    md += `### Configuração do Agente (src/domains/settings/)\n\n`;
    md += `| Arquivo | Papel no Agente |\n`;
    md += `|---|---|\n`;
    md += `| \`AgentSettings.tsx\` | Painel de configuração: persona, prompt base, modelo de IA, regras de classificação, follow-ups automáticos. |\n`;
    md += `| \`FlowEngine.tsx\` | Editor visual de fluxos de decisão personalizados (criar, editar, exportar). |\n`;
    md += `| \`AIDocumentExtractionPanel.tsx\` | Config específica do agente de extração de documentos (modelo, persona, instruções). |\n\n`;

    md += `### Tipos Centrais (src/types.ts)\n\n`;
    md += `Define as interfaces que amarram todo o sistema:\n\n`;
    md += `- \`Lead\` — 70+ campos: dados pessoais, veículo, documentos, status, temperatura, score\n`;
    md += `- \`AgentConfig\` — persona, instructions, model, extraction, followUps, scheduling\n`;
    md += `- \`Message\` — histórico de chat com attachments e sender (user / ai / system)\n`;
    md += `- \`LeadStatus\` — enum do funil: Novo Lead → Em Atendimento → Aguardando Documento → Em Cotação → Proposta Enviada → Negociação → Fechado / Perdido\n\n`;

    md += `---\n\n`;

    // ─── SEÇÃO 2: FLUXO DE ACIONAMENTO DA IA ───
    md += `## 2. Fluxo de Acionamento da IA\n\n`;
    md += `Sequência completa desde a chegada de uma mensagem WhatsApp até a resposta do agente.\n\n`;

    md += `\`\`\`\n`;
    md += `[1] Mensagem chega via Webhook Meta (WhatsApp)\n`;
    md += `     │\n`;
    md += `     ▼\n`;
    md += `[2] ChatContext.sendMessage(text, lead)\n`;
    md += `     │  Grava Message{sender:'user'} no Firestore via DataService\n`;
    md += `     │  Atualiza lead.lastInteraction + lead.lastMessageText\n`;
    md += `     │\n`;
    md += `     ▼\n`;
    md += `[3] LeadAutomationService.processNewMessage(msg, agentConfig)\n`;
    md += `     │  ① IdempotencyService.isDuplicate(msgKey) → aborta se duplicata\n`;
    md += `     │  ② MessageCacheService.append(leadId, msg) → cache instantâneo\n`;
    md += `     │  ③ LockService.acquire(leadId) → lock distribuído\n`;
    md += `     │\n`;
    md += `     ▼\n`;
    md += `[4] OrchestratorService.handleIncomingMessage(lead, msg)\n`;
    md += `     │\n`;
    md += `     │  LOOP (máx. 3 iterações):\n`;
    md += `     │   buildContext(lead)  →  decideNextAction()  →  executeAction()\n`;
    md += `     │\n`;
    md += `     │  decideNextAction() avalia:\n`;
    md += `     │   ├─ Tem anexo?           → PROCESS_DOCUMENT\n`;
    md += `     │   ├─ Doc em processamento? → WAIT\n`;
    md += `     │   ├─ Status inconsistente? → UPDATE_LEAD\n`;
    md += `     │   └─ Caso geral          → FALLBACK (resposta determinística)\n`;
    md += `     │\n`;
    md += `     ▼\n`;
    md += `[5a] PROCESS_DOCUMENT\n`;
    md += `      OCRService.processDocument(attachment)\n`;
    md += `       │  → DocumentEngine: normaliza → classifica → parseia → confidence\n`;
    md += `       │  → Merge campos extraídos no lead (name, cpf, plate, chassis...)\n`;
    md += `       └─ Update lead.documents[tipo] + continua loop\n`;
    md += `\n`;
    md += `[5b] FALLBACK — agentService.generateReply(lead, messages)\n`;
    md += `      OrchestratorService.getNextStep(lead) → determina etapa atual\n`;
    md += `      OrchestratorService.generateForcedResponse(step) → mensagem pré-definida\n`;
    md += `       │\n`;
    md += `       ▼\n`;
    md += `[6] MetaService.sendMessage(whatsappConfig, text)\n`;
    md += `     │  Envia via WhatsApp Business API\n`;
    md += `     │  Grava Message{sender:'ai'} + Update lead.iaActive=true\n`;
    md += `     └─ Fim do ciclo\n`;
    md += `\`\`\`\n\n`;

    md += `---\n\n`;

    // ─── SEÇÃO 3: PIPELINE DE VENDAS ───
    md += `## 3. Pipeline de Vendas Completo\n\n`;
    md += `O agente conduz o cliente por etapas sequenciais via WhatsApp, coletando dados para cotação e fechamento.\n\n`;

    md += `### Etapa 1 — Acolhimento\n`;
    md += `**Trigger:** Lead novo entra no sistema (status \`Novo Lead\`)\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Olá, tudo bem? Vou te ajudar a cotar seu seguro rapidinho 👌 Seu seguro é uma **renovação** ou seria um **seguro novo**?"\n\n`;
    md += `**Ação no sistema:** \`lead.status → Em Atendimento\`\n\n`;

    md += `### Etapa 2 — Coleta de Dados Pessoais\n`;
    md += `**Trigger:** \`lead.name\` vazio\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Perfeito! Pode me informar seu **nome completo**?"\n\n`;
    md += `**Ação no sistema:** Salva \`lead.name\` quando cliente responde\n\n`;

    md += `### Etapa 3 — Solicitação de CNH\n`;
    md += `**Trigger:** \`lead.documents.cnh\` ausente\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Para eu te passar o melhor valor, me manda uma **foto da CNH** 📸"\n\n`;
    md += `**Ação no sistema quando cliente envia imagem:**\n`;
    md += `- OCRService extrai: \`name\`, \`cpf\`, \`birthDate\`, \`licenseExpiry\`, \`licenseCategory\`\n`;
    md += `- \`lead.documents.cnh = {dados extraídos}\`\n`;
    md += `- Avança automaticamente para a próxima etapa\n\n`;

    md += `### Etapa 4 — Solicitação de CRLV\n`;
    md += `**Trigger:** \`lead.documents.crv\` ausente\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Ótimo! Agora me manda o **documento do veículo** (CRLV) 🚗"\n\n`;
    md += `**Ação no sistema quando cliente envia imagem:**\n`;
    md += `- OCRService extrai: \`plate\`, \`chassis\`, \`ownerName\`, \`ownerCpfCnpj\`, \`brandModel\`, \`modelYear\`\n`;
    md += `- \`lead.documents.crv = {dados extraídos}\`\n\n`;

    md += `### Etapa 5 — Solicitação de Apólice (Renovação)\n`;
    md += `**Trigger:** Lead informou que é renovação E \`lead.documents.policy\` ausente\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Consegue me mandar uma **foto da sua última apólice**? Assim consigo negociar melhor pra você 😊"\n\n`;
    md += `**Ação no sistema quando cliente envia:**\n`;
    md += `- OCRService extrai: \`insuranceExpiry\`, \`insuredName\`, \`plate\`, \`currentInsurer\`\n`;
    md += `- \`lead.documents.policy = {dados extraídos}\`\n\n`;

    md += `### Etapa 6 — Dados Completos / Pronto para Cotação\n`;
    md += `**Trigger:** CNH + CRLV extraídos com sucesso\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Perfeito! 👍 Já vou calcular nas **15 seguradoras parceiras**. Te retorno em instantes com as melhores opções!"\n\n`;
    md += `**Ação no sistema:**\n`;
    md += `- \`lead.status → Em Cotação\`\n`;
    md += `- Notificação interna para o time: "Lead pronto para cotação"\n`;
    md += `- Motor de cotação externo recebe os dados via integração\n\n`;

    md += `### Etapa 7 — Envio da Proposta\n`;
    md += `**Trigger:** Cotação gerada pelo motor externo (PDF)\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Consegui ótimas opções pra você! 💰 Veja sua **cotação personalizada** → [PDF com proposta]"\n\n`;
    md += `**Ação no sistema:**\n`;
    md += `- \`lead.status → Proposta Enviada\`\n`;
    md += `- \`lead.quoteAttachment = URL do PDF\`\n\n`;

    md += `### Etapa 8 — Negociação\n`;
    md += `**Trigger:** Cliente responde à proposta com dúvidas ou contraproposta\n\n`;
    md += `**Cenários tratados pelo agente:**\n`;
    md += `- "Qual o melhor preço?" → compara seguradoras da cotação\n`;
    md += `- "Posso parcelar?" → informa condições e escala para atendente humano se necessário\n`;
    md += `- "Está caro" → destaca coberturas e negocia dentro do limite configurado\n\n`;
    md += `**Ação no sistema:** \`lead.status → Negociação\`\n\n`;

    md += `### Etapa 9 — Fechamento\n`;
    md += `**Trigger:** Cliente confirma aceitação da proposta\n\n`;
    md += `**Mensagem do Agente:**\n`;
    md += `> "Excelente escolha! ✅ Vou encaminhar para finalização. Você receberá a apólice em breve!"\n\n`;
    md += `**Ação no sistema:**\n`;
    md += `- \`lead.status → Fechado\`\n`;
    md += `- \`lead.closedAt = timestamp\`\n`;
    md += `- Métricas: \`user.metrics.totalVendas++\`, \`conversionRate\` atualizado\n\n`;

    md += `### Classificação de Temperatura (Score 0–10)\n\n`;
    md += `O sistema classifica o interesse do lead continuamente:\n\n`;
    md += `| Score | Temperatura | Comportamento do Agente |\n`;
    md += `|---|---|---|\n`;
    md += `| 8–10 | 🔥 Quente | Foca em fechamento imediato, urgência leve |\n`;
    md += `| 4–7 | ⚠️ Morno | Educacional, destaca benefícios, segue coletando dados |\n`;
    md += `| 0–3 | ❄️ Frio | Agenda follow-up futuro, abordagem de reengajamento |\n\n`;

    md += `**Critérios de pontuação:**\n`;
    md += `- Pediu cotação: **+3** · Enviou documentos: **+3** · Urgência expressa: **+2**\n`;
    md += `- Responde rápido (< 5 min): **+2** · Perguntou preço/condições: **+1**\n`;
    md += `- Demora > 1 hora: **-2** · Para de responder: **-3** · Recusa enviar dados: **-2**\n\n`;

    md += `---\n\n`;

    // ─── SEÇÃO 4: MÉTRICAS ATUAIS ───
    md += `## 4. Métricas Atuais do Funil\n\n`;
    md += `| Status | Leads | % |\n`;
    md += `|---|---|---|\n`;

    const statusOrder = [
      'Novo Lead', 'Em Atendimento', 'Aguardando Documento',
      'Em Cotação', 'Proposta Enviada', 'Negociação', 'Fechado', 'Perdido'
    ];

    statusOrder.forEach(s => {
      const count = info.metrics.leadsByStatus[s] ?? 0;
      const perc = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      md += `| ${s} | ${count} | ${perc}% |\n`;
    });

    Object.entries(info.metrics.leadsByStatus).forEach(([s, count]: [any, any]) => {
      if (!statusOrder.includes(s) && s !== 'Desconhecido') {
        const perc = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        md += `| ${s} | ${count} | ${perc}% |\n`;
      }
    });

    md += `| **Total** | **${total}** | **100%** |\n\n`;

    md += `---\n\n`;

    // ─── SEÇÃO 5: AUDITORIA E ANÁLISE CONCLUSIVA ───
    md += `## 5. Auditoria — Análise Conclusiva para Sistema Focado em Vendas\n\n`;
    md += `> **Objetivo de negócio:** Agente de IA que interage com clientes via WhatsApp, coleta dados automaticamente, gera cotação e fecha a venda com mínima intervenção humana.\n\n`;

    md += `### O que já funciona bem\n\n`;
    md += `- ✅ **Fluxo determinístico** — sem respostas aleatórias, previsível e auditável\n`;
    md += `- ✅ **Extração de documentos** — CNH, CRLV e Apólice com OCR multimodal + fallback regex\n`;
    md += `- ✅ **Idempotência** — proteção robusta contra mensagens duplicadas\n`;
    md += `- ✅ **Locks distribuídos** — sem respostas concorrentes para o mesmo lead\n`;
    md += `- ✅ **UI realtime** — Kanban e chat atualizados instantaneamente via Firestore\n`;
    md += `- ✅ **Multi-tenant** — isolamento completo por empresa\n`;
    md += `- ✅ **Uma pergunta por vez** — experiência de conversa natural no WhatsApp\n\n`;

    md += `### Lacunas Críticas — Bloqueiam Fechamento de Vendas\n\n`;

    md += `**1. Motor de Cotação Desconectado** 🔴\n`;
    md += `O agente coleta todos os dados mas não há integração ativa com o motor de cálculo de seguros. O lead fica parado em "Em Cotação" sem receber proposta automaticamente.\n`;
    md += `**Solução:** Webhook de callback do motor de cotações → \`lead.quoteAttachment\` + mensagem automática ao cliente com o PDF.\n\n`;

    md += `**2. Follow-ups Sem Executor** 🔴\n`;
    md += `Os follow-ups são configuráveis em AgentSettings mas não há scheduler que os execute. Leads frios nunca recebem reengajamento automático.\n`;
    md += `**Solução:** Cloud Scheduler (Firebase) que consulta \`follow_ups\` pendentes a cada 15 minutos e dispara via MetaService.\n\n`;

    md += `**3. Classificação de Temperatura Manual** 🔴\n`;
    md += `As regras de score existem em \`AgentConfig.classificationRules\` mas não são aplicadas automaticamente. Vendedores precisam classificar manualmente.\n`;
    md += `**Solução:** Função disparada a cada nova mensagem que recalcula \`lead.temperature\` e \`lead.score\` com base nas regras definidas.\n\n`;

    md += `**4. Sem Escalação para Atendente Humano** 🟡\n`;
    md += `Não há lógica definida para quando o agente deve parar e passar para um humano (ex: lead quente sem fechar em 2h, cliente pede parcelamento especial).\n`;
    md += `**Solução:** Regra: \`temperature === 'quente' && semResposta > 2h\` → \`lead.assignedToHumanId\` + notificação + pausa da IA.\n\n`;

    md += `**5. OCR sem Fallback Conversacional** 🟡\n`;
    md += `Se o OCR falha (foto ruim, PDF corrompido), o lead vai para \`erro_extracao\` sem o agente orientar o cliente a tentar novamente.\n`;
    md += `**Solução:** Step \`SOLICITAR_NOVA_FOTO\`: "A foto ficou um pouco escura 📷 Pode tentar de novo com mais luz?"\n\n`;

    md += `**6. Proposta Sem Etapa de Aceitação Estruturada** 🟡\n`;
    md += `Após envio da cotação, o fluxo fica aberto. Não há perguntas guiadas para conduzir à decisão de fechamento.\n`;
    md += `**Solução:** Após envio do PDF: "Qual das opções mais te agradou? A **[seguradora A]** ou a **[seguradora B]**?" — forçar escolha binária.\n\n`;

    md += `**7. CNH Vencida Não Bloqueia** 🟠\n`;
    md += `O campo \`licenseExpiry\` é extraído mas não é comparado com a data atual. Um lead com CNH vencida avança normalmente para cotação.\n`;
    md += `**Solução:** Validação em \`getNextStep()\`: se \`licenseExpiry < hoje\` → mensagem "Identificamos que sua CNH está vencida. A cotação pode ter restrições — deseja prosseguir?"\n\n`;

    md += `**8. Falta de Contexto Persistente entre Sessões** 🟠\n`;
    md += `Se o agente reinicia, perde o histórico implícito da conversa. O campo \`lead.contextSummary\` existe mas não é atualizado.\n`;
    md += `**Solução:** Atualizar \`lead.contextSummary\` ao final de cada ciclo do Orchestrator com um resumo do estado atual da negociação.\n\n`;

    md += `### Prioridades de Implementação para MVP de Vendas\n\n`;
    md += `| Prioridade | Item | Impacto em Vendas |\n`;
    md += `|---|---|---|\n`;
    md += `| 🔴 #1 | Conectar motor de cotação + webhook de retorno | Alto — sem isso não há proposta automática |\n`;
    md += `| 🔴 #2 | Executor de follow-ups automáticos | Alto — reengajamento de leads frios |\n`;
    md += `| 🔴 #3 | Score/temperatura automático por mensagem | Alto — prioriza quem vai fechar |\n`;
    md += `| 🟡 #4 | Escalação para atendente humano | Médio — leads quentes não podem esfriar |\n`;
    md += `| 🟡 #5 | Fallback conversacional após OCR falho | Médio — reduz abandono por foto ruim |\n`;
    md += `| 🟡 #6 | Perguntas guiadas de fechamento pós-proposta | Médio — aumenta conversão na etapa final |\n`;
    md += `| 🟠 #7 | Validação de CNH vencida | Baixo — evita cotações inválidas |\n`;
    md += `| 🟠 #8 | Contexto persistente entre sessões | Baixo — melhora continuidade da conversa |\n\n`;

    md += `---\n\n`;
    md += `*SYSTEM_MANIFEST_VERIFIED · Gerado em: ${new Date().toISOString()}*\n`;

    return md;
  }
}
