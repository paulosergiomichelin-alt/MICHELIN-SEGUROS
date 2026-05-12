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
const DIRECT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 20000;

export class OpenRouterOCRClient {
  /**
   * POST /chat/completions.
   *
   * Strategy:
   *   1. Direct browser→OpenRouter call (their CORS supports this; the API key
   *      is already in the browser, so the proxy was only obfuscation).
   *      Eliminates the local Express body-parser as a failure point (413).
   *   2. If direct fails with a CORS error or network blockage, fall back to
   *      the local proxy so on-prem environments with a real backend still work.
   */
  public static async chatCompletion(
    apiKey: string,
    payload: OpenRouterChatRequest,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<OpenRouterChatResponse> {
    if (!apiKey) throw new Error('OPENROUTER_API_KEY_MISSING');

    try {
      return await this.chatCompletionDirect(apiKey, payload, timeoutMs);
    } catch (err: any) {
      const msg = err?.message || '';
      // CORS errors / network blockages → try proxy. Real HTTP errors (4xx/5xx) bubble up.
      const transient = msg.includes('CORS') || msg.includes('NetworkError') || msg.includes('Failed to fetch') || msg === 'DIRECT_NETWORK_ERROR';
      if (transient) {
        console.warn('[OPENROUTER_DIRECT_FAIL] Falling back to local proxy:', msg);
        return await this.chatCompletionViaProxy(apiKey, payload, timeoutMs);
      }
      throw err;
    }
  }

  /** Direct browser→OpenRouter chat completion (preferred). */
  private static async chatCompletionDirect(
    apiKey: string,
    payload: OpenRouterChatRequest,
    timeoutMs: number
  ): Promise<OpenRouterChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const referer = typeof window !== 'undefined' ? window.location.origin : 'https://michelin-seguros.local';
      const res = await fetch(DIRECT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'Michelin Seguros CRM'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`OPENROUTER_HTTP_${res.status}: ${errorText.substring(0, 200)}`);
      }
      const body = await res.json() as OpenRouterChatResponse;
      if (body.error) throw new Error(`OPENROUTER_API_ERROR: ${body.error.message}`);
      return body;
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('OPENROUTER_TIMEOUT');
      // fetch throws TypeError 'Failed to fetch' on CORS/network issues
      if (err.name === 'TypeError') throw new Error('DIRECT_NETWORK_ERROR');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Legacy path: chat completion through the local /api/proxy/openrouter/request route. */
  private static async chatCompletionViaProxy(
    apiKey: string,
    payload: OpenRouterChatRequest,
    timeoutMs: number
  ): Promise<OpenRouterChatResponse> {
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
      if (body.error) throw new Error(`OPENROUTER_API_ERROR: ${body.error.message}`);
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
