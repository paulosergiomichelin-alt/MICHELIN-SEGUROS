import { CacheManager } from './CacheManager';

export class DocumentProcessingCache {
  /**
   * Generates a unique fingerprint for a file.
   */
  public static generateFingerprint(file: File): string {
    return `doc_v1:${file.name}_${file.size}_${file.lastModified}`;
  }

  /**
   * Checks if a document has already been processed.
   */
  public static get(file: File): any | null {
    const fingerprint = this.generateFingerprint(file);
    const cached = CacheManager.get(fingerprint);
    if (cached) {
      console.log(`[DOC_CACHE] Hit for ${file.name}`);
      return JSON.parse(cached);
    }
    return null;
  }

  /**
   * Stores processing results for a document.
   */
  public static set(file: File, result: any): void {
    const fingerprint = this.generateFingerprint(file);
    console.log(`[DOC_CACHE] Storing result for ${file.name}`);
    CacheManager.set(fingerprint, JSON.stringify(result));
  }
}
