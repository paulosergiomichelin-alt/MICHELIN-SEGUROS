import { PDFResourceManager } from './PDFResourceManager';
import { CacheManager } from "./CacheManager";
import { DocumentEngine } from "./document-engine/DocumentEngine";
import { DocumentFingerprintService } from './document-engine/DocumentFingerprintService';
import { HybridOCRService } from './HybridOCRService';
import { OCRStrategyResolver, OCRStrategy } from './OCRStrategyResolver';
import { DocumentMemoryManager } from './DocumentMemoryManager';
import { OCRRegionSchemaValidator } from './OCRRegionSchemaValidator';
import { StructuredOCRResult } from '../types/OCRTypes';
import { AIHybridOCRService, AIDocumentType } from './AIHybridOCRService';
import { AIOCRConfigService } from './AIOCRConfigService';
import { PDFRenderService } from './PDFRenderService';

// Bump this when the result-shape or merge logic changes so previously-cached
// results (which may be missing fields the new pipeline would have added) are
// invalidated automatically on the next import.
const ENTERPRISE_CACHE_PREFIX = 'enterprise_ocr_cache_v2';

export enum ProcessingState {
  IDLE = 'IDLE',
  RENDERING = 'RENDERING',
  OCR = 'OCR',
  VALIDATING = 'VALIDATING',
  PARSING = 'PARSING',
  PERSISTING = 'PERSISTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface OCRMetrics {
  totalTime: number;
  renderTime?: number;
  ocrTime?: number;
  parsingTime?: number;
  scale?: number;
  confidence?: number;
}

/**
 * OCRService.ts
 * ENTERPRISE-GRADE OCR PIPELINE
 * Deterministic, auditável e resiliente.
 */
export class OCRService {
  private static instance: OCRService;
  private memory = DocumentMemoryManager.getInstance();

  private constructor() {}

  public static getInstance(): OCRService {
    if (!this.instance) this.instance = new OCRService();
    return this.instance;
  }

  public static async processDocument(file: File | string, options: { 
    mimeType?: string, 
    leadId?: string, 
    onStatus?: (status: string) => void, 
    hintType?: string 
  } = {}): Promise<any> {
    return this.getInstance().processDocument(file, options);
  }

