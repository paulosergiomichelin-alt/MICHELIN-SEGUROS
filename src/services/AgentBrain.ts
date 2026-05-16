import { Lead, Message, AgentConfig, LeadStep, TenantConfig, ResolvedAgentConfig, BusinessContext, BusinessSegment } from '../types';
import { StepContext } from './StepRouter';
import { validate } from './GuardrailValidator';
import { logger } from './LoggerService';
import { templateService } from './TemplateService';

export interface AgentBrainInput {
  lead: Lead;
  step: LeadStep;
  stepContext: StepContext;
  recentMessages: Message[];
  agentConfig: AgentConfig;
  tenantConfig: TenantConfig;
}

export interface AgentBrainOutput {
  message: string;
  fallbackUsed: boolean;
  tokensUsed?: number;
  latencyMs?: number;
}

const LLM_TIMEOUT_MS = 10_000;
const RECENT_MESSAGES_COUNT = 5;

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSegmentContext(ctx: BusinessContext, segment: BusinessSegment): string {
  const lines: string[] = [];

  if (segment === 'corretora_seguros') {
    if (ctx.insurers?.length) lines.push(`Seguradoras parceiras: ${ctx.insurers.join(', ')}`);
    if (ctx.insuranceTypes?.length) lines.push(`Produtos oferecidos: ${ctx.insuranceTypes.join(', ')}`);
  } else if (segment === 'imobiliaria') {
    if (ctx.propertyTypes?.length) lines.push(`Tipos de imóvel: ${ctx.propertyTypes.join(', ')}`);
    if (ctx.operationTypes?.length) lines.push(`Operações: ${ctx.operationTypes.join(', ')}`);
    if (ctx.serviceAreas?.length) lines.push(`Regiões atendidas: ${ctx.serviceAreas.join(', ')}`);
  } else if (segment === 'clinica_odontologica') {
    if (ctx.specialties?.length) lines.push(`Especialidades: ${ctx.specialties.join(', ')}`);
    if (ctx.planTypes?.length) lines.push(`Planos aceitos: ${ctx.planTypes.join(', ')}`);
  } else if (segment === 'concessionaria') {
    if (ctx.brands?.length) lines.push(`Marcas: ${ctx.brands.join(', ')}`);
    if (ctx.vehicleTypes?.length) lines.push(`Segmentos: ${ctx.vehicleTypes.join(', ')}`);
  }

  if (ctx.workingHours) lines.push(`Horário de atendimento: ${ctx.workingHours}`);
  if (ctx.website) lines.push(`Site: ${ctx.website}`);

  return lines.join('\n');
}

function buildSystemPrompt(input: AgentBrainInput, resolved?: ResolvedAgentConfig | null): string {
  const { lead, stepContext, agentConfig, tenantConfig } = input;

  const persona = resolved?.persona ?? agentConfig.agentPersona ?? {
    name: agentConfig.name || 'Ana',
    role: 'Consultora de Seguros',
    tone: 'amigável, consultiva e direta',
    usesFormalTreatment: false,
  };

  const treatment = persona.usesFormalTreatment ? 'Trate o cliente por Senhor/Senhora.' : 'Trate o cliente pelo nome quando souber.';

  const blocks: string[] = [];

  // Bloco 1 — Identidade
  const identityLines = [
    `Você é ${persona.name}, ${persona.role} da ${tenantConfig.name}.`,
    `Você atende clientes via WhatsApp de forma consultiva e humanizada.`,
    `Tom: ${persona.tone}.`,
    treatment,
  ];

  // Inject segment-specific business context into identity block
  if (resolved?.businessContext && resolved.segment) {
    const segCtx = buildSegmentContext(resolved.businessContext, resolved.segment);
    if (segCtx) identityLines.push(segCtx);
  } else {
    const insurers = tenantConfig.insurers?.length
      ? tenantConfig.insurers.join(', ')
      : 'seguradoras parceiras';
    identityLines.push(`Seguradoras parceiras: ${insurers}.`);
  }

  blocks.push(`## IDENTIDADE\n${identityLines.join('\n')}`);

  // Bloco 2 — Contexto do lead
  const leadCtx: string[] = [
    `Nome: ${lead.name ?? 'não identificado'}`,
    `Score: ${lead.score ?? 0}/10 | Temperatura: ${lead.temperature ?? 'frio'}`,
    `Status: ${lead.status}`,
    `Perfil: ${lead.profileType ?? 'não identificado'}`,
    `Resumo da conversa: ${lead.contextSummary ?? 'primeiro contato'}`,
    `Tipo de seguro: ${lead.isRenewal === true ? 'renovação' : lead.isRenewal === false ? 'seguro novo' : 'não identificado'}`,
  ];
  blocks.push(`## CLIENTE ATUAL\n${leadCtx.join('\n')}`);

  // Bloco 3 — Objetivo da etapa
  let objectiveBlock = `## SEU OBJETIVO AGORA\n${stepContext.objective}`;
  if (stepContext.salesBlock) {
    objectiveBlock += `\n\n## COMPORTAMENTO DE VENDAS\n${stepContext.salesBlock}`;
  }
  blocks.push(objectiveBlock);

  // Bloco 4 — Guardrails (invioláveis — mesclados com guardrails da plataforma quando disponíveis)
  const guardrailLines = resolved?.guardrails
    ? [
        ...resolved.guardrails.hardProhibitions.map(r => `- ${r}`),
        ...resolved.guardrails.hardRequirements.map(r => `- ${r}`),
        ...resolved.guardrails.forbiddenPhrases.length
          ? [`- Nunca use estas frases: ${resolved.guardrails.forbiddenPhrases.join(' | ')}`]
          : [],
      ]
    : [
        '- Máximo 1 pergunta por mensagem',
        '- Máximo 3 linhas de texto — seja conciso',
        '- Nunca mencione que é IA, robô, sistema ou que está processando',
        '- Nunca decida qual é a próxima etapa do funil — apenas execute o objetivo acima',
        '- Nunca mencione preço antes da etapa de cotação',
        '- Se o cliente demonstrar frustração, reconheça antes de continuar',
        '- Nunca invente dados de cobertura, valores ou prazos',
        '- Varie a forma de escrever — nunca repita a mesma abertura duas vezes seguidas',
        '- Use emojis com moderação (máx 1 por mensagem)',
      ];

  blocks.push(`## REGRAS INVIOLÁVEIS (NUNCA VIOLE)\n${guardrailLines.join('\n')}`);

  return blocks.join('\n\n');
}

