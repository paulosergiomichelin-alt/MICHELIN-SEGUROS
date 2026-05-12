/**
 * OpenRouterOCRClient.ts
 *
 * Thin HTTP client for OpenRouter chat completions, going through the local
 * backend proxy (/api/proxy/openrouter/request) so the API key never reaches
 * the browser network logs.
 *
 * Used by AIHybridOCRService to dispatch image+prompt requests to vision models.
 */

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export interface OpenRouterProviderRouting {
  sort?: 'price' | 'throughput' | 'latency' | { by: 'price' | 'throughput' | 'latency'; partition?: 'model' | 'none' };
  order?: string[];
  only?: string[];
  ignore?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: 'allow' | 'deny';
  zdr?: boolean;
  preferred_max_latency?: number | { p50?: number; p75?: number; p90?: number; p99?: number };
  preferred_min_throughput?: number | { p50?: number; p75?: number; p90?: number; p99?: number };
}

export interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  provider?: OpenRouterProviderRouting;
}

export interface OpenRouterChatResponse {
  choices: Array<{ message: { content: string }; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model?: string;
  error?: { message: string; code?: string };
}

const PROXY_ENDPOINT = '/api/proxy/openrouter/request';
const DEFAULT_TIMEOUT_MS = 20000;

export class OpenRouterOCRClient {
  /**
   * POST /chat/completions through the local backend proxy.
   * Returns the raw response and throws on transport/HTTP errors.
   */
  public static async chatCompletion(
    apiKey: string,
    payload: OpenRouterChatRequest,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<OpenRouterChatResponse> {
    if (!apiKey) throw new Error('OPENROUTER_API_KEY_MISSING');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          method: 'POST',
          endpoint: '/chat/completions',
          data: payload
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`OPENROUTER_HTTP_${res.status}: ${errorText.substring(0, 200)}`);
      }
      const body = await res.json() as OpenRouterChatResponse;
      if (body.error) {
        throw new Error(`OPENROUTER_API_ERROR: ${body.error.message}`);
      }
      return body;
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('OPENROUTER_TIMEOUT');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Resolve the OpenRouter API key from app settings or Vite env. */
  public static resolveApiKey(): string {
    try {
      // 1) Settings stored by SettingsPage (most authoritative)
      const raw = localStorage.getItem('app_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        const fromConfig = parsed?.openrouter_api_key || parsed?.openrouterApiKey;
        if (fromConfig && typeof fromConfig === 'string' && fromConfig.length > 10) return fromConfig;
      }
    } catch { /* ignore */ }
    // 2) Build-time env
    const fromEnv = (import.meta as any).env?.VITE_OPENROUTER_API_KEY;
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 10) return fromEnv;
    return '';
  }
}
