
/**
 * Controlador de inicialização do sistema.
 * Garante que o preload ocorra apenas uma vez por sessão.
 */
export class PreloadController {
  private static isInitialized = false;

  /**
   * Verifica se o preload já foi executado.
   */
  public static shouldPreload(): boolean {
    if (this.isInitialized) {
      console.log("[PRELOAD_SKIPPED] O sistema já foi inicializado nesta sessão.");
      return false;
    }
    return true;
  }

  /**
   * Marca o sistema como inicializado se houver dados válidos.
   */
  public static markAsInitialized(hasData: boolean = true): void {
    if (!hasData) {
      console.warn("[PRELOAD_VALIDATION_FAILED] Nenhum dado real encontrado. Permitindo tentativa futura.");
      return;
    }
    this.isInitialized = true;
    console.log("[PRELOAD_CONTRIBUTION] Sistema marcado como inicializado com sucesso.");
  }

  /**
   * Reseta o estado (usado no logout).
   */
  public static reset(): void {
    this.isInitialized = false;
  }
}
