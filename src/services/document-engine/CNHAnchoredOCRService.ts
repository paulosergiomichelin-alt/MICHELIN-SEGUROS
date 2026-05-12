/**
 * CNHAnchoredOCRService.ts
 *
 * Enterprise OCR pipeline for Brazilian CNH (Carteira Nacional de Habilitação).
 *
 * Pipeline:
 *   1) Normalize input to a fixed canvas (1600x1000) with letterbox.
 *   2) Global OCR over the normalized canvas (desaturated, contrast-boosted).
 *   3) Detect label anchors (NOME, CPF, NASCIMENTO, VALIDADE, REGISTRO, CATEGORIA, FILIACAO).
 *   4) Compute dynamic value regions relative to each anchor.
 *   5) Regional OCR with per-field preprocessing and char whitelist.
 *   6) Validate + score each field; fall back to global text regex when anchor missing.
 *
 * Designed to handle CNH-e digital (PDF rendered with security background) and
 * scanned/photographed CNH. No paid APIs.
 */

import { LocalOCRService } from '../LocalOCRService';
import { OCRPreprocessService } from '../OCRPreprocessService';
import { StructuredOCRResult, OCRWord } from '../../types/OCRTypes';

const NORM_WIDTH = 1600;
const NORM_HEIGHT = 1000;

export interface ExtractedField {
  value: string;
  confidence: number; // 0-100
  raw: string;
  source: 'anchor' | 'global_regex' | 'empty';
  retries: number;
}

export interface CNHExtractedFields {
  nome: ExtractedField;
  cpf: ExtractedField;
  nascimento: ExtractedField;
  validade: ExtractedField;
  registro: ExtractedField;
  categoria: ExtractedField;
}

export interface CNHAnchoredResult {
  fields: CNHExtractedFields;
  globalText: string;
  structured: StructuredOCRResult;
  metrics: {
    totalTime: number;
    anchorsFound: number;
    globalTokens: number;
    globalConfidence: number;
    normalizedSize: string;
  };
}

interface AnchorPosition {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const LABEL_PATTERNS: Record<string, string[]> = {
  nome: ['NOME', 'NAME AND SURNAME', 'NAME'],
  cpf: ['CPF'],
  nascimento: ['DATA NASCIMENTO', 'DATA DE NASCIMENTO', 'NASCIMENTO', 'DATE OF BIRTH'],
  validade: ['VALIDADE', 'VALID UNTIL'],
  registro: ['Nº REGISTRO', 'N REGISTRO', 'REGISTRO', 'REGISTRY'],
  categoria: ['CAT HAB', 'CAT.HAB', 'CATEGORIA', 'CATEGORY']
};

const empty = (): ExtractedField => ({ value: '', confidence: 0, raw: '', source: 'empty', retries: 0 });

function normalize(text: string): string {
  return text.toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w\s]/g, '').trim();
}

export class CNHAnchoredOCRService {
  private static instance: CNHAnchoredOCRService;

  private constructor() {}

  public static getInstance(): CNHAnchoredOCRService {
    if (!this.instance) this.instance = new CNHAnchoredOCRService();
    return this.instance;
  }

