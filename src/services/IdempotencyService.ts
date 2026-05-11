import { CacheManager } from './CacheManager';
import { logger } from './LoggerService';

/**
 * IdempotencyService: Evita a execução duplicada de eventos idênticos em janelas de tempo curtas.
 */
export class IdempotencyService {
  private static readonly TTL_WINDOW = 5000; // 5 seconds window for exact duplicate detection

  /**
   * Verifica se um evento já foi processado recentemente.
   * Chave única composta por: tipo_evento + id_recurso + fingerprint_dados
   */
  public static async isDuplicate(key: string): Promise<boolean> {
    const cacheKey = `idempotency:${key}`;
    const existing = CacheManager.get(cacheKey);
    
    if (existing) {
      logger.warn('IDEMPOTENCY', `Duplicate event detected: ${key}`);
      return true;
    }

    CacheManager.set(cacheKey, { timestamp: Date.now() }, this.TTL_WINDOW);
    return false;
  }

  /**
   * Gera uma chave de idempotência para uma mensagem
   */
  public static getMessageKey(leadId: string, text: string): string {
    const cleanText = text.trim().toLowerCase();
    return `msg:${leadId}:${this.hash(cleanText)}`;
  }

  private static hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }
}
