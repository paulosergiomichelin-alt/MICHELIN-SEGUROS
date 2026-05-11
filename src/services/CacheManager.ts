
import { logger } from './LoggerService';

export type CacheTTL = {
  LEAD_ACTIVE: number;
  LEAD_COLD: number;
  SETTINGS: number;
  CONFIG: number;
  MESSAGES: number;
  AI_RESPONSE: number;
  DEFAULT: number;
};

export const TTL_VALUES: CacheTTL = {
  LEAD_ACTIVE: 30000,   // 30s
  LEAD_COLD: 300000,    // 5min
  SETTINGS: 600000,   // 10min
  CONFIG: 1800000,    // 30min
  MESSAGES: 60000,     // 1min
  AI_RESPONSE: 900000, // 15min
  DEFAULT: 60000
};

export class CacheManager {
  private static memoryCache: Map<string, { data: any, timestamp: number }> = new Map();
  
  static get(key: string): any | null {
    const cached = this.memoryCache.get(key);
    if (!cached) {
      this.trackMetric('cache_miss', { key });
      return null;
    }
    
    this.trackMetric('cache_hit', { key });
    return cached.data;
  }

  static getWithExpiry(key: string, ttl: number): any | null {
    const cached = this.memoryCache.get(key);
    if (!cached) {
      this.trackMetric('cache_miss', { key });
      return null;
    }
    
    if (Date.now() - cached.timestamp > ttl) {
      this.memoryCache.delete(key);
      this.trackMetric('cache_miss', { key, reason: 'expired' });
      return null;
    }
    
    this.trackMetric('cache_hit', { key });
    return cached.data;
  }

  static getSmart(key: string, entity: string): any | null {
    let ttl = TTL_VALUES.DEFAULT;
    if (entity === 'lead') ttl = TTL_VALUES.LEAD_ACTIVE;
    if (entity === 'settings') ttl = TTL_VALUES.SETTINGS;
    if (entity === 'config') ttl = TTL_VALUES.CONFIG;
    if (entity === 'message') ttl = TTL_VALUES.MESSAGES;
    
    return this.getWithExpiry(key, ttl);
  }

  static set(key: string, data: any, timestamp: number = Date.now()): void {
    this.memoryCache.set(key, { data, timestamp });
    
    // Optional: Sync to localStorage for persistent settings
    if (key.startsWith('settings:') || key.startsWith('config:') || key.startsWith('auth:')) {
      try {
        localStorage.setItem(`cache:${key}`, JSON.stringify({ data, timestamp }));
      } catch (e) {
        // Ignore quota errors
      }
    }
  }

  static invalidate(key: string): void {
    this.memoryCache.delete(key);
    localStorage.removeItem(`cache:${key}`);
  }

  static invalidatePattern(pattern: string): void {
    const keysArray = Array.from(this.memoryCache.keys());
    let invalidatedCount = 0;
    keysArray.forEach(key => {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
        localStorage.removeItem(`cache:${key}`);
        invalidatedCount++;
      }
    });

    if (invalidatedCount > 0) {
      this.trackMetric('cache_invalidation_pattern', { pattern, count: String(invalidatedCount) });
    }
  }

  private static trackMetric(name: string, tags: Record<string, string>) {
    // REDUCED CHATTINESS: Only track critical or batch metrics
    // We avoid tracking every single get() to save main thread and network
    if (name === 'cache_invalidation_pattern') {
      try {
         if (typeof window !== 'undefined' && (window as any).metricsService) {
           (window as any).metricsService.track(name, 1, tags);
         }
      } catch (e) {
        logger.error('CACHE', 'Error tracking metric', e);
      }
    }
  }

  static clearAll(): void {
    this.memoryCache.clear();
  }

  static initFromStorage(): void {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cache:')) {
        try {
          const cached = JSON.parse(localStorage.getItem(key)!);
          this.memoryCache.set(key.replace('cache:', ''), cached);
        } catch (e) {
          localStorage.removeItem(key);
        }
      }
    }
  }
}

// Initialize on load
if (typeof window !== 'undefined') {
  CacheManager.initFromStorage();
}
