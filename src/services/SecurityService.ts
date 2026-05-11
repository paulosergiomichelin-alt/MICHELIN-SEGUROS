
import { collection, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * SecurityService: Centraliza geração de IDs seguros e hashes criptográficos.
 * Substitui o uso de Math.random() e garante unicidade SaaS-grade.
 */
export class SecurityService {
  /**
   * Gera um ID único e seguro usando o gerador do Firestore.
   * Coleção opcional para contexto, mas o ID é gerado no client sem round-trip.
   */
  public static generateId(collName: string = 'temp'): string {
    return doc(collection(db, collName)).id;
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
