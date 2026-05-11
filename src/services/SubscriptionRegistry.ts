
import { Unsubscribe } from 'firebase/firestore';

/**
 * Registro de assinaturas Realtime.
 * Evita a criação de múltiplos listeners para o mesmo recurso.
 */
export class SubscriptionRegistry {
  private static subscriptions: Map<string, { unsubscribe: Unsubscribe, count: number, terminationTimer?: NodeJS.Timeout }> = new Map();

  /**
   * Registra ou reutiliza uma assinatura.
   */
  public static register(key: string, createFn: () => Unsubscribe): Unsubscribe {
    let existing = this.subscriptions.get(key);

    if (existing) {
      // Se havia um timer de encerramento pendente, cancele-o
      if (existing.terminationTimer) {
        clearTimeout(existing.terminationTimer);
        existing.terminationTimer = undefined;
        console.log(`[SUBSCRIPTION_REVIVED] Cancelado encerramento pendente para: ${key}`);
      }
      
      console.log(`[SUBSCRIPTION_REUSED] Reutilizando listener para: ${key} (count: ${existing.count + 1})`);
      existing.count++;
    } else {
      console.log(`[SUBSCRIPTION_CREATED] Nova assinatura Firestore: ${key}`);
      const unsubscribe = createFn();
      existing = { unsubscribe, count: 1 };
      this.subscriptions.set(key, existing);
    }

    // Retorna uma função de proxy que gerencia o count
    return () => {
      this.unregister(key);
    };
  }

  /**
   * Remove uma assinatura do registro.
   * Implementa um delay para evitar flapping em remounts rápidos.
   */
  public static unregister(key: string): void {
    const existing = this.subscriptions.get(key);
    if (!existing) return;

    existing.count--;
    
    if (existing.count <= 0) {
      // Não encerre imediatamente. Aguarde um ciclo para ver se haverá re-subscription (Anti-Flapping)
      if (existing.terminationTimer) clearTimeout(existing.terminationTimer);
      
      existing.terminationTimer = setTimeout(() => {
        if (existing.count <= 0) {
          console.log(`[SUBSCRIPTION_TERMINATED] Encerrando listener: ${key}`);
          existing.unsubscribe();
          this.subscriptions.delete(key);
        }
      }, 500); // 500ms grace period handles React StrictMode and micro-tasks
    }
  }

  /**
   * Limpa todas as assinaturas (Logout).
   */
  public static clearAll(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions.clear();
    console.log("[SUBSCRIPTION_REGISTRY_CLEARED] Todos os listeners encerrados.");
  }
}