  public async processDocument(file: File | string, options: { 
    mimeType?: string, 
    leadId?: string, 
    onStatus?: (status: string) => void, 
    hintType?: string 
  } = {}): Promise<any> {
    const isLocalFile = file instanceof File;
    const startTime = Date.now();
    let fingerprint = "";
    const metrics: OCRMetrics = { totalTime: 0 };

    if (isLocalFile) {
      fingerprint = await DocumentFingerprintService.generate(file as File);
      const cachedResult = CacheManager.get(`${ENTERPRISE_CACHE_PREFIX}:${fingerprint}`);
      if (cachedResult) {
        if (options.onStatus) options.onStatus(ProcessingState.COMPLETED);
        return cachedResult;
      }
    }

    const fileUrl = isLocalFile ? URL.createObjectURL(file as File) : (file as string);
    if (isLocalFile) this.memory.register(fileUrl);

    const mimeType = options.mimeType || (isLocalFile ? (file as File).type : undefined);
    const typeHint = options.hintType?.toLowerCase();
    const strategy = OCRStrategyResolver.resolve(typeHint);

    console.log(`[OCR_PIPELINE] START | Strategy: ${strategy} | Hint: ${typeHint}`);
    if (options.onStatus) options.onStatus(ProcessingState.RENDERING);

    try {
      let text = "";
      let regions: any = undefined;
      let structured: any = undefined;
      const isPDF = mimeType === 'application/pdf' || (isLocalFile && (file as File).name.toLowerCase().includes('.pdf'));

      // PRIMARY PIPELINE: AI (Qianfan OCR via OpenRouter) — unified for CNH/CRLV/Apolice
      if (typeHint && ['cnh', 'crv', 'crlv', 'policy', 'apolice'].includes(typeHint)) {
        const aiOutcome = await this.tryAIPipelineWithOutcome(file as File, fileUrl, isPDF, typeHint as AIDocumentType, metrics);

        if (aiOutcome.kind === 'success') {
          const aiResult = aiOutcome.result;
          // Even when AI succeeds, the deterministic text-layer parser often finds
          // fields the vision model missed (broker name/SUSEP/CNPJ live in dense
          // small print that Qianfan tends to skip). Run it and merge — AI wins
          // for any field it already populated; empty AI slots get filled from
          // the text layer.
          const enrichedFields = await this.enrichAIFieldsFromTextLayer(
            file, isPDF, isLocalFile, typeHint, aiResult.fields
          );
          metrics.totalTime = Date.now() - startTime;
          metrics.confidence = aiResult.confidence / 100;
          const finalResult = {
            text: aiResult.rawText,
            type: typeHint,
            structuredData: enrichedFields,
            confidence: aiResult.confidence / 100,
            regions: enrichedFields,
            metrics,
            fileUrl,
            provider: aiResult.provider,
            validation: aiResult.validation
          };
          if (isLocalFile && fingerprint && aiResult.confidence >= 60) {
            CacheManager.set(`${ENTERPRISE_CACHE_PREFIX}:${fingerprint}`, finalResult);
          }
          if (options.onStatus) options.onStatus(ProcessingState.COMPLETED);
          console.log(`[OCR_PIPELINE] AI_SUCCESS | Type: ${typeHint} | Conf: ${aiResult.confidence}% | Time: ${metrics.totalTime}ms`);
          return finalResult;
        }

        // AI failed. Decide whether to fall back to the legacy heavy pipeline.
        const allowLegacyFallback = await this.shouldAllowLegacyFallback(aiOutcome.reason);
        if (!allowLegacyFallback) {
          console.warn(`[LEGACY_PIPELINE_SKIPPED] AI_ONLY mode active. Reason for AI failure: ${aiOutcome.reason}`);
          if (options.onStatus) options.onStatus(ProcessingState.FAILED);
          return {
            success: false,
            reason: 'AI_PIPELINE_FAILED',
            error: aiOutcome.reason,
            type: typeHint,
            fileUrl,
            metrics: { ...metrics, totalTime: Date.now() - startTime }
          };
        }
        console.warn(`[OCR_FALLBACK_SIMPLE] AI failed (${aiOutcome.reason}); running local Tesseract pipeline as fallback.`);
      }

      // PIPELINE EXECUTION BY STRATEGY (fallback when AI unavailable)
      if (strategy === OCRStrategy.REGIONAL_VISUAL) {
        // CNH MANDATE: 100% REGIONAL VISUAL
        const result = await this.executeRegionalPipeline(file as File, fileUrl, isPDF, typeHint, metrics);
        text = result.text;
        regions = result.regions;
        structured = result.structured;
      } else if (strategy === OCRStrategy.HYBRID_ASSISTED) {
        // CRLV MANDATE: PDF TEXT + ASSISTED MAPPING
        const result = await this.executeHybridPipeline(file as File, fileUrl, isPDF, typeHint, metrics);
        text = result.text;
        regions = result.regions;
        structured = result.structured;
      } else {
        // POLICY MANDATE: PDF TEXT-FIRST
        const result = await this.executeTextPipeline(file as File, fileUrl, isPDF, typeHint, metrics);
        text = result.text;
        regions = result.regions;
        structured = result.structured;
      }

      // VALIDATION GATE
      if (options.onStatus) options.onStatus(ProcessingState.VALIDATING);
      if (typeHint === 'cnh') {
        const validation = OCRRegionSchemaValidator.validateCNHRegions(regions);
        if (!validation.valid) {
          console.warn('[OCR_PIPELINE] Non-blocking validation issue for CNH (Mandatory fields missing)', validation.missing);
          // throw new Error(`CNH_INCOMPLETE: ${validation.missing.join(', ')}`);
        }
      }

      // PARSING GATE
      if (options.onStatus) options.onStatus(ProcessingState.PARSING);
      const engineResult = await DocumentEngine.getInstance().process(text, typeHint, regions, structured);
      
      // DOCUMENT TYPE LOCK: If a hint was provided, we stick to it unless it was completely unknown
      const lockedType = typeHint && typeHint !== 'unknown' ? typeHint : (engineResult.type || 'unknown');
      
      metrics.totalTime = Date.now() - startTime;
      metrics.confidence = engineResult.confidence;

      const finalResult = {
        text: engineResult.rawText,
        type: lockedType,
        structuredData: engineResult.structuredData,
        confidence: engineResult.confidence,
        regions: engineResult.regions,
        metrics,
        fileUrl // Blob kept alive by memory manager
      };

      if (isLocalFile && fingerprint && engineResult.confidence > 0.6) {
        CacheManager.set(`${ENTERPRISE_CACHE_PREFIX}:${fingerprint}`, finalResult);
      }

      if (options.onStatus) options.onStatus(ProcessingState.COMPLETED);
      console.log(`[OCR_PIPELINE] SUCCESS | Type: ${finalResult.type} | Time: ${metrics.totalTime}ms`);
      
      return finalResult;
    } catch (error: any) {
      console.error('[OCR_PIPELINE] FAILED', error);
      if (options.onStatus) options.onStatus(ProcessingState.FAILED);
      return { success: false, reason: 'PIPELINE_FAILED', error: error.message };
    } finally {
      // Memory managed via reference count
      if (isLocalFile) this.memory.release(fileUrl);
    }
  }

