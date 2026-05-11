/**
 * PDFResourceManager.ts
 * Manages PDF document instances to prevent redundant loading and aborts.
 * NO-AI ENTERPRISE PIPELINE.
 */
import * as pdfjsLib from 'pdfjs-dist';

export class PDFResourceManager {
  private static documentCache = new Map<string, any>();
  private static loadingPromises = new Map<string, Promise<any>>();

  /**
   * Loads or retrieves a cached PDF document.
   */
  public static async getDocument(source: string | Uint8Array, id: string): Promise<any> {
    const cacheKey = id;
    
    if (this.documentCache.has(cacheKey)) {
      console.log(`[PDF_CACHE_HIT] Reusing document: ${id}`);
      return this.documentCache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      console.log(`[PDF_CACHE_WAITING] Waiting for document: ${id}`);
      return this.loadingPromises.get(cacheKey);
    }

    console.log(`[PDF_CACHE_MISS] Loading document: ${id}`);
    const loadPromise = (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(typeof source === 'string' ? { url: source } : { data: source });
        const pdf = await loadingTask.promise;
        this.documentCache.set(cacheKey, pdf);
        return pdf;
      } catch (err) {
        console.error('[PDF_CACHE_LOAD_FAILED]', id, err);
        throw err;
      } finally {
        this.loadingPromises.delete(cacheKey);
      }
    })();

    this.loadingPromises.set(cacheKey, loadPromise);
    return loadPromise;
  }

  /**
   * Clears a specific document from cache.
   */
  public static async release(id: string) {
    const pdf = this.documentCache.get(id);
    if (pdf) {
      try { 
        await pdf.destroy(); 
      } catch (e) {
        console.warn('[PDF_RESOURCE] Release failed for document:', id, e);
      }
    }
    this.documentCache.delete(id);
    this.loadingPromises.delete(id);
  }
}
