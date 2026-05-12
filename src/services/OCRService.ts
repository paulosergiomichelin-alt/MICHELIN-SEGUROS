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
import { PDFRenderService } from './PDFRenderService';

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
      const cachedResult = CacheManager.get(`enterprise_ocr_cache:${fingerprint}`);
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
        const aiResult = await this.tryAIPipeline(file as File, fileUrl, isPDF, typeHint as AIDocumentType, metrics);
        if (aiResult) {
          metrics.totalTime = Date.now() - startTime;
          metrics.confidence = aiResult.confidence / 100;

          const finalResult = {
            text: aiResult.rawText,
            type: typeHint,
            structuredData: aiResult.fields,
            confidence: aiResult.confidence / 100,
            regions: aiResult.fields,
            metrics,
            fileUrl,
            provider: aiResult.provider,
            validation: aiResult.validation
          };

          if (isLocalFile && fingerprint && aiResult.confidence >= 60) {
            CacheManager.set(`enterprise_ocr_cache:${fingerprint}`, finalResult);
          }
          if (options.onStatus) options.onStatus(ProcessingState.COMPLETED);
          console.log(`[OCR_PIPELINE] AI_SUCCESS | Type: ${typeHint} | Conf: ${aiResult.confidence}% | Time: ${metrics.totalTime}ms`);
          return finalResult;
        }
        console.warn('[OCR_PIPELINE] AI pipeline unavailable or low-confidence; falling back to local pipeline.');
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
        CacheManager.set(`enterprise_ocr_cache:${fingerprint}`, finalResult);
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
   * Try the AI-driven OCR pipeline first. Returns null if it fails or yields
   * low confidence, signalling the caller to fall back to the local pipeline.
   */
  private async tryAIPipeline(file: File, url: string, isPDF: boolean, typeHint: AIDocumentType, metrics: OCRMetrics): Promise<any | null> {
    try {
      const canvas = await this.renderToCanvas(file, url, isPDF);
      if (!canvas) return null;
      const aiResult = await AIHybridOCRService.getInstance().extractFromCanvas(canvas, typeHint);
      if (!aiResult.success) return null;
      // Confidence floor: below 40% we don't trust the result and fall back.
      if (aiResult.confidence < 40) {
        console.warn(`[AI_OCR_LOW_CONFIDENCE] ${aiResult.confidence}% — using local pipeline instead.`);
        return null;
      }
      return aiResult;
    } catch (err: any) {
      console.error('[AI_OCR_PIPELINE_ERROR]', err.message);
      return null;
    }
  }

  /** Render the input (PDF page 1 or image URL) into a canvas suitable for AI OCR. */
  private async renderToCanvas(file: File, url: string, isPDF: boolean): Promise<HTMLCanvasElement | null> {
    if (isPDF) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFResourceManager.getDocument(new Uint8Array(arrayBuffer), file.name);
      const page = await pdf.getPage(1);
      // Use the existing PDF render service; scale 2.5 is enough for vision LLM input
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;
      return canvas;
    }
    // Non-PDF: load the image and draw onto a canvas
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
}

