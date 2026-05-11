
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheService {
  private memoryCache = new Map<string, CacheItem<any>>();

  set<T>(key: string, data: T, ttlSeconds: number = 300, persist: boolean = false) {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000
    };

    this.memoryCache.set(key, item);

    if (persist) {
      try {
        localStorage.setItem(`cache_${key}`, JSON.stringify(item));
      } catch (e) {
        console.warn('Persistent cache save failed:', e);
      }
    }
  }

  get<T>(key: string, persist: boolean = false): T | null {
    // 1. Memory Check
    let item = this.memoryCache.get(key);

    // 2. Persistent Check if not in memory or memory stale
    if ((!item || this.isExpired(item)) && persist) {
      try {
        const saved = localStorage.getItem(`cache_${key}`);
        if (saved) {
          item = JSON.parse(saved);
          if (item) this.memoryCache.set(key, item); // re-populate memory
        }
      } catch (e) {
        console.warn('Persistent cache load failed:', e);
      }
    }

    if (!item) return null;

    if (this.isExpired(item)) {
      this.delete(key, persist);
      return null;
    }

    return item.data;
  }

  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  delete(key: string, persist: boolean = false) {
    this.memoryCache.delete(key);
    if (persist) {
      localStorage.removeItem(`cache_${key}`);
    }
  }

  clearAll(persist: boolean = true) {
    this.memoryCache.clear();
    if (persist) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('cache_'))
        .forEach(k => localStorage.removeItem(k));
    }
  }
}

export const cacheService = new CacheService();
