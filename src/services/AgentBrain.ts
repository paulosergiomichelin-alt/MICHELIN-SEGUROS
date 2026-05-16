import { Lead, Message, AgentConfig, LeadStep, TenantConfig } from '../types';
import { StepContext } from './StepRouter';
import { validate } from './GuardrailValidator';
import { logger } from './LoggerService';

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

function buildSystemPrompt(input: AgentBrainInput): string {
  const { lead, stepContext, agentConfig, tenantConfig } = input;
  const persona = agentConfig.agentPersona ?? {
    name: agentConfig.name || 'Ana',
    role: 'Consultora de Seguros',
    tone: 'amigável, consultiva e direta',
    usesFormalTreatment: false,
  };

  const insurers = tenantConfig.insurers?.length
    ? tenantConfig.insurers.join(', ')
    : 'seguradoras parceiras';

  const treatment = persona.usesFormalTreatment ? 'Trate o cliente por Senhor/Senhora.' : 'Trate o cliente pelo nome quando souber.';

  const blocks: string[] = [];

  // Bloco 1 — Identidade
  blocks.push(`## IDENTIDADE
Você é ${persona.name}, ${persona.role} da ${tenantConfig.name}.
Seu foco é vender seguro automóvel de forma consultiva e humanizada via WhatsApp.
Seguradoras parceiras: ${insurers}.
Tom: ${persona.tone}.
${treatment}`);

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

  // Bloco 4 — Guardrails (invioláveis)
  blocks.push(`## REGRAS INVIOLÁVEIS (NUNCA VIOLE)
- Máximo 1 pergunta por mensagem
- Máximo 3 linhas de texto — seja conciso
- Nunca mencione que é IA, robô, sistema ou que está processando
- Nunca decida qual é a próxima etapa do funil — apenas execute o objetivo acima
- Nunca mencione preço antes da etapa de cotação
- Se o cliente demonstrar frustração, reconheça antes de continuar
- Nunca invente dados de cobertura, valores ou prazos
- Varie a forma de escrever — nunca repita a mesma abertura duas vezes seguidas
- Use emojis com moderação (máx 1 por mensagem)`);

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

  let llmText = '';
  let tokensUsed = 0;
  let fallbackUsed = false;

  // Attempt LLM call
  try {
    const systemPrompt = buildSystemPrompt(input);
    const result = await callLLM(systemPrompt, recentMessages, agentConfig);
    llmText = result.text;
    tokensUsed = result.tokensUsed;

    logger.info('AGENT_BRAIN', `LLM reply for step ${step}`, {
      tokens: tokensUsed,
      latency: Date.now() - startMs,
      leadId: lead.id,
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
    const fixPrompt = buildSystemPrompt(input) +
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
