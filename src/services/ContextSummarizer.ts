import { Lead, Message } from '../types';
import { logger } from './LoggerService';

const LLM_TIMEOUT_MS = 8_000;
const MAX_SUMMARY_CHARS = 150;

function formatMessages(messages: Message[]): string {
  return messages
    .slice(-6)
    .map(m => `[${m.sender === 'ai' ? 'Ana' : 'Cliente'}]: ${m.text.slice(0, 120)}`)
    .join('\n');
}

async function callLLMForSummary(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
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
        model,
        max_tokens: 80,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`LLM status ${res.status}`);
    const json = await res.json();
    return (json.choices?.[0]?.message?.content ?? '').trim().slice(0, MAX_SUMMARY_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

function buildFallbackSummary(lead: Lead, messages: Message[]): string {
  const lastMsg = messages.at(-1);
  const parts: string[] = [];
  if (lead.name) parts.push(`Cliente: ${lead.name}`);
  if (lead.status) parts.push(`Status: ${lead.status}`);
  if (lastMsg) parts.push(`Último: ${lastMsg.text.slice(0, 60)}`);
  return parts.join(' | ').slice(0, MAX_SUMMARY_CHARS);
}

export async function updateContextSummary(
  lead: Lead,
  newMessages: Message[],
  apiKey?: string,
  model = 'openai/gpt-4o-mini'
): Promise<string> {
  if (!newMessages.length) return lead.contextSummary ?? '';

  if (!apiKey) {
    return buildFallbackSummary(lead, newMessages);
  }

  const prompt = [
    'Você resume conversas de vendas de seguro em 1-2 frases factuais e concisas.',
    `Resumo anterior: ${lead.contextSummary ?? 'Primeiro contato.'}`,
    `Novas mensagens:\n${formatMessages(newMessages)}`,
    `Novo resumo (máx ${MAX_SUMMARY_CHARS} caracteres, sem aspas):`,
  ].join('\n');

  try {
    return await callLLMForSummary(prompt, apiKey, model);
  } catch (err) {
    logger.warn('CONTEXT_SUMMARIZER', 'LLM falhou, usando fallback', err);
    return buildFallbackSummary(lead, newMessages);
  }
}
