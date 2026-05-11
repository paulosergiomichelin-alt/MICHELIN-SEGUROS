/**
 * OCRStrategyResolver.ts
 * Enterprise strategy pattern for selecting the optimal OCR pipeline.
 * Forces deterministic behavior per document type.
 */
export enum OCRStrategy {
  REGIONAL_VISUAL = 'REGIONAL_VISUAL', // CNH: 100% Visual crops
  HYBRID_ASSISTED = 'HYBRID_ASSISTED', // CRLV: PDF Text + Visual crops where needed
  TEXT_FIRST = 'TEXT_FIRST'            // POLICY: PDF Text + Contextual extraction
}

export class OCRStrategyResolver {
  /**
   * Resolves the required strategy based on type hint or initial classification.
   */
  public static resolve(typeHint?: string): OCRStrategy {
    const hint = typeHint?.toLowerCase();
    
    if (hint === 'cnh') return OCRStrategy.REGIONAL_VISUAL;
    if (hint === 'crlv') return OCRStrategy.HYBRID_ASSISTED;
    if (hint === 'policy') return OCRStrategy.TEXT_FIRST;
    if (hint === 'proposal') return OCRStrategy.TEXT_FIRST;

    // Default strategy for unknown documents
    return OCRStrategy.TEXT_FIRST; 
  }
}
