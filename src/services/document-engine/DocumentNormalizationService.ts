/**
 * DocumentNormalizationService.ts
 * Enterprise-grade text cleaning pipeline for OCR output.
 */
export class DocumentNormalizationService {
  /**
   * Cleans and normalizes raw OCR text for extraction.
   */
  public static normalize(text: string): string {
    if (!text) return '';

    console.log('[DOCUMENT_NORMALIZATION] Starting text cleanup');

    // 1. Convert to Uppercase
    let normalized = text.toUpperCase();

    // 2. Unicode Normalization (Preserve structure)
    normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    // 3. Remove Invisible characters and common OCR artifacts (Preserve line breaks)
    // eslint-disable-next-line no-control-regex
    normalized = normalized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD]/g, ' ');

    // 4. Preserve line structure, collapse only empty double breaks
    normalized = normalized.replace(/\n\s*\n/g, '\n');

    // 5. Standardize horizontal whitespace but preserve newlines
    normalized = normalized.replace(/[^\S\r\n]+/g, ' ');
    
    // 6. Trim lines
    normalized = normalized.split('\n').map(l => l.trim()).join('\n');
    
    // 7. Trim overall
    normalized = normalized.trim();

    console.log('[DOCUMENT_NORMALIZED] Length:', normalized.length);
    return normalized;
  }

  /**
   * Specifically cleans fields like CPF, Placa, etc.
   */
  public static cleanField(value: string, type: 'numbers' | 'alphanumeric' | 'placa'): string {
    if (!value) return '';
    
    switch (type) {
      case 'numbers':
        return value.replace(/\D/g, '');
      case 'placa':
        // Modern Mercosul or legacy AAA-0000
        return value.replace(/[^A-Z0-9]/g, '');
      case 'alphanumeric':
        return value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
      default:
        return value.trim();
    }
  }
}
