/**
 * DocumentMemoryManager.ts
 * Enterprise-grade memory lifecycle management for binary assets and Blob URLs.
 * Implements reference counting to prevent premature revocation.
 */
export class DocumentMemoryManager {
  private static instance: DocumentMemoryManager;
  private references: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): DocumentMemoryManager {
    if (!this.instance) this.instance = new DocumentMemoryManager();
    return this.instance;
  }

  /**
   * Registers a URL and increments its reference count.
   */
  public register(url: string) {
    if (!url.startsWith('blob:')) return;
    const count = this.references.get(url) || 0;
    this.references.set(url, count + 1);
    console.log(`[MEMORY_MANAGER] Registered: ${url}, References: ${count + 1}`);
  }

  /**
   * Decrements reference count and revokes if zero (with grace period).
   */
  public release(url: string, delayMs: number = 30000) {
    if (!url || !url.startsWith('blob:')) return;
    const count = this.references.get(url);
    if (count === undefined) return;

    if (count <= 1) {
      this.references.set(url, 0); // Mark for deletion
      setTimeout(() => {
        // Re-check after delay
        const currentCount = this.references.get(url);
        if (currentCount === 0) {
          this.references.delete(url);
          try {
            URL.revokeObjectURL(url);
            console.log(`[MEMORY_MANAGER] Revoked (Delayed): ${url}`);
          } catch (e) {
            console.warn(`[MEMORY_MANAGER] Delayed revoke failed for ${url}`, e);
          }
        }
      }, delayMs);
    } else {
      this.references.set(url, count - 1);
      console.log(`[MEMORY_MANAGER] Released reference: ${url}, Remaining: ${count - 1}`);
    }
  }

  /**
   * Forces release of all references for a URL.
   */
  public purge(url: string) {
    if (!url || !url.startsWith('blob:')) return;
    this.references.delete(url);
    URL.revokeObjectURL(url);
  }

  /**
   * Helper to clean up canvas memory.
   */
  public cleanupCanvas(canvas: HTMLCanvasElement | null) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
  }
}
