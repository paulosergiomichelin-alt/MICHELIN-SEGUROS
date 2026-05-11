/**
 * DocumentQualityAnalyzer.ts
 * Analyzes OCR output density and structure to flag low-quality scans.
 */
export class DocumentQualityAnalyzer {
  public static analyze(text: string): { 
    isLowQuality: boolean; 
    reason?: string; 
    density: number;
  } {
    if (!text || text.length < 50) {
      return { isLowQuality: true, reason: 'Texto muito curto ou vazio', density: 0 };
    }

    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const avgLineLen = text.length / lines.length;
    const density = text.length / 2000; // Normalized density

    // Rule: Very few lines with high average length might be a concatenated mess
    if (lines.length < 3 && text.length > 200) {
       return { isLowQuality: true, reason: 'Formatação pobre/Concatenado', density };
    }

    // Rule: High density of garbage characters (simulated)
    const garbage = (text.match(/[^a-zA-Z0-9\s/.,:-]/g) || []).length;
    if (garbage / text.length > 0.1) {
       return { isLowQuality: true, reason: 'Muitos caracteres inválidos', density };
    }

    return { isLowQuality: false, density };
  }
}
