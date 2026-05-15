/**
 * Datadog LLM Observability — browser-side span collector.
 *
 * Wraps any LLM call and sends a span to the local server proxy
 * (/api/datadog/llm-obs), which forwards to Datadog's intake API
 * using the server-side DD_API_KEY (never exposed to the browser).
 */

const DD_ENABLED = import.meta.env.VITE_DD_ENABLED === 'true';
const ML_APP     = import.meta.env.VITE_DD_SERVICE ?? 'michelin-crm';
const DD_ENV     = import.meta.env.VITE_DD_ENV     ?? 'production';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomHex(bytes = 8): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function nowNs(): number {
  return Math.floor(performance.timeOrigin * 1e6 + performance.now() * 1e6);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMSpanInput {
  model: string;
  provider: string;
  messages: Array<{ role: string; content: string | unknown }>;
}

export interface LLMSpanOutput {
  messages: Array<{ role: string; content: string }>;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

// ─── Core: send a completed span ──────────────────────────────────────────────

async function sendSpan(opts: {
  name: string;
  traceId: string;
  spanId: string;
  startNs: number;
  durationNs: number;
  input: LLMSpanInput;
  output?: LLMSpanOutput;
  error?: { message: string; stack?: string };
  sessionId?: string;
  tags?: string[];
}): Promise<void> {
  if (!DD_ENABLED) return;

  const payload = {
    data: [{
      type: 'traces',
      attributes: {
        ml_app: ML_APP,
        session_id: opts.sessionId ?? 'browser',
        tags: [
          `env:${DD_ENV}`,
          `service:${ML_APP}`,
          ...(opts.tags ?? []),
        ],
        spans: [{
          span_id:   opts.spanId,
          trace_id:  opts.traceId,
          parent_id: 'undefined',
          name:      opts.name,
          start_ns:  opts.startNs,
          duration:  opts.durationNs,
          error:     opts.error ? 1 : 0,
          meta: {
            'span.kind':       'llm',
            model_name:        opts.input.model,
            model_provider:    opts.input.provider,
            'input.messages':  JSON.stringify(opts.input.messages),
            'output.messages': JSON.stringify(opts.output?.messages ?? []),
            ...(opts.error ? {
              'error.message': opts.error.message,
              'error.stack':   opts.error.stack ?? '',
            } : {}),
          },
          metrics: {
            input_tokens:  opts.output?.inputTokens  ?? 0,
            output_tokens: opts.output?.outputTokens ?? 0,
            total_tokens:  opts.output?.totalTokens  ?? 0,
          },
        }],
      },
    }],
  };

  try {
    await fetch('/api/datadog/llm-obs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // fire-and-forget: use keepalive so the span survives page unload
      keepalive: true,
    });
  } catch {
    // observability must never crash the app
  }
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

/**
 * Wraps any async LLM call, automatically recording a Datadog LLM span.
 *
 * Usage:
 *   const response = await traceLLM(
 *     { model: 'gpt-4o', provider: 'openrouter', messages },
 *     () => OpenRouterOCRClient.chatCompletion(apiKey, payload)
 *   );
 */
export async function traceLLM<T extends {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}>(
  input: LLMSpanInput,
  fn: () => Promise<T>,
  opts?: { sessionId?: string; spanName?: string; tags?: string[] }
): Promise<T> {
  if (!DD_ENABLED) return fn();

  const traceId   = randomHex(8);
  const spanId    = randomHex(8);
  const startNs   = nowNs();
  const startTime = performance.now();

  try {
    const result   = await fn();
    const durationNs = Math.floor((performance.now() - startTime) * 1e6);

    const outputMessages = (result.choices ?? []).map(c => ({
      role: 'assistant',
      content: c.message?.content ?? '',
    }));

    await sendSpan({
      name:       opts?.spanName ?? `${input.provider}.chat`,
      traceId,
      spanId,
      startNs,
      durationNs,
      input,
      output: {
        messages:     outputMessages,
        inputTokens:  result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
        totalTokens:  result.usage?.total_tokens,
      },
      sessionId: opts?.sessionId,
      tags:      opts?.tags,
    });

    return result;
  } catch (err: any) {
    const durationNs = Math.floor((performance.now() - startTime) * 1e6);

    await sendSpan({
      name: opts?.spanName ?? `${input.provider}.chat`,
      traceId,
      spanId,
      startNs,
      durationNs,
      input,
      error: { message: err?.message ?? 'Unknown error', stack: err?.stack },
      sessionId: opts?.sessionId,
      tags:      opts?.tags,
    });

    throw err;
  }
}
