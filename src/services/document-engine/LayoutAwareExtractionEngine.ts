
import { StructuredOCRResult, OCRWord, OCRLine } from '../../types/OCRTypes';
import { FieldSanitizer } from './FieldSanitizer';

export interface ExtractionOptions {
  direction?: 'RIGHT' | 'BELOW' | 'LEFT' | 'ABOVE';
  maxDistance?: number;
  verticalTolerance?: number; // Y-axis tolerance
  stopTokens?: string[];
  pattern?: RegExp;
  maxWords?: number;
  mandatory?: boolean;
  maxChars?: number;
  anchorRegion?: { x: number, y: number, width: number, height: number };
}

/**
 * LayoutAwareExtractionEngine
 * Deterministic spatial-aware document parsing engine.
 */
export class LayoutAwareExtractionEngine {
  private static instance: LayoutAwareExtractionEngine;
  private currentResult: StructuredOCRResult | null = null;
  private lines: OCRLine[] = [];

  private constructor() {}

  public static getInstance(): LayoutAwareExtractionEngine {
    if (!this.instance) this.instance = new LayoutAwareExtractionEngine();
    return this.instance;
  }

  public setResult(result: StructuredOCRResult) {
    this.currentResult = result;
    // Forçar re-segmentação se não houver linhas ou se as palavras forem novas
    this.lines = this.segmentLines(result.words);
    console.log(`[LAYOUT_ENGINE] [INIT] Tokens: ${result.words.length} | Lines Segmented: ${this.lines.length}`);
  }

  /**
   * ADVANCED LINE SEGMENTATION ENGINE
   * Groups words into logical lines using baseline overlap and vertical proximity.
   */
  private segmentLines(words: OCRWord[]): OCRLine[] {
    if (!words || words.length === 0) return [];

    // 1. Sort by Y initially to process top-down
    const sortedByY = [...words].sort((a, b) => a.y - b.y);
    const lineBuckets: OCRWord[][] = [];

    for (const word of sortedByY) {
      if (!word.text || word.text.trim().length === 0) continue;

      let added = false;
      // Search for an existing bucket where this word fits vertically
      for (const bucket of lineBuckets) {
        const anchor = bucket[0];

        // INTERSECTION RULE: If the word's Y-center is within the anchor's vertical bounds
        const anchorCenter = anchor.y + anchor.height / 2;
        const wordCenter = word.y + word.height / 2;

        // Tolerance based on font height
        const tolerance = Math.max(anchor.height, word.height) * 0.4;
        const isOverlap = Math.abs(anchorCenter - wordCenter) < tolerance;

        if (isOverlap) {
          bucket.push(word);
          added = true;
          break;
        }
      }

      if (!added) {
        lineBuckets.push([word]);
      }
    }

    // 2. Create OCRLine objects and sort words within each line by X
    const lines: OCRLine[] = lineBuckets.map((tokens, idx) => {
      const sorted = tokens.sort((a, b) => a.x - b.x);
      const minX = Math.min(...sorted.map(t => t.x));
      const minY = Math.min(...sorted.map(t => t.y));
      const maxX = Math.max(...sorted.map(t => t.x + t.width));
      const maxY = Math.max(...sorted.map(t => t.y + t.height));

      return {
        id: `l_${idx}`,
        text: sorted.map(t => t.text).join(' '),
        words: sorted,
        bounds: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        }
      };
    });

