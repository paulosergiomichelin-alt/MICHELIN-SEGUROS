/**
 * AIOCRMetricsService.ts
 *
 * In-memory + localStorage-backed metrics and event log for the AI OCR
 * pipeline. Used by the settings panel to render real-time activity,
 * counters, and aggregate KPIs.
 *
 * Events emitted by AIHybridOCRService (and any future pipeline step)
 * are pushed here through `record*` methods; UI components subscribe
 * via `subscribe()` to get push updates.
 */

export type AIOCRLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface AIOCRLogEntry {
  id: string;
  ts: number;
  level: AIOCRLogLevel;
  tag: string;
  message: string;
  meta?: Record<string, any>;
}

export interface AIOCRStats {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  fallbackCount: number;
  cacheHits: number;
  totalLatencyMs: number; // running sum
  totalConfidence: number; // running sum, percentage points
  lastEventTs: number | null;
  perType: Record<string, { processed: number; success: number; fail: number }>;
}

const MAX_LOGS = 200;
const LS_LOGS = 'ai_ocr_logs_v1';
const LS_STATS = 'ai_ocr_stats_v1';

type Listener = (logs: AIOCRLogEntry[], stats: AIOCRStats) => void;

export class AIOCRMetricsService {
  private static logs: AIOCRLogEntry[] = [];
  private static stats: AIOCRStats = {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    fallbackCount: 0,
    cacheHits: 0,
    totalLatencyMs: 0,
    totalConfidence: 0,
    lastEventTs: null,
    perType: {}
  };
  private static listeners = new Set<Listener>();
  private static loaded = false;

  /** Lazy-load persisted state on first read. Safe to call repeatedly. */
  public static ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(LS_LOGS);
      if (raw) this.logs = JSON.parse(raw);
    } catch { /* noop */ }
    try {
      const raw = localStorage.getItem(LS_STATS);
      if (raw) this.stats = { ...this.stats, ...JSON.parse(raw) };
    } catch { /* noop */ }
  }

  /** Push a log entry (capped at MAX_LOGS), persist asynchronously. */
  public static log(level: AIOCRLogLevel, tag: string, message: string, meta?: Record<string, any>) {
    this.ensureLoaded();
    const entry: AIOCRLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ts: Date.now(),
      level,
      tag,
      message: this.maskSensitive(message),
      meta: meta ? this.sanitizeMeta(meta) : undefined
    };
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOGS) this.logs.length = MAX_LOGS;
    this.stats.lastEventTs = entry.ts;
    this.persist();
    this.notify();
  }

  /** Convenience: record the start of an extraction. */
  public static recordStart(documentType: string) {
    this.log('info', 'AI_OCR_START', `Processing ${documentType.toUpperCase()}`, { type: documentType });
    this.stats.perType[documentType] = this.stats.perType[documentType] || { processed: 0, success: 0, fail: 0 };
    this.stats.perType[documentType].processed++;
    this.stats.totalProcessed++;
  }

  /** Convenience: record a successful extraction. */
  public static recordSuccess(documentType: string, confidence: number, latencyMs: number, cached?: boolean) {
    this.stats.successCount++;
    this.stats.totalLatencyMs += latencyMs;
    this.stats.totalConfidence += confidence;
    this.stats.perType[documentType] = this.stats.perType[documentType] || { processed: 0, success: 0, fail: 0 };
    this.stats.perType[documentType].success++;
    if (cached) this.stats.cacheHits++;
    this.log('success', 'OCR_SUCCESS', `${documentType.toUpperCase()} extracted (${confidence}% conf, ${latencyMs}ms${cached ? ', cached' : ''})`, { type: documentType, confidence, latency: latencyMs });
    this.persist();
    this.notify();
  }

  /** Convenience: record a failure (counted, also triggers fallback). */
  public static recordFailure(documentType: string, reason: string, latencyMs: number) {
    this.stats.failureCount++;
    this.stats.fallbackCount++;
    this.stats.totalLatencyMs += latencyMs;
    this.stats.perType[documentType] = this.stats.perType[documentType] || { processed: 0, success: 0, fail: 0 };
    this.stats.perType[documentType].fail++;
    this.log('error', 'OCR_ERROR', `${documentType.toUpperCase()} failed: ${reason}`, { type: documentType, reason, latency: latencyMs });
    this.persist();
    this.notify();
  }

  /** Generic event for callers that don't fit the success/failure pattern. */
  public static recordEvent(tag: string, message: string, meta?: Record<string, any>) {
    this.log('info', tag, message, meta);
  }

  public static getLogs(): AIOCRLogEntry[] {
    this.ensureLoaded();
    return this.logs;
  }

  public static getStats(): AIOCRStats {
    this.ensureLoaded();
    return this.stats;
  }

  public static getAverageLatency(): number {
    const denom = this.stats.successCount + this.stats.failureCount;
    return denom === 0 ? 0 : Math.round(this.stats.totalLatencyMs / denom);
  }

  public static getAverageConfidence(): number {
    return this.stats.successCount === 0 ? 0 : Math.round(this.stats.totalConfidence / this.stats.successCount);
  }

  public static getSuccessRate(): number {
    const denom = this.stats.successCount + this.stats.failureCount;
    return denom === 0 ? 0 : Math.round((this.stats.successCount / denom) * 100);
  }

  public static reset() {
    this.logs = [];
    this.stats = {
      totalProcessed: 0, successCount: 0, failureCount: 0, fallbackCount: 0, cacheHits: 0,
      totalLatencyMs: 0, totalConfidence: 0, lastEventTs: null, perType: {}
    };
    try {
      localStorage.removeItem(LS_LOGS);
      localStorage.removeItem(LS_STATS);
    } catch { /* noop */ }
    this.notify();
  }

  public static subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private static notify() {
    for (const l of this.listeners) {
      try { l(this.logs, this.stats); } catch { /* listener error */ }
    }
  }

  private static persist() {
    try {
      localStorage.setItem(LS_LOGS, JSON.stringify(this.logs.slice(0, 100)));
      localStorage.setItem(LS_STATS, JSON.stringify(this.stats));
    } catch { /* quota */ }
  }

  private static maskSensitive(text: string): string {
    if (!text) return '';
    let masked = text;
    masked = masked.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '***.***.***-**');
    masked = masked.replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '**.***.***/****-**');
    masked = masked.replace(/sk-or-[A-Za-z0-9\-_]{8,}/g, 'sk-or-****');
    return masked;
  }

  private static sanitizeMeta(meta: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === 'string') out[k] = this.maskSensitive(v);
      else if (typeof v === 'number' || typeof v === 'boolean' || v == null) out[k] = v;
      // Drop deep objects/arrays from log payload to keep storage small.
    }
    return out;
  }
}
