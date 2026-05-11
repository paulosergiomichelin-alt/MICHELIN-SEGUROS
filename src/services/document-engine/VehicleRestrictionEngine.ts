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

  public static analyze(text: string): { 
    hasFinancialRestriction: boolean; 
    financialInstitution?: string;
    restrictionType?: string;
  } {
    const uText = text.toUpperCase();
    
    // Check for "ALIENACAO FIDUCIARIA" or "GRAVAME"
    let hasRestriction = this.KEYWORDS.some(k => uText.includes(k));
    
    // Explicit "SEM GRAVAME" or "NAO POSSUI" near the keywords might negate this
    if (uText.includes('SEM GRAVAME') || uText.includes('NAO POSSUI ALIENACAO') || uText.includes('SEM RESTRICAO')) {
      hasRestriction = false;
    }

    if (!hasRestriction) {
      return { hasFinancialRestriction: false };
    }

    // Try to find the institution
    const institution = this.FINANCIAL_INSTITUTIONS.find(inst => uText.includes(inst));
    
    // Determine type
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
