/**
 * DocumentFingerprintService.ts
 * Generates a unique SHA-256 hash for document binary content to ensure reliable caching.
 */
export class DocumentFingerprintService {
  /**
   * Generates a fingerprint for a file based on its binary content.
   */
  public static async generate(file: File): Promise<string> {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Combine with size and date for extra collision protection
      return `${hashHex}_${file.size}_${file.lastModified}`;
    } catch (err) {
      console.error('[FINGERPRINT_ERROR]', err);
      // Fallback to weak fingerprint if crypto fails
      return `${file.name}_${file.size}_${file.lastModified}`;
    }
  }

  /**
   * Generates a fingerprint for a blob URL by fetching its content.
   */
  public static async generateFromUrl(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `${hashHex}_${blob.size}`;
    } catch (err) {
      console.error('[FINGERPRINT_URL_ERROR]', err);
      return `url_${btoa(url).substring(0, 32)}`;
    }
  }
}