// ─── LLM call ─────────────────────────────────────────────────────────────────

interface LLMResult {
  text: string;
  tokensUsed: number;
}

async function callLLM(
  systemPrompt: string,
  messages: Message[],
  agentConfig: AgentConfig
): Promise<LLMResult> {
  const llmCfg = agentConfig.llm ?? {
    provider: 'openrouter' as const,
    model: agentConfig.model || 'openai/gpt-4o-mini',
    maxTokens: 300,
    temperature: 0.75,
  };

  const apiKey = agentConfig.openrouterApiKey ?? '';
  if (!apiKey) throw new Error('AgentBrain: openrouterApiKey not configured');

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
      .slice(-RECENT_MESSAGES_COUNT)
      .map(m => ({
        role: m.sender === 'ai' ? 'assistant' : 'user',
        content: m.text,
      })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: llmCfg.model,
        max_tokens: llmCfg.maxTokens,
        temperature: llmCfg.temperature,
        messages: chatMessages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content ?? '').trim();
    const tokensUsed = json.usage?.total_tokens ?? 0;

    return { text, tokensUsed };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function generateReply(input: AgentBrainInput): Promise<AgentBrainOutput> {
  const startMs = Date.now();
  const { lead, step, stepContext, recentMessages, agentConfig } = input;

  // Attempt to load resolved multi-tenant config (non-blocking — falls back gracefully)
  let resolved: ResolvedAgentConfig | null = null;
  if (lead.organizationId) {
    try {
      resolved = await templateService.resolveConfig(lead.organizationId);
    } catch (err) {
      logger.warn('AGENT_BRAIN', 'Could not resolve tenant template config, using legacy config', err);
    }
  }

  let llmText = '';
  let tokensUsed = 0;
  let fallbackUsed = false;

  // Attempt LLM call
  try {
    const systemPrompt = buildSystemPrompt(input, resolved);
    const result = await callLLM(systemPrompt, recentMessages, agentConfig);
    llmText = result.text;
    tokensUsed = result.tokensUsed;

    logger.info('AGENT_BRAIN', `LLM reply for step ${step}`, {
      tokens: tokensUsed,
      latency: Date.now() - startMs,
      leadId: lead.id,
      templateId: resolved?.templateId,
    });
  } catch (err) {
    logger.error('AGENT_BRAIN', 'LLM call failed, using fallback', err);
    fallbackUsed = true;
    return {
      message: stepContext.fallbackMessage,
      fallbackUsed: true,
      latencyMs: Date.now() - startMs,
    };
  }

  // Guardrail validation
  const reprocessFn = async (instruction: string): Promise<string> => {
    const fixPrompt = buildSystemPrompt(input, resolved) +
      `\n\n## CORREÇÃO NECESSÁRIA\n${instruction}\n\nReescreva a mensagem anterior respeitando as regras acima.`;
    const result = await callLLM(fixPrompt, recentMessages, agentConfig);
    return result.text;
  };

  const validation = await validate(llmText, step, stepContext.fallbackMessage, reprocessFn);

  if (!validation.valid) {
    fallbackUsed = true;
    logger.warn('AGENT_BRAIN', 'Guardrail fallback triggered', {
      issues: validation.issues,
      step,
      leadId: lead.id,
    });
  }

  return {
    message: validation.message,
    fallbackUsed,
    tokensUsed,
    latencyMs: Date.now() - startMs,
  };
}