  /**
   * Run the AI pipeline and report a structured outcome:
   *  - success: high-confidence AI result, use directly
   *  - low_confidence: AI ran but confidence < floor; legacy fallback allowed
   *  - no_key: API key missing; legacy fallback allowed
   *  - disabled: AI explicitly disabled in settings; legacy fallback allowed
   *  - transport_error: HTTP/network/timeout error; legacy fallback gated by config.fallbackEnabled
   *  - parse_error: model returned non-JSON; legacy fallback gated by config.fallbackEnabled
   */
  private async tryAIPipelineWithOutcome(
    file: File, url: string, isPDF: boolean, typeHint: AIDocumentType, _metrics: OCRMetrics
  ): Promise<
    | { kind: 'success'; result: any }
    | { kind: 'low_confidence'; reason: string }
    | { kind: 'no_key'; reason: string }
    | { kind: 'disabled'; reason: string }
    | { kind: 'transport_error'; reason: string }
    | { kind: 'parse_error'; reason: string }
  > {
    let canvas: HTMLCanvasElement | null;
    try {
      canvas = await this.renderToCanvas(file, url, isPDF, typeHint);
    } catch (err: any) {
      return { kind: 'transport_error', reason: `RENDER_FAILED: ${err.message}` };
    }
    if (!canvas) return { kind: 'transport_error', reason: 'RENDER_NULL' };

    let aiResult;
    try {
      aiResult = await AIHybridOCRService.getInstance().extractFromCanvas(canvas, typeHint);
    } catch (err: any) {
      return { kind: 'transport_error', reason: err.message || 'AI_THROW' };
    }

    if (aiResult.success && aiResult.confidence >= 40) {
      return { kind: 'success', result: aiResult };
    }

    const reason = aiResult.error || 'UNKNOWN';
    if (reason === 'NO_API_KEY') return { kind: 'no_key', reason };
    if (reason === 'AI_DISABLED') return { kind: 'disabled', reason };
    if (reason === 'JSON_PARSE_FAILED') return { kind: 'parse_error', reason };
    // HTTP 413 is a server-side body-limit misconfiguration, not an AI failure.
    // Surface it as a transport_error with a recognizable reason so callers and the panel
    // can tell the user to restart the dev server (the body-parser limit is set at startup).
    if (reason.includes('HTTP_413') || reason.includes('PayloadTooLarge')) {
      return { kind: 'transport_error', reason: 'SERVER_PAYLOAD_LIMIT_TOO_LOW (restart npm run dev to apply 25MB limit)' };
    }
    if (reason.includes('TIMEOUT') || reason.includes('HTTP_') || reason.includes('REQUEST_FAILED') || reason.includes('NETWORK')) {
      return { kind: 'transport_error', reason };
    }
    if (aiResult.success) return { kind: 'low_confidence', reason: `CONFIDENCE_${aiResult.confidence}` };
    return { kind: 'transport_error', reason };
  }

