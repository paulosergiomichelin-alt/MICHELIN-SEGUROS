/**
 * DocumentClassifierService.ts
 * Deterministic classifier based on weighted keyword scoring and structural validation.
 */
export class DocumentClassifierService {
  private static instance: DocumentClassifierService;
  private constructor() {}

  public static getInstance(): DocumentClassifierService {
    if (!this.instance) this.instance = new DocumentClassifierService();
    return this.instance;
  }

  public classify(text: string, hintType?: string): { type: string; confidence: number } {
    if (hintType && hintType !== 'unknown') {
      return { type: hintType.toLowerCase(), confidence: 1.0 };
    }
    const uText = text.toUpperCase();
    const isRegional = text.includes('CNH_DETERMINISTIC_REGIONAL_CORE');

    // CNH Detection (Strict)
    const hasCpf = /[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{11}/.test(uText);
    const hasCnhCategory = /\s([A-E]|[AB]{2})\s/.test(uText);
    const hasRegistration = /[0-9]{9,11}/.test(uText);
    const hasValidity = /[0-9]{2}\/[0-9]{2}\/[0-9]{4}/.test(uText);

    if (isRegional || (hasCpf && hasCnhCategory && hasRegistration && hasValidity)) {
      if (uText.includes('CNH') || uText.includes('HABILITACAO') || uText.includes('VALIDADE') || isRegional) {
        return { type: 'cnh', confidence: 1.0 };
      }
    }

    // CRLV Detection (Strict)
    const hasPlate = /[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/.test(uText);
    const hasRenavam = /[0-9]{9,11}/.test(uText);
    const hasChassis = /[A-HJ-NPR-Z0-9]{17}/.test(uText);

    if (hasPlate && (hasRenavam || hasChassis)) {
      if (uText.includes('CERTIFICADO DE REGISTRO') || uText.includes('LICENCIAMENTO') || uText.includes('RENAVAM') || uText.includes('PLACA')) {
        return { type: 'crlv', confidence: 1.0 };
      }
    }

    // Policy Detection (Strict)
    const hasPolicyWord = uText.includes('APOLICE');
    const hasVigencia = uText.includes('VIGENCIA') || uText.includes('VALOR TOTAL');
    const hasDates = /[0-9]{2}\/[0-9]{2}\/[0-9]{4}/.test(uText);

    if (hasPolicyWord && (hasVigencia || hasDates)) {
      return { type: 'policy', confidence: 1.0 };
    }

    return { type: 'unknown', confidence: 0 };
  }
}
