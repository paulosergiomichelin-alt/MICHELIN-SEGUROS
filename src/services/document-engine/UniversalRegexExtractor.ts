/**
 * UniversalRegexExtractor.ts
 * Deterministic regex patterns for common Brazilian document fields.
 */
import { DocumentNormalizationService } from './DocumentNormalizationService';

export interface RegexMatch {
  field: string;
  value: string;
  confidence: number;
}

export class UniversalRegexExtractor {
  // Patterns
  private static PATTERNS = {
    CPF: /[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}/g,
    CNH_REGISTRO: /\b[0-9]{11}\b/g,
    RENACH: /[A-Z]{2}[0-9]{9}/g,
    PLACA: /[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/g,
    CHASSI: /[A-HJ-NPR-Z0-9]{17}/g,
    DATE: /[0-9]{2}\/[0-9]{2}\/[0-9]{4}/g,
    RENAVAM: /\b[0-9]{9,11}\b/g,
    UF: /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g,
    SUSEP: /\b([0-9]{5}\.[0-9]{6}\/[0-9]{4}-[0-9]{2}|[0-9]{5}\.[0-9]{5}\/[0-9]{2}-[0-9]{1}|[0-9]{5,20})\b/g
  };

  /**
   * Extracts data using pure regex without AI.
   */
  public static extract(text: string): RegexMatch[] {
    const results: RegexMatch[] = [];
    const uText = text.toUpperCase();
    console.log('[REGEX_EXTRACTION] Scanning document text');

    // 1. CPF (Strict validation)
    const cpfMatches = uText.match(this.PATTERNS.CPF);
    if (cpfMatches) {
      const uniqueCpf = Array.from(new Set(cpfMatches.map(v => DocumentNormalizationService.cleanField(v, 'numbers'))));
      uniqueCpf.forEach(v => {
        if (v.length === 11) results.push({ field: 'cpf', value: v, confidence: 0.95 });
      });
    }

    // 2. PLACA
    const placaMatches = uText.match(this.PATTERNS.PLACA);
    if (placaMatches) {
      const uniquePlaca = Array.from(new Set(placaMatches.map(v => DocumentNormalizationService.cleanField(v, 'placa'))));
      uniquePlaca.forEach(v => results.push({ field: 'placa', value: v, confidence: 0.95 }));
    }

    // 3. CHASSI
    const chassiMatches = uText.match(this.PATTERNS.CHASSI);
    if (chassiMatches) {
      const uniqueChassi = Array.from(new Set(chassiMatches));
      uniqueChassi.forEach(v => results.push({ field: 'chassi', value: v, confidence: 0.98 }));
    }

    // 4. RENAVAM / CNH_REGISTRO
    const renavamMatches = uText.match(this.PATTERNS.RENAVAM);
    if (renavamMatches) {
      const uniqueRenavam = Array.from(new Set(renavamMatches));
      uniqueRenavam.forEach(v => {
         // High confidence if nearby "RENAVAM"
         const isNearLabel = uText.includes('RENAVAM') || uText.includes('REGISTRO');
         results.push({ field: 'renavam', value: v, confidence: isNearLabel ? 0.9 : 0.6 });
      });
    }

    // 5. CNH REGISTRO (Explicit lookup)
    const cnhRegMatches = uText.match(this.PATTERNS.CNH_REGISTRO);
    if (cnhRegMatches) {
      cnhRegMatches.forEach(v => results.push({ field: 'registration', value: v, confidence: 0.8 }));
    }

    // 6. RENACH
    const renachMatches = uText.match(this.PATTERNS.RENACH);
    if (renachMatches) {
      renachMatches.forEach(v => results.push({ field: 'renach', value: v, confidence: 0.95 }));
    }

    // 7. Dates
    const dateMatches = uText.match(this.PATTERNS.DATE);
    if (dateMatches) {
      dateMatches.forEach(v => results.push({ field: 'date', value: v, confidence: 0.7 }));
    }

    // 8. SUSEP
    const susepMatches = uText.match(this.PATTERNS.SUSEP);
    if (susepMatches) {
      susepMatches.forEach(v => {
        if (uText.includes('SUSEP')) {
          results.push({ field: 'brokerSusep', value: v, confidence: 0.9 });
        }
      });
    }

    return results;
  }
}
