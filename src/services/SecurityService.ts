
import { nanoid } from 'nanoid';

/**
 * SecurityService: Centraliza geração de IDs seguros e hashes criptográficos.
 * Substitui o uso de Math.random() e garante unicidade SaaS-grade.
 */
export class SecurityService {
  /**
   * Gera um ID único e seguro (nanoid — sem round-trip a nenhum backend).
   * Parâmetro de coleção mantido só por compatibilidade de assinatura com os
   * call-sites existentes; não influencia mais o ID gerado (antes era usado só
   * para namespacing dentro do gerador do Firestore).
   */
  public static generateId(_collName: string = 'temp'): string {
    return nanoid();
  }

  /**
   * Gera um UUID v4 (para uso interno onde o ID do Firestore não for ideal).
   */
  public static uuid(): string {
    return crypto.randomUUID();
  }

  /**
   * Cria um hash estável e determinístico para objetos de configuração ou queries.
   */
  public static stableHash(obj: any): string {
    const sortedStr = JSON.stringify(obj, Object.keys(obj || {}).sort());
    // Fallback simples para evitar dependência externa de crypto-js se não necessário agora
    // No futuro, podemos usar um SHA-256 se for crítico
    let hash = 0;
    for (let i = 0; i < sortedStr.length; i++) {
        const char = sortedStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
