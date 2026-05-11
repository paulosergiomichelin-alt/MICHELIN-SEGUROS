
import { UserMetrics } from '../types';

/**
 * Motor para controle de atualização de métricas.
 * Impede loops infinitos e reduz escritas redundantes no Firestore.
 */
export class MetricsUpdateEngine {
  private static lastUpdate: Record<string, number> = {};
  private static THROTTLE_MS = 300000; // 5 minutos entre atualizações do mesmo usuário

  /**
   * Compara métricas atuais com novas para decidir se a escrita é necessária.
   */
  public static isUpdateNeeded(current: UserMetrics | undefined, next: UserMetrics): boolean {
    if (!current) return true;

    const hasChanges = 
      current.totalLeads !== next.totalLeads ||
      current.totalVendas !== next.totalVendas ||
      current.conversionRate !== next.conversionRate ||
      current.performanceLevel !== next.performanceLevel;

    if (!hasChanges) {
      console.log("[METRICS_SKIPPED_NO_CHANGES] Dados idênticos aos existentes.");
      return false;
    }

    return true;
  }

  /**
   * Verifica se o usuário está em "lock" de atualização (throttle).
   */
  public static canUpdate(userId: string): boolean {
    const now = Date.now();
    const last = this.lastUpdate[userId] || 0;
    
    if (now - last < this.THROTTLE_MS) {
      console.log(`[METRICS_THROTTLED] Aguardando janela de tempo para usuário ${userId}`);
      return false;
    }

    return true;
  }

  /**
   * Registra o timestamp da última atualização.
   */
  public static recordUpdate(userId: string): void {
    this.lastUpdate[userId] = Date.now();
  }
}