  /** Main pipeline entry point. */
  public async extract(sourceCanvas: HTMLCanvasElement): Promise<CNHAnchoredResult> {
    const startTime = Date.now();
    console.log(`[CNH_ANCHORED] [PIPELINE_START] Source ${sourceCanvas.width}x${sourceCanvas.height}`);

    // STEP 1: Normalize
    const normalized = this.normalizeCanvas(sourceCanvas);
    console.log(`[CNH_ANCHORED] [NORMALIZED] ${normalized.width}x${normalized.height}`);

    // STEP 2: Global OCR with desaturation
    const t0 = Date.now();
    const globalCanvas = this.preprocessForGlobalOCR(normalized);
    const globalOCR = await LocalOCRService.getInstance().performStructuredOCR(globalCanvas);
    console.log(`[CNH_ANCHORED] [OCR_GLOBAL_DONE] Tokens: ${globalOCR.words.length} | Conf: ${globalOCR.confidence} | ${Date.now() - t0}ms`);

    // STEP 3: Detect anchors
    const anchors = this.detectAnchors(globalOCR.words);
    const anchorCount = Object.keys(anchors).length;
    console.log(`[CNH_ANCHORED] [ANCHORS_FOUND] ${anchorCount} of ${Object.keys(LABEL_PATTERNS).length}`, Object.keys(anchors));

    // STEP 4-5: Regional OCR per field
    const fields: CNHExtractedFields = {
      nome: empty(),
      cpf: empty(),
      nascimento: empty(),
      validade: empty(),
      registro: empty(),
      categoria: empty()
    };

    for (const fieldKey of Object.keys(fields) as Array<keyof CNHExtractedFields>) {
      const anchor = anchors[fieldKey];
      if (anchor) {
        const region = this.calculateValueRegion(fieldKey, anchor);
        console.log(`[CNH_ANCHORED] [REGION_CALCULATED] ${fieldKey}: x=${region.x.toFixed(0)} y=${region.y.toFixed(0)} w=${region.width.toFixed(0)} h=${region.height.toFixed(0)}`);
        fields[fieldKey] = await this.extractFromRegion(normalized, region, fieldKey);
      } else {
        // Fallback: regex on global OCR text
        fields[fieldKey] = this.fallbackFromGlobalText(fieldKey, globalOCR.text);
        if (fields[fieldKey].value) {
          console.log(`[CNH_ANCHORED] [GLOBAL_REGEX_HIT] ${fieldKey} -> "${fields[fieldKey].value}"`);
        }
      }
    }

    const result: CNHAnchoredResult = {
      fields,
      globalText: globalOCR.text,
      structured: globalOCR,
      metrics: {
        totalTime: Date.now() - startTime,
        anchorsFound: anchorCount,
        globalTokens: globalOCR.words.length,
        globalConfidence: globalOCR.confidence,
        normalizedSize: `${NORM_WIDTH}x${NORM_HEIGHT}`
      }
    };

    console.log('[CNH_ANCHORED] [OCR_FINAL_JSON]', JSON.stringify(this.summarize(result), null, 2));
    return result;
  }

