/**
 * OCRRegionSchemaValidator.ts
 * Ensures OCR regions meet enterprise data integrity standards.
 */
export class OCRRegionSchemaValidator {
  private static readonly CNH_MANDATORY_FIELDS = [
    'nome'
  ];

  private static readonly CNH_CRITICAL_FIELDS = [
    'nome', 'cpf', 'validade', 'nascimento', 'registro'
  ];

  /**
   * Validates regional OCR output for CNH.
   */
  public static validateCNHRegions(regions: Record<string, string>): { 
    valid: boolean; 
    missing: string[]; 
    confidence: number 
  } {
    if (!regions) return { valid: false, missing: this.CNH_CRITICAL_FIELDS, confidence: 0 };

    const missingMandatory = this.CNH_MANDATORY_FIELDS.filter(field => {
      const val = regions[field];
      return !val || val.trim().length < 2;
    });

    const missingCritical = this.CNH_CRITICAL_FIELDS.filter(field => {
      const val = regions[field];
      return !val || val.trim().length < 2;
    });

    // Confidence heuristic based on fill rate
    const confidence = (this.CNH_CRITICAL_FIELDS.length - missingCritical.length) / this.CNH_CRITICAL_FIELDS.length;

    // Fail only if mandatory fields are missing (NOME). Critical fields (CPF/Reg/etc) are optional to prevent lead loss.
    const valid = missingMandatory.length === 0;

    return {
      valid,
      missing: missingCritical,
      confidence
    };
  }

  /**
   * Generic integrity check for mixed regions.
   */
  public static validateIntegrity(regions: any): boolean {
    if (!regions) return false;
    // Check if at least one field has value
    return Object.values(regions).some((v: any) => typeof v === 'string' && v.trim().length > 0);
  }
}