  /**
   * Decide whether the legacy (Tesseract/anchored/regional) pipeline is allowed to run.
   * Rules (in order):
   *   1. If user has explicitly disabled the local fallback in settings, never run legacy.
   *   2. Always allow when AI is unconfigured (no key) or explicitly disabled.
   *   3. For transport/parse failures, only allow if fallbackEnabled is true.
   */
  private async shouldAllowLegacyFallback(reason: string): Promise<boolean> {
    // Configuration errors (413, payload limits) are NOT AI failures. Running the
    // slow Tesseract pipeline won't fix the proxy — it just wastes 20 seconds.
    if (reason.includes('SERVER_PAYLOAD_LIMIT_TOO_LOW') || reason.includes('PAYLOAD_TOO_LARGE')) {
      console.error('[OCR_PIPELINE] Refusing legacy fallback — fix the server first (restart npm run dev).');
      return false;
    }
    try {
      const cfg = await AIOCRConfigService.load();
      if (cfg.fallbackEnabled === false) return false;
    } catch { /* default open */ }
    if (reason === 'NO_API_KEY' || reason === 'AI_DISABLED') return true;
    try {
      const cfg = AIOCRConfigService.peek();
      return cfg?.fallbackEnabled !== false;
    } catch { return true; }
  }

  /**
   * Render the input (PDF page(s) or image URL) into a canvas suitable for AI OCR.
   * For policies (apólices), renders up to 3 pages stacked vertically — the data
   * is rarely on page 1 (which is usually the cover/index). For CNH/CRLV, page 1
   * is sufficient. Scale is computed dynamically so the rendered canvas never
   * exceeds the type-specific max dimension; keeps payload small and Qianfan
   * handles any further resolution internally.
   */
  private async renderToCanvas(file: File, url: string, isPDF: boolean, typeHint?: string): Promise<HTMLCanvasElement | null> {
    if (isPDF) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFResourceManager.getDocument(new Uint8Array(arrayBuffer), file.name);
      const isPolicyDoc = typeHint === 'policy' || typeHint === 'apolice';
      const PAGE_LIMIT = isPolicyDoc ? Math.min(3, pdf.numPages) : 1;
      const MAX_DIM = isPolicyDoc ? 2000 : 1800;

      // First pass: figure out the scale that fits the widest page within MAX_DIM
      // and gather page metadata. All pages render at the same scale.
      const pageMetas: Array<{ pageNo: number; baseW: number; baseH: number }> = [];
      let maxBaseW = 0;
      for (let i = 1; i <= PAGE_LIMIT; i++) {
        const page = await pdf.getPage(i);
        const v = page.getViewport({ scale: 1 });
        pageMetas.push({ pageNo: i, baseW: v.width, baseH: v.height });
        if (v.width > maxBaseW) maxBaseW = v.width;
      }

      const scaleForWidth = MAX_DIM / maxBaseW;
      const scale = Math.min(isPolicyDoc ? 1.8 : 1.5, scaleForWidth);

      // Compute final canvas size (sum heights at this scale)
      const renderedPages = pageMetas.map(p => ({
        ...p,
        renderedW: Math.round(p.baseW * scale),
        renderedH: Math.round(p.baseH * scale)
      }));
      const finalW = Math.max(...renderedPages.map(p => p.renderedW));
      const finalH = renderedPages.reduce((acc, p) => acc + p.renderedH, 0);

      console.log(`[PDF_RENDER_LEAN] type=${typeHint} pages=${PAGE_LIMIT}/${pdf.numPages} scale=${scale.toFixed(2)} -> ${finalW}x${finalH}`);

      const canvas = document.createElement('canvas');
      canvas.width = finalW;
      canvas.height = finalH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, finalW, finalH);