  /** Letterbox-scale source into a fixed canvas. */
  private normalizeCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = NORM_WIDTH;
    canvas.height = NORM_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, NORM_WIDTH, NORM_HEIGHT);

    const srcRatio = source.width / source.height;
    const dstRatio = NORM_WIDTH / NORM_HEIGHT;

    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (srcRatio > dstRatio) {
      drawW = NORM_WIDTH;
      drawH = NORM_WIDTH / srcRatio;
      drawX = 0;
      drawY = (NORM_HEIGHT - drawH) / 2;
    } else {
      drawH = NORM_HEIGHT;
      drawW = NORM_HEIGHT * srcRatio;
      drawY = 0;
      drawX = (NORM_WIDTH - drawW) / 2;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, source.width, source.height, drawX, drawY, drawW, drawH);
    return canvas;
  }

  /** Strip colored security background, boost contrast, prepare for OCR. */
  private preprocessForGlobalOCR(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    // Adaptive threshold (local-window) removes the uneven security pattern far better
    // than a global threshold. Combined with desaturation, the text isolates cleanly.
    OCRPreprocessService.process(ctx, out.width, out.height, {
      pass: 1,
      desaturate: true,
      adaptiveThreshold: true,
      grayscale: true,
      sharpen: false
    });
    return out;
  }

  /** Levenshtein-like fuzzy substring match: target found if any window has <= maxDist edits. */
  private fuzzyMatch(haystack: string, target: string, maxDist = 1): boolean {
    if (haystack.includes(target)) return true;
    if (target.length < 4) return false;
    const win = target.length;
    for (let i = 0; i <= haystack.length - win + maxDist; i++) {
      const slice = haystack.substring(i, i + win);
      if (this.editDistance(slice, target) <= maxDist) return true;
      // Also try with one extra char in the window (insertion in haystack)
      if (i + win + 1 <= haystack.length) {
        const sliceExtra = haystack.substring(i, i + win + 1);
        if (this.editDistance(sliceExtra, target) <= maxDist) return true;
      }
    }
    return false;
  }

  private editDistance(a: string, b: string): number {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 999;
    const prev = new Array(n + 1).fill(0);
    const curr = new Array(n + 1).fill(0);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
      for (let j = 0; j <= n; j++) prev[j] = curr[j];
    }
    return prev[n];
  }

  /** Locate every CNH label inside the global OCR word list. */
  private detectAnchors(words: OCRWord[]): Record<string, AnchorPosition> {
    const anchors: Record<string, AnchorPosition> = {};

    for (const [fieldKey, patterns] of Object.entries(LABEL_PATTERNS)) {
      for (const pattern of patterns) {
        const found = this.findLabelInWords(pattern, words);
        if (found) {
          anchors[fieldKey] = found;
          console.log(`[ANCHOR_DETECTED] ${fieldKey} = "${pattern}" at (${found.x.toFixed(0)}, ${found.y.toFixed(0)})`);
          break;
        }
      }
    }
    return anchors;
  }

  private findLabelInWords(pattern: string, words: OCRWord[]): AnchorPosition | null {
    const patternTokens = pattern.split(/\s+/).map(normalize).filter(Boolean);
    if (patternTokens.length === 0) return null;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wNorm = normalize(w.text);
      // Exact, substring, or fuzzy (1 edit) match against the first pattern token
      const firstMatches = wNorm.includes(patternTokens[0]) || this.fuzzyMatch(wNorm, patternTokens[0], 1);
      if (!firstMatches) continue;

      if (patternTokens.length === 1) {
        return { label: pattern, x: w.x, y: w.y, width: w.width, height: w.height };
      }

      // Multi-token match: subsequent tokens must be on the same line, close in X
      let ok = true;
      let lastWord = w;
      for (let j = 1; j < patternTokens.length; j++) {
        if (i + j >= words.length) { ok = false; break; }
        const cand = words[i + j];
        const sameLine = Math.abs(cand.y - w.y) < Math.max(w.height, cand.height) * 0.8;
        if (!sameLine) { ok = false; break; }
        const candNorm = normalize(cand.text);
        if (!candNorm.includes(patternTokens[j]) && !this.fuzzyMatch(candNorm, patternTokens[j], 1)) { ok = false; break; }
        lastWord = cand;
      }
      if (ok) {
        return {
          label: pattern,
          x: w.x,
          y: w.y,
          width: (lastWord.x + lastWord.width) - w.x,
          height: Math.max(w.height, lastWord.height)
        };
      }
    }
    return null;
  }

  /** Compute the value region for a field given the position of its label anchor. */
  private calculateValueRegion(fieldKey: string, anchor: AnchorPosition): { x: number; y: number; width: number; height: number } {
    const baseY = anchor.y + anchor.height + 4;
    const widthMap: Record<string, number> = {
      nome: 900,
      cpf: 380,
      nascimento: 320,
      validade: 320,
      registro: 320,
      categoria: 200
    };
    const heightMap: Record<string, number> = {
      nome: 90,
      cpf: 70,
      nascimento: 70,
      validade: 70,
      registro: 70,
      categoria: 70
    };

    let x = Math.max(0, anchor.x - 12);
    const y = baseY;
    let width = widthMap[fieldKey] || 300;
    const height = heightMap[fieldKey] || 70;

    if (x + width > NORM_WIDTH) width = NORM_WIDTH - x;
    return { x, y, width, height };
  }

  /** Crop, preprocess (per-field profile) and OCR a region. Retries up to 3 passes. */
  private async extractFromRegion(normalized: HTMLCanvasElement, region: { x: number; y: number; width: number; height: number }, fieldKey: string): Promise<ExtractedField> {
    const MAX_PASSES = 3;
    let best: ExtractedField = empty();
    best.source = 'anchor';

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      const cropped = this.cropForRegion(normalized, region, pass, fieldKey);
      if (!cropped) continue;

      const ocr = await LocalOCRService.getInstance().performStructuredOCR(cropped, {
        char_whitelist: this.getWhitelist(fieldKey)
      });
      const rawText = ocr.text.trim();
      console.log(`[OCR_REGION_${fieldKey.toUpperCase()}] Pass ${pass} | Conf: ${ocr.confidence} | "${rawText.replace(/\n/g, ' ')}"`);

      const validated = this.validateField(fieldKey, rawText, ocr.confidence);
      if (validated.confidence > best.confidence) {
        best = { value: validated.value, confidence: validated.confidence, raw: rawText, source: 'anchor', retries: pass - 1 };
      }
      if (best.confidence >= 85) break; // Good enough — stop retrying
    }

    if (best.confidence < 40) {
      console.warn(`[CONFIDENCE_LOW] ${fieldKey} final conf ${best.confidence} after ${best.retries + 1} passes`);
    } else {
      console.log(`[OCR_REGION_SUCCESS] ${fieldKey} -> "${best.value}" (conf ${best.confidence})`);
    }
    return best;
  }

  private cropForRegion(normalized: HTMLCanvasElement, region: { x: number; y: number; width: number; height: number }, pass: number, fieldKey: string): HTMLCanvasElement | null {
    if (region.width < 20 || region.height < 15) return null;
    const upscale = pass === 1 ? 3.0 : (pass === 2 ? 3.5 : 4.0);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(region.width * upscale);
    canvas.height = Math.round(region.height * upscale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(normalized, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);

    // Per-field preprocessing profile
    const opts = this.preprocessProfileFor(fieldKey, pass);
    OCRPreprocessService.process(ctx, canvas.width, canvas.height, opts);
    return canvas;
  }

  private preprocessProfileFor(fieldKey: string, pass: number): { pass: number; sharpen?: boolean; contrast?: number; grayscale?: boolean; desaturate?: boolean; adaptiveThreshold?: boolean } {
    // Pass 1: adaptive threshold (best for uneven backgrounds).
    // Pass 2: standard threshold with high contrast (fallback if adaptive lost too much).
    // Pass 3: extreme contrast as last resort.
    const useAdaptive = pass === 1;
    switch (fieldKey) {
      case 'cpf':
      case 'registro':
        return { pass, sharpen: true, contrast: pass === 3 ? 2.2 : 1.9, grayscale: true, desaturate: true, adaptiveThreshold: useAdaptive };
      case 'nascimento':
      case 'validade':
        return { pass, sharpen: pass >= 2, contrast: pass === 3 ? 2.0 : 1.7, grayscale: true, desaturate: true, adaptiveThreshold: useAdaptive };
      case 'categoria':
        return { pass, sharpen: true, contrast: 1.8, grayscale: true, desaturate: true, adaptiveThreshold: useAdaptive };
      case 'nome':
      default:
        return { pass, sharpen: pass >= 2, contrast: pass === 3 ? 1.8 : 1.4, grayscale: true, desaturate: true, adaptiveThreshold: useAdaptive };
    }
  }

  private getWhitelist(fieldKey: string): string {
    switch (fieldKey) {
      case 'cpf':
        return '0123456789.-';
      case 'registro':
        return '0123456789';
      case 'nascimento':
      case 'validade':
        return '0123456789/';
      case 'categoria':
        return 'ABCDE';
      case 'nome':
      default:
        return '';
    }
  }

  /** Validate raw OCR text against the field's expected format and compute confidence. */
  private validateField(fieldKey: string, raw: string, ocrConf: number): { value: string; confidence: number } {
    const clean = raw.replace(/[\r\n]+/g, ' ').trim();
    if (!clean) return { value: '', confidence: 0 };

    switch (fieldKey) {
      case 'cpf': {
        const digits = clean.replace(/\D/g, '');
        if (digits.length !== 11) return { value: '', confidence: 0 };
        const checksumOk = this.validateCPFChecksum(digits);
        const formatted = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        const conf = checksumOk ? Math.max(90, ocrConf) : Math.min(60, ocrConf);
        return { value: formatted, confidence: conf };
      }
      case 'registro': {
        const digits = clean.replace(/\D/g, '');
        if (digits.length < 9 || digits.length > 11) return { value: '', confidence: 0 };
        return { value: digits, confidence: Math.max(70, ocrConf) };
      }
      case 'nascimento':
      case 'validade': {
        const m = clean.match(/(\d{2})[\/\-\s](\d{2})[\/\-\s](\d{4})/);
        if (!m) {
          // Try DDMMYYYY without separator
          const m2 = clean.match(/(\d{2})(\d{2})(\d{4})/);
          if (!m2) return { value: '', confidence: 0 };
          const formatted = `${m2[1]}/${m2[2]}/${m2[3]}`;
          if (!this.isValidDate(formatted)) return { value: '', confidence: 0 };
          if (fieldKey === 'validade' && !this.isFutureOrRecent(formatted)) return { value: formatted, confidence: Math.min(50, ocrConf) };
          return { value: formatted, confidence: Math.max(75, ocrConf) };
        }
        const formatted = `${m[1]}/${m[2]}/${m[3]}`;
        if (!this.isValidDate(formatted)) return { value: '', confidence: 0 };
        if (fieldKey === 'validade' && !this.isFutureOrRecent(formatted)) return { value: formatted, confidence: Math.min(60, ocrConf) };
        return { value: formatted, confidence: Math.max(80, ocrConf) };
      }
      case 'categoria': {
        const m = clean.toUpperCase().replace(/[^ABCDE]/g, '').match(/^(AB|AC|AD|AE|A|B|C|D|E){1,2}/);
        if (!m) return { value: '', confidence: 0 };
        return { value: m[0].substring(0, 2), confidence: Math.max(70, ocrConf) };
      }
      case 'nome': {
        // Strip noise; require >= 2 words, only letters/spaces/accents
        const letters = clean.toUpperCase().replace(/[^A-ZÀ-Ú\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const words = letters.split(' ').filter(w => w.length >= 2);
        if (words.length < 2) return { value: '', confidence: 0 };
        const joined = words.join(' ');
        const conf = Math.min(90, Math.max(50, ocrConf));
        return { value: joined, confidence: conf };
      }
      default:
        return { value: clean, confidence: ocrConf };
    }
  }

  private validateCPFChecksum(digits: string): boolean {
    if (digits.length !== 11) return false;
    if (/^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev >= 10) rev = 0;
    if (rev !== parseInt(digits.charAt(9))) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev >= 10) rev = 0;
    return rev === parseInt(digits.charAt(10));
  }

  private isValidDate(s: string): boolean {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return false;
    const d = parseInt(m[1]), mo = parseInt(m[2]), y = parseInt(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    if (y < 1900 || y > 2100) return false;
    const date = new Date(y, mo - 1, d);
    return date.getDate() === d && date.getMonth() === mo - 1 && date.getFullYear() === y;
  }

  private isFutureOrRecent(s: string): boolean {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return false;
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    const now = new Date();
    // Reasonable validade: not more than 10 years in the past, not more than 20 years in the future
    const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    const twentyYearsAhead = new Date(now.getFullYear() + 20, now.getMonth(), now.getDate());
    return d >= tenYearsAgo && d <= twentyYearsAhead;
  }

  /** When the label anchor is missing, regex-scan the global OCR text for the field pattern. */
  private fallbackFromGlobalText(fieldKey: string, text: string): ExtractedField {
    if (!text) return empty();
    const upper = text.toUpperCase();

    switch (fieldKey) {
      case 'cpf': {
        const m = text.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
        if (!m) return empty();
        const v = this.validateField('cpf', m[0], 60);
        return { value: v.value, confidence: v.confidence, raw: m[0], source: 'global_regex', retries: 0 };
      }
      case 'nascimento': {
        const m = upper.match(/(?:NASCIMENTO|NASC\.?)\D*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
        if (!m) return empty();
        const v = this.validateField('nascimento', m[1], 60);
        return { value: v.value, confidence: v.confidence, raw: m[1], source: 'global_regex', retries: 0 };
      }
      case 'validade': {
        const m = upper.match(/VALIDADE\D*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
        if (!m) return empty();
        const v = this.validateField('validade', m[1], 60);
        return { value: v.value, confidence: v.confidence, raw: m[1], source: 'global_regex', retries: 0 };
      }
      case 'registro': {
        const m = upper.match(/REGISTRO\D*(\d{9,11})/);
        if (!m) return empty();
        const v = this.validateField('registro', m[1], 60);
        return { value: v.value, confidence: v.confidence, raw: m[1], source: 'global_regex', retries: 0 };
      }
      case 'categoria': {
        const m = upper.match(/(?:CAT\.?\s*HAB|CATEGORIA)\D*([ABCDE]{1,2})/);
        if (!m) return empty();
        return { value: m[1], confidence: 60, raw: m[1], source: 'global_regex', retries: 0 };
      }
      case 'nome': {
        const m = upper.match(/NOME\s*[:\n]?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,60})/);
        if (!m) return empty();
        const v = this.validateField('nome', m[1], 55);
        return { value: v.value, confidence: v.confidence, raw: m[1], source: 'global_regex', retries: 0 };
      }
      default:
        return empty();
    }
  }

  private summarize(r: CNHAnchoredResult) {
    const out: any = { metrics: r.metrics, fields: {} };
    for (const [k, v] of Object.entries(r.fields)) {
      out.fields[k] = { value: v.value, confidence: v.confidence, source: v.source };
    }
    return out;
  }
}
