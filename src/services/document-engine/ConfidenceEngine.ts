/**
 * ConfidenceEngine.ts
 * Calculates a "Real" confidence score based on multi-factor validation.
 */
export class ConfidenceEngine {
  public static calculate(params: {
    type: string;
    textLength: number;
    hasBlacklist: boolean;
    extractedFields: any;
    structuralMarkers: number;
    ocrConfidence?: number;
  }): number {
    let score = 0;
    const data = params.extractedFields || {};

    // 1. Structural Confidence (Base)
    if (params.type !== 'unknown') score += 40;
    score += Math.min(params.structuralMarkers * 5, 20);

    // 2. Field Coverage (Weighted)
    const fieldCount = Object.keys(data).filter(k => !k.startsWith('_') && !!data[k]).length;
    if (fieldCount === 0) return 0.05; // Extremely low confidence if nothing extracted
    
    score += Math.min(fieldCount * 4, 30);

    // 3. MANDATORY FIELD PENALTIES (Hard Enforcement)
    // If a field marked as mandatory is missing, heavy penalty
    if (data._missingMandatory && Array.isArray(data._missingMandatory)) {
       const penalty = data._missingMandatory.length * 25;
       console.warn(`[CONFIDENCE_PENALTY] Missing ${data._missingMandatory.length} mandatory fields. Penalty: -${penalty}%`);
       score -= penalty;
    }

    // 4. Partial Flag Penalty
    if (data._partial) score -= 15;

    // 5. OCR Integrity (If provided by Tesseract)
    if (params.ocrConfidence && params.ocrConfidence > 80) score += 10;
    if (params.ocrConfidence && params.ocrConfidence < 40) score -= 20;

    // 6. Security Penalties
    if (params.hasBlacklist) score -= 25;

    // Final Normalize (0-1)
    const final = Math.max(0.01, Math.min(score / 100, 0.98));
    console.log(`[CONFIDENCE_SCORE] [${params.type.toUpperCase()}] Real Score: ${final.toFixed(2)} | Coverage: ${fieldCount} fields`);
    
    return final;
  }
}