      // Render each page stacked vertically.
      let offsetY = 0;
      for (const meta of renderedPages) {
        const page = await pdf.getPage(meta.pageNo);
        const viewport = page.getViewport({ scale });
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = viewport.width;
        pageCanvas.height = viewport.height;
        const pageCtx = pageCanvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
        pageCtx.fillStyle = 'white';
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        await page.render({ canvasContext: pageCtx, viewport, intent: 'display' }).promise;
        ctx.drawImage(pageCanvas, 0, offsetY);
        offsetY += pageCanvas.height;
      }
      return canvas;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  private async executeRegionalPipeline(file: File, url: string, isPDF: boolean, typeHint?: string, metrics?: OCRMetrics): Promise<any> {
    if (isPDF) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFResourceManager.getDocument(new Uint8Array(arrayBuffer), file.name);
      const page = await pdf.getPage(1);

      // CNH-e (digital): PDF may have embedded text layer with personal data, OR may have
      // personal data rendered as graphics with only footer/validation text selectable.
      // We must distinguish these two cases.
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      const pdfText = textContent.items.map((item: any) => item.str).join(' ').trim();

      // Build spatial tokens from the PDF text layer
      const structured: StructuredOCRResult = { text: '', words: [], lines: [], confidence: 100 };
      textContent.items.forEach((item: any) => {
        const text = item.str;
        if (text.trim()) {
          structured.words.push({
            text,
            x: item.transform[4],
            y: viewport.height - item.transform[5],
            width: item.width || text.length * 8,
            height: item.height || 12,
            confidence: 100
          });
        }
      });

      // Validate: do the tokens contain CNH labels as DISTINCT words (not substrings)?
      // This rules out footer text like "VALIDAÇÃO DO DOCUMENTO" which contains "VALIDA" as substring.
      const tokenWords = structured.words.map(w => w.text.toUpperCase().normalize('NFD').replace(/\p{M}/gu, ''));
      const CNH_LABELS = ['NOME', 'CPF', 'NASCIMENTO', 'REGISTRO', 'CATEGORIA', 'FILIACAO'];
      const hasCNHLabel = CNH_LABELS.some(label => tokenWords.some(tw => tw === label || tw.startsWith(label + ' ') || tw.endsWith(' ' + label) || tw === label + ':'));
      const hasCPFPattern = structured.words.some(w => /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(w.text));

      if (pdfText.length >= 100 && (hasCNHLabel || hasCPFPattern)) {
        console.log(`[OCR_PIPELINE] [CNH_PDF_TEXT_LAYER] ${pdfText.length} chars and ${structured.words.length} tokens with real CNH labels. Using structured PDF pipeline.`);
        console.log(`[OCR_PIPELINE] [PDF_STRUCTURED_EXTRACT] Generated ${structured.words.length} spatial tokens from PDF layer.`);
        return { text: pdfText, structured, regions: undefined };
      }

      // Scanned / photo CNH or CNH-e with graphics-only personal data: fall back to visual pipeline
      console.log(`[OCR_PIPELINE] [CNH_VISUAL_FALLBACK] PDF text layer has ${pdfText.length} chars / ${structured.words.length} tokens but no CNH labels. Using visual pipeline.`);
      const visual = await HybridOCRService.getInstance().performVisualOCR('', page, typeHint);
      return visual;
    } else {
      return await HybridOCRService.getInstance().performVisualOCR(url, null, typeHint);
    }
  }

  private async executeHybridPipeline(file: File, url: string, isPDF: boolean, typeHint?: string, metrics?: OCRMetrics): Promise<any> {
    let fullText = "";
    let regions = undefined;
    let structured = undefined;

    if (isPDF) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFResourceManager.getDocument(new Uint8Array(arrayBuffer), file.name);
      
      for (let i = 1; i <= Math.min(pdf.numPages, 2); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        
        if (pageText.trim().length < 150) {
          const visual = await HybridOCRService.getInstance().performVisualOCR("", page, typeHint);
          fullText += `--- Page ${i} (Visual) ---\n${visual.text}\n\n`;
          if (i === 1) {
            regions = visual.regions;
            structured = visual.structured;
          }
        } else {
          fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }
      }
    } else {
      const visual = await HybridOCRService.getInstance().performVisualOCR(url, null, typeHint);
      fullText = visual.text;
      regions = visual.regions;
      structured = visual.structured;
    }

    return { text: fullText, regions, structured };
  }

  private async executeTextPipeline(file: File, url: string, isPDF: boolean, typeHint?: string, metrics?: OCRMetrics): Promise<any> {
    if (!isPDF) {
       const visual = await HybridOCRService.getInstance().performVisualOCR(url, null, typeHint);
       return { text: visual.text, structured: visual.structured };
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFResourceManager.getDocument(new Uint8Array(arrayBuffer), file.name);
    let fullText = "";
    
    // STRUCTURED_PIPELINE: Extrair coordenadas nativas do PDF
    const structured: StructuredOCRResult = { text: '', words: [], lines: [], confidence: 100 };

    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      const pageLines: string[] = [];
      
      // Mapeamento espacial nativo do PDF para compatibilidade com Layout Engine
      textContent.items.forEach((item: any) => {
        const text = item.str;
        if (text.trim()) {
          // Coordenadas: [a, b, c, d, x, y] -> x, y estão nos índices 4 e 5
          const x = item.transform[4];
          const y = viewport.height - item.transform[5]; // Normalização para topo-esquerda
          
          structured.words.push({
            text,
            x,
            y,
            width: item.width || (text.length * 8), // Estimativa se ausente
            height: item.height || 12,
            confidence: 100
          });
          pageLines.push(text);
        }
      });

      fullText += `--- Page ${i} ---\n${pageLines.join(" ")}\n\n`;
    }

    console.log(`[OCR_PIPELINE] [PDF_STRUCTURED_EXTRACT] Generated ${structured.words.length} spatial tokens from PDF layer.`);
    return { text: fullText, structured };
  }

  /**
   * After a successful AI extraction, run the deterministic text-layer parser
   * and use it to fill any fields the AI left empty. Currently scoped to
   * policy/apolice PDFs because that's where Qianfan most consistently misses
   * dense small-print fields (broker name, SUSEP, CNPJs). AI values always
   * win when both pipelines extracted something for the same field.
   */
  private async enrichAIFieldsFromTextLayer(
    file: File | string,
    isPDF: boolean,
    isLocalFile: boolean,
    typeHint: string | undefined,
    aiFields: Record<string, any>
  ): Promise<Record<string, any>> {
    if (!isPDF || !isLocalFile) return aiFields;
    if (typeHint !== 'policy' && typeHint !== 'apolice') return aiFields;

    try {
      console.log('[OCR_TEXT_LAYER_ENRICH] Running deterministic parser on PDF text layer to fill AI gaps...');
      const textResult = await this.executeTextPipeline(file as File, '', true, typeHint);
      const engineResult = await DocumentEngine.getInstance().process(
        textResult.text,
        typeHint,
        undefined,
        textResult.structured
      );

      const detFields: Record<string, any> = engineResult.structuredData || {};
      const merged: Record<string, any> = { ...aiFields };

      // [deterministicKey, aiSchemaKeys[]] — schemaKeys are the names the AI uses
      // in its JSON output. We fill ALL of them with the same value so legacy
      // aliases stay consistent.
      const POLICY_FIELD_MAP: Array<[string, string[]]> = [
        ['brokerName',     ['corretora', 'brokerName']],
        ['brokerSusep',    ['corretora_susep', 'brokerSusep']],
        ['policyNumber',   ['numero_apolice', 'policyNumber']],
        ['insurer',        ['seguradora', 'insurer']],
        ['insuredName',    ['segurado_nome', 'insuredName']],
        ['insuredCpf',     ['segurado_cpf', 'insuredCpf']],
        ['plate',          ['placa']],
        ['chassis',        ['chassi']],
        ['cep',            ['cep']],
        ['startDate',      ['inicio_vigencia', 'startDate']],
        ['insuranceExpiry',['fim_vigencia', 'insuranceExpiry']]
      ];

      let filled = 0;
      for (const [detKey, schemaKeys] of POLICY_FIELD_MAP) {
        const rawDetValue = detFields[detKey];
        if (rawDetValue == null) continue;
        const detValue = this.trimDeterministicValue(detKey, String(rawDetValue));
        if (!detValue || detValue.length < 2) continue;

        const aiHasIt = schemaKeys.some(k => {
          const v = merged[k];
          return typeof v === 'string' && v.trim().length > 0;
        });
        if (aiHasIt) continue;

        for (const k of schemaKeys) merged[k] = detValue;
        filled++;
        console.log(`[OCR_MERGE] Filled "${schemaKeys[0]}" from text layer: "${detValue.substring(0, 60)}"`);
      }

      // Bonus: if brokerName carries a CNPJ inline, mine it out into corretora_cnpj
      // (the deterministic engine doesn't separate them).
      if (!merged.corretora_cnpj) {
        const brokerSource = String(detFields.brokerName ?? aiFields.corretora ?? aiFields.brokerName ?? '');
        const cnpjMatch = brokerSource.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
        if (cnpjMatch) {
          merged.corretora_cnpj = cnpjMatch[0];
          filled++;
          console.log(`[OCR_MERGE] Extracted "corretora_cnpj" from broker block: "${cnpjMatch[0]}"`);
        }
      }

      if (filled > 0) {
        console.log(`[OCR_MERGE] ${filled} field(s) added from deterministic text-layer parser.`);
      } else {
        console.log('[OCR_MERGE] No additional fields available from text layer.');
      }
      return merged;
    } catch (err: any) {
      console.warn('[OCR_MERGE_FAILED] Text-layer enrichment failed; using AI fields as-is:', err.message);
      return aiFields;
    }
  }

  /**
   * The deterministic parser often returns broker info with the CNPJ and
   * address concatenated onto the company name ("ADM DE SEGUROS LTDA
   * 10.609.165/0001-19 Endereço RUA AXUA, 12 Bairro"). Trim those tails so
   * the field carries just the entity name.
   */
  private trimDeterministicValue(field: string, value: string): string {
    const trimmed = value.trim();
    if (field === 'brokerName') {
      const cnpjMatch = trimmed.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
      if (cnpjMatch && typeof cnpjMatch.index === 'number' && cnpjMatch.index > 0) {
        return trimmed.substring(0, cnpjMatch.index).trim();
      }
      const lowered = trimmed.toLowerCase();
      for (const stop of ['endereço', 'endereco', 'bairro', 'susep', 'cep']) {
        const idx = lowered.indexOf(stop);
        if (idx > 5) return trimmed.substring(0, idx).trim();
      }
      return trimmed;
    }
    if (field === 'brokerSusep') {
      // Trailing dashes/spaces ("518-5 -" → "518-5")
      return trimmed.replace(/[\s-]+$/, '').trim();
    }
    return trimmed;
  }
}

