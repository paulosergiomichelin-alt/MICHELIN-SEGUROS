/**
 * VehicleRestrictionEngine.ts
 * Detects financial restrictions (alienação fiduciária, gravame) in vehicle documents.
 */
export class VehicleRestrictionEngine {
  private static KEYWORDS = [
    'ALIENACAO', 'GRAVAME', 'LEASING', 'ARRENDAMENTO', 
    'RESERVA DOMINIO', 'FIDUCIARIA', 'ALIENADO'
  ];

  private static FINANCIAL_INSTITUTIONS = [
    'BANCO', 'BRADESCO', 'ITAU', 'SANTANDER', 'BV FINANCEIRA', 
    'PAN', 'SAFRA', 'VOLKSWAGEN', 'FORD', 'GM', 'FIAT', 'RCI',
    'DAYCOVAL', 'PONTUAL', 'MERCEDES', 'TOYOTA', 'HONDA', 'SCOTIABANK'
  ];

  // Negation phrases that mean "no restriction" even when the label word appears
  private static NEGATION_PATTERNS = [
    'SEM GRAVAME', 'SEM RESTRICAO', 'SEM RESTRIÇÃO',
    'NAO POSSUI ALIENACAO', 'NAO POSSUI RESTRIÇÃO', 'NAO POSSUI RESTRICAO',
    'NAO ALIENADO', 'NAO GRAVAME', 'ALIENACAO NAO',
    'FIDUCIARIA NAO', 'FIDUCIÁRIA NÃO', 'SEM ALIENACAO',
    'RESTRICAO NAO', 'RESTRIÇÃO NÃO',
  ];

  public static analyze(text: string): {
    hasFinancialRestriction: boolean;
    financialInstitution?: string;
    restrictionType?: string;
  } {
    const uText = text.toUpperCase()
      .normalize('NFD').replace(/\p{M}/gu, '') // strip accents for matching
      .toUpperCase();

    // Explicit negation wins immediately
    if (this.NEGATION_PATTERNS.some(p => uText.includes(p))) {
      return { hasFinancialRestriction: false };
    }

    // Look for restriction keyword
    const hasKeyword = this.KEYWORDS.some(k => uText.includes(k));
    if (!hasKeyword) return { hasFinancialRestriction: false };

    // Keywords alone are not enough — they appear as field labels on CRLV.
    // Require a financial institution name to confirm an actual restriction.
    const institution = this.FINANCIAL_INSTITUTIONS.find(inst => uText.includes(inst));
    if (!institution) {
      // No institution found → keyword was just a label, not a value
      return { hasFinancialRestriction: false };
    }

    let type = 'Alienação Fiduciária';
    if (uText.includes('LEASING') || uText.includes('ARRENDAMENTO')) type = 'Arrendamento / Leasing';
    if (uText.includes('RESERVA DOMINIO')) type = 'Reserva de Domínio';

    console.log(`[RESTRICTION_DETECTED] Type: ${type}, Institution: ${institution}`);

    return {
      hasFinancialRestriction: true,
      financialInstitution: institution,
      restrictionType: type
    };
  }
}