    // 3. Final sort of lines by Y
    return lines.sort((a, b) => a.bounds.y - b.bounds.y);
  }

  private createLine(id: string, tokens: OCRWord[]): OCRLine {
    const sorted = tokens.sort((a, b) => a.x - b.x);
    const minX = Math.min(...sorted.map(t => t.x));
    const minY = Math.min(...sorted.map(t => t.y));
    const maxX = Math.max(...sorted.map(t => t.x + t.width));
    const maxY = Math.max(...sorted.map(t => t.y + t.height));

    return {
      id,
      text: sorted.map(t => t.text).join(' '),
      words: sorted,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }
    };
  }

  // Removes diacritical marks (accents) for locale-safe label matching.
  private static normalizeForComparison(str: string): string {
    // \p{M} matches all Unicode combining marks (NFD-decomposed accents)
    return str.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  }

  /**
   * Spatial Extraction logic (Geometric Parsing)
   */
  public extractField(label: string | string[], options: ExtractionOptions = {}): { value: string; confidence: number; reason?: string } {
    if (!this.currentResult) return { value: '', confidence: 0, reason: 'NO_OCR_RESULT' };

    const labels = Array.isArray(label) ? label : [label];
    const sanitizer = FieldSanitizer.getInstance();

    // 1. Locate Label
    let labelTokens: OCRWord[] = [];
    let parentLine: OCRLine | null = null;

    for (const l of labels) {
      const found = this.findLabelTokens(l, options.anchorRegion);
      if (found.tokens.length > 0) {
        labelTokens = found.tokens;
        parentLine = found.line;
        break;
      }
    }

    const {
      direction = 'RIGHT',
      maxDistance = 450,
      stopTokens = [],
      pattern,
      maxWords = 8,
      anchorRegion
    } = options;

    // 2. Search for candidates
    let candidates: OCRWord[] = [];
    let labelRight = 0;

    if (direction === 'BELOW') {
      // BELOW: search for words in lines directly below the label within same X column
      if (labelTokens.length > 0 && parentLine) {
        const labelXMin = Math.min(...labelTokens.map(lt => lt.x)) - 30;
        const labelXMax = Math.max(...labelTokens.map(lt => lt.x + lt.width)) + 30;
        labelRight = labelXMin;

        const belowLines = this.lines
          .filter(l => l.bounds.y > parentLine!.bounds.y + parentLine!.bounds.height - 10)
          .sort((a, b) => a.bounds.y - b.bounds.y);

        for (const belowLine of belowLines) {
          const matchingWords = belowLine.words
            .filter(w => w.x >= labelXMin && w.x <= labelXMax)
            .sort((a, b) => a.x - b.x);
          if (matchingWords.length > 0) {
            candidates = matchingWords;
            break;
          }
        }
      }
    } else if (labelTokens.length > 0 && parentLine) {
       // Geometric Priority: RIGHT of the label
       labelRight = Math.max(...labelTokens.map(lt => lt.x + lt.width));
       candidates = parentLine.words.filter(w => {
         const isRight = w.x >= labelRight - 5;
         const isNotLabel = !labelTokens.some(lt => lt === w);
         const dist = w.x - labelRight;
         return isRight && isNotLabel && dist < maxDistance;
       }).sort((a, b) => a.x - b.x);
    } else if (anchorRegion) {
       // Region-Based Fallback: If label not found but anchor region provided, use the region itself as reference
       console.log(`[LAYOUT_ENGINE] [ANCHOR_MODE] Label "${labels[0]}" not detected. Using anchor region directly.`);
       labelRight = anchorRegion.x;
       candidates = this.currentResult.words.filter(w => {
         // Allow for generous drift in all directions for region-based hits
         const inX = w.x >= anchorRegion.x - 45 && w.x <= anchorRegion.x + anchorRegion.width + 45;
         const inY = w.y >= anchorRegion.y - 25 && w.y <= anchorRegion.y + anchorRegion.height + 25;
         return inX && inY;
       }).sort((a, b) => a.x - b.x || a.y - b.y);
    } else {
       return { value: '', confidence: 0, reason: 'LABEL_NOT_FOUND' };
    }

    // 3. Build value with RIGID STOP RULES
    const valueParts: string[] = [];
    let confidenceSum = 0;
    let lastX = labelRight;

    for (const cand of candidates) {
      const uText = cand.text.toUpperCase().trim();

      // 3.1. COLUMN_BREAKER_RULE (skip for BELOW — X range already constrains the column)
      if (direction !== 'BELOW') {
        const gap = cand.x - lastX;
        if (gap > 130 && valueParts.length > 0) {
          console.log(`[LAYOUT_MATCH] [COLUMN_DETECTED] Large gap of ${gap}px detected. Stopping extraction for ${labels[0]}.`);
          break;
        }
      }

      // 3.2. ADDRESS_PATTERN_DETECTION
      if (sanitizer.isAddressIndicator(cand.text)) {
        console.log(`[LAYOUT_MATCH] [ADDRESS_PATTERN_DETECTED] Stop triggered by address indicator: "${cand.text}"`);
        break;
      }

      // 3.3. SEMANTIC_STOP_TOKENS
      if (stopTokens.some(st => uText.includes(st.toUpperCase()))) {
        console.log(`[LAYOUT_MATCH] [BOUNDARY_STOP] Semantic stop token "${uText}" reached for label "${labels[0]}"`);
        break;
      }

      // 3.4. FIELD_REJECTION
      if (sanitizer.isRejectedValue(cand.text)) {
        console.log(`[LAYOUT_MATCH] [FIELD_REJECTED] Rejected semantic noise: "${cand.text}"`);
        break;
      }

      // 3.5. ENTITY_TRANSITION
      if (uText.includes(':') && valueParts.length > 0) {
        console.log(`[LAYOUT_MATCH] [ENTITY_TRANSITION_DETECTED] New label pattern found: "${uText}". Stopping.`);
        break;
      }

      valueParts.push(cand.text);
      confidenceSum += cand.confidence;
      lastX = cand.x + cand.width;

      if (valueParts.length >= maxWords) {
        console.log(`[LAYOUT_MATCH] [TOKEN_LIMIT_REACHED] Max words limit (${maxWords}) reached for ${labels[0]}.`);
        break;
      }
    }

    let extractedValue = valueParts.join(' ').trim();

    // Pattern enforcement (Regex as Filter, not as Extractor)
    if (pattern) {
      const match = extractedValue.match(pattern);
      if (match) {
        extractedValue = match[0];
      } else {
        // If pattern is provided, we MUST match it to consider it successful
        extractedValue = '';
      }
    }

    if (options.maxChars && extractedValue.length > options.maxChars) {
      extractedValue = extractedValue.substring(0, options.maxChars);
    }

    const avgConfidence = valueParts.length > 0 ? (confidenceSum / valueParts.length) / 100 : 0;

    if (extractedValue) {
       console.log(`[LAYOUT_MATCH] [SPATIAL_ALIGNMENT] Found "${labels[0]}" -> "${extractedValue}" | Conf: ${(avgConfidence * 100).toFixed(1)}%`);
    }

    return {
      value: extractedValue,
      confidence: avgConfidence,
      reason: extractedValue ? 'SUCCESS' : 'EMPTY_OR_REJECTED'
    };
  }

  private findLabelTokens(target: string, anchorRegion?: { x: number, y: number, width: number, height: number }): { tokens: OCRWord[], line: OCRLine | null } {
    const uTarget = LayoutAwareExtractionEngine.normalizeForComparison(target);
    for (const line of this.lines) {
      if (anchorRegion) {
        // Line must intersect with anchor region
        const intersects = line.bounds.y >= anchorRegion.y - 40 && line.bounds.y <= anchorRegion.y + anchorRegion.height + 40;
        if (!intersects) continue;
      }

      const normalizedLineText = LayoutAwareExtractionEngine.normalizeForComparison(line.text);
      if (normalizedLineText.includes(uTarget)) {
        const words = line.words;
        const targetParts = uTarget.split(' ');

        for (let i = 0; i < words.length; i++) {
          const normalizedWord = LayoutAwareExtractionEngine.normalizeForComparison(words[i].text);
          if (normalizedWord.includes(targetParts[0])) {
            return { tokens: words.slice(i, i + targetParts.length), line };
          }
        }
      }
    }
    return { tokens: [], line: null };
  }
}
