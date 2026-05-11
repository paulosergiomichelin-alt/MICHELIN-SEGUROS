import { PDFResourceManager } from './PDFResourceManager';
import { CacheManager } from "./CacheManager";
import { DocumentEngine } from "./document-engine/DocumentEngine";
import { DocumentFingerprintService } from './document-engine/DocumentFingerprintService';
import { HybridOCRService } from './HybridOCRService';
import { OCRStrategyResolver, OCRStrategy } from './OCRStrategyResolver';
import { DocumentMemoryManager } from './DocumentMemoryManager';
import { OCRRegionSchemaValidator } from './OCRRegionSchemaValidator';
import { StructuredOCRResult } from '../types/OCRTypes';

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

      // PIPELINE EXECUTION BY STRATEGY
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

  private async executeRegionalPipeline(file: File, url: string, isPDF: boolean, typeHint?: string, metrics?: OCRMetrics): Promise<any> {
    if (isPDF) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFResourceManager.getDocument(new Uint8Array(arrayBuffer), file.name);
      const page = await pdf.getPage(1);

      // CNH-e (digital): PDF has embedded text layer — use it directly instead of visual OCR.
      // Physical/scanned CNH uploaded as PDF will have <100 chars and fall through to visual.
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      const pdfText = textContent.items.map((item: any) => item.str).join(' ').trim();

      // CNH-e digital PDFs embed personal data as graphics; only footer/validation text is
      // selectable. Strip URLs before checking markers to avoid false positives on paths
      // like /habilitacao/ in the SENATRAN validation URL.
      const textWithoutUrls = pdfText.replace(/https?:\/\/\S+/gi, '');
      const CNH_DATA_MARKERS = ['NOME', 'CPF', 'NASCIMENTO', 'REGISTRO', 'CATEGORIA', 'VALIDADE', 'FILIACAO'];
      const hasCPFPattern = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(textWithoutUrls);
      const hasPersonalDataMarkers = CNH_DATA_MARKERS.some(m => textWithoutUrls.toUpperCase().includes(m)) || hasCPFPattern;

      if (pdfText.length >= 100 && hasPersonalDataMarkers) {
        console.log(`[OCR_PIPELINE] [CNH_PDF_TEXT_LAYER] ${pdfText.length} chars found with data markers. Using structured PDF pipeline.`);
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
        console.log(`[OCR_PIPELINE] [PDF_STRUCTURED_EXTRACT] Generated ${structured.words.length} spatial tokens from PDF layer.`);
        return { text: pdfText, structured, regions: undefined };
      }

      // Scanned / photo CNH or CNH-e with graphics-only personal data: fall back to visual pipeline
      console.log(`[OCR_PIPELINE] [CNH_VISUAL_FALLBACK] PDF text layer has ${pdfText.length} chars but no personal data markers. Using visual pipeline.`);
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

