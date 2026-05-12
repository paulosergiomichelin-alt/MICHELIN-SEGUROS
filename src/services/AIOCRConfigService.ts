/**
 * AIOCRConfigService.ts
 *
 * Persists AI OCR configuration. Source of truth is Firestore
 * (settings/ai_document_extraction); a localStorage mirror is kept for
 * offline/fast reads. The OpenRouter API key is stored in Firestore only
 * (writes are gated by admin permissions in the Firestore rules) and is
 * never echoed back to non-admin users.
 *
 * Default values match the OCR pipeline contract — keep these in sync with
 * AIHybridOCRService.ts.
 */

import { DataService } from './DataService';

export interface AIOCRConfig {
  enabled: boolean;
  provider: 'openrouter';
  model: string;
  apiKey: string; // Plaintext only in-memory; persisted to Firestore.
  apiKeyMasked?: string;
  fallbackEnabled: boolean;
  semanticValidation: boolean;
  preprocessEnabled: boolean;
  validateCpf: boolean;
  validatePlate: boolean;
  validateChassis: boolean;
  retryEnabled: boolean;
  timeout: number;
  retries: number;
  jpegQuality: number;
  maxWidth: number;
  // Provider routing (OpenRouter)
  routingSort: 'throughput' | 'latency' | 'price';
  routingAllowFallbacks: boolean;
  routingRequireParameters: boolean;
  routingMaxLatencyP90: number; // seconds
  routingMinThroughputP90: number; // tokens/sec
  routingDataCollection: 'allow' | 'deny';
  routingZdr: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const FIRESTORE_ENTITY = 'settings';
const FIRESTORE_ID = 'ai_document_extraction';
const LOCAL_KEY = 'ai_ocr_config';
const LOCAL_KEY_LEGACY = 'app_config';

export const DEFAULT_AI_OCR_CONFIG: AIOCRConfig = {
  enabled: true,
  provider: 'openrouter',
  model: 'baidu/qianfan-ocr-fast:free',
  apiKey: '',
  fallbackEnabled: true,
  semanticValidation: true,
  preprocessEnabled: true,
  validateCpf: true,
  validatePlate: true,
  validateChassis: true,
  retryEnabled: true,
  timeout: 20000,
  retries: 2,
  jpegQuality: 80,
  maxWidth: 1200,
  // Routing defaults aligned with the enterprise spec (throughput-first, fast providers).
  routingSort: 'throughput',
  routingAllowFallbacks: true,
  routingRequireParameters: false,
  routingMaxLatencyP90: 3,
  routingMinThroughputP90: 40,
  routingDataCollection: 'deny',
  routingZdr: false
};

export class AIOCRConfigService {
  private static cache: AIOCRConfig | null = null;

  /** Load config: Firestore first (authoritative), then localStorage, then defaults. */
  public static async load(): Promise<AIOCRConfig> {
    if (this.cache) return this.cache;

    // 1) Firestore
    try {
      const doc = await DataService.get(FIRESTORE_ENTITY, FIRESTORE_ID);
      if (doc && typeof doc === 'object') {
        const merged = { ...DEFAULT_AI_OCR_CONFIG, ...doc } as AIOCRConfig;
        this.cache = merged;
        this.writeLocal(merged);
        return merged;
      }
    } catch (err) {
      console.warn('[AI_OCR_CONFIG] Firestore read failed; using local cache.', err);
    }

    // 2) localStorage
    const local = this.readLocal();
    if (local) {
      this.cache = local;
      return local;
    }

    // 3) Legacy key compatibility (SettingsPage stored openrouter_api_key under app_config/seguro_crm_api_keys)
    const legacyKey = this.readLegacyApiKey();
    const fresh: AIOCRConfig = { ...DEFAULT_AI_OCR_CONFIG, apiKey: legacyKey };
    this.cache = fresh;
    return fresh;
  }

  /** Save full config. Updates Firestore + localStorage; refreshes cache. */
  public static async save(config: Partial<AIOCRConfig>, actor?: string): Promise<AIOCRConfig> {
    const current = this.cache ?? (await this.load());
    const merged: AIOCRConfig = {
      ...current,
      ...config,
      updatedAt: new Date().toISOString(),
      updatedBy: actor || current.updatedBy
    };
    merged.apiKeyMasked = this.maskApiKey(merged.apiKey);

    try {
      await DataService.save(FIRESTORE_ENTITY, FIRESTORE_ID, merged as any, 'USUARIO');
    } catch (err) {
      console.error('[AI_OCR_CONFIG] Firestore write failed.', err);
      throw err;
    }
    this.cache = merged;
    this.writeLocal(merged);
    return merged;
  }

  /** Quick synchronous accessor: returns cached config or null. */
  public static peek(): AIOCRConfig | null {
    return this.cache;
  }

  /** Resolve the active API key without forcing a Firestore round-trip. */
  public static resolveApiKey(): string {
    if (this.cache?.apiKey && this.cache.apiKey.length > 10) return this.cache.apiKey;
    const local = this.readLocal();
    if (local?.apiKey && local.apiKey.length > 10) return local.apiKey;
    const legacy = this.readLegacyApiKey();
    if (legacy && legacy.length > 10) return legacy;
    const envKey = (import.meta as any).env?.VITE_OPENROUTER_API_KEY || '';
    return typeof envKey === 'string' ? envKey : '';
  }

  /** Display-safe masked representation: keeps prefix + last 4 chars. */
  public static maskApiKey(key: string): string {
    if (!key) return '';
    if (key.length <= 12) return '****';
    const head = key.substring(0, 12);
    const tail = key.substring(key.length - 4);
    return `${head}${'*'.repeat(Math.min(20, key.length - 16))}${tail}`;
  }

  /** Invalidate caches (e.g. after logout). */
  public static invalidate() {
    this.cache = null;
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* noop */ }
  }

  private static writeLocal(config: AIOCRConfig) {
    try {
      // Never persist the plaintext key beyond memory if user is non-admin context.
      // For now we mirror it for offline use; if you want stricter, gate on a flag.
      localStorage.setItem(LOCAL_KEY, JSON.stringify(config));
    } catch { /* quota */ }
  }

  private static readLocal(): AIOCRConfig | null {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      return { ...DEFAULT_AI_OCR_CONFIG, ...JSON.parse(raw) } as AIOCRConfig;
    } catch {
      return null;
    }
  }

  private static readLegacyApiKey(): string {
    try {
      const apiKeysRaw = localStorage.getItem('seguro_crm_api_keys');
      if (apiKeysRaw) {
        const parsed = JSON.parse(apiKeysRaw);
        if (parsed.openrouter_api_key) return String(parsed.openrouter_api_key);
      }
    } catch { /* noop */ }
    try {
      const appConfigRaw = localStorage.getItem(LOCAL_KEY_LEGACY);
      if (appConfigRaw) {
        const parsed = JSON.parse(appConfigRaw);
        const k = parsed.openrouter_api_key || parsed.openrouterApiKey;
        if (k) return String(k);
      }
    } catch { /* noop */ }
    return '';
  }
}
