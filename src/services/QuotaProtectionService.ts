
/**
 * Serviço de proteção de cota do Firestore.
 * Monitora o volume de tráfego e bloqueia operações excessivas.
 */
export class QuotaProtectionService {
  private static readCount = 0;
  private static writeCount = 0;
  private static lastReset = Date.now();

  private static READ_LIMIT = 300; // Máximo de leituras por minuto
  private static WRITE_LIMIT = 50;  // Máximo de escritas por minuto

  /**
   * Verifica se pode realizar uma leitura.
   */
  public static canRead(): boolean {
    this.checkReset();
    if (this.readCount >= this.READ_LIMIT) {
      console.warn("[QUOTA_PROTECTION] Limite de leitura atingido!");
      return false;
    }
    this.readCount++;
    return true;
  }

  /**
   * Verifica se pode realizar uma escrita.
   */
  public static canWrite(): boolean {
    this.checkReset();
    if (this.writeCount >= this.WRITE_LIMIT) {
      console.warn("[QUOTA_PROTECTION] Limite de escrita atingido!");
      return false;
    }
    this.writeCount++;
    return true;
  }

  private static checkReset() {
    const now = Date.now();
    if (now - this.lastReset > 60000) {
      this.readCount = 0;
      this.writeCount = 0;
      this.lastReset = now;
    }
  }

  public static getStats() {
    return {
      reads: this.readCount,
      writes: this.writeCount,
      limitReads: this.READ_LIMIT,
      limitWrites: this.WRITE_LIMIT
    };
  }
}
