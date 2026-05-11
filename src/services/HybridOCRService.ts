import { LocalOCRService } from "./LocalOCRService";
import { CNH_LANDSCAPE_PROFILE, CNHCoordinateEngine, CNHFieldProfile } from "./document-engine/CNHCoordinateMap";
import { PDFRenderService } from "./PDFRenderService";
import { DocumentMemoryManager } from "./DocumentMemoryManager";
import { OCRPreprocessService } from "./OCRPreprocessService";
import { StructuredOCRResult, OCRWord } from "../types/OCRTypes";

/**
 * HybridOCRService.ts
 * Manages local OCR execution with rigid regional crop capability.
 * NO-AI ENTERPRISE PIPELINE.
 */
export class HybridOCRService {
  private static instance: HybridOCRService;
  private static readonly SPATIAL_DEBUG_MODE = true;
  private constructor() {}

  public static getInstance(): HybridOCRService {
    if (!this.instance) this.instance = new HybridOCRService();
    return this.instance;
  }

  public static async renderPageToImage(page: any, scale: number = 3.0): Promise<string> {
    return this.getInstance().renderPageToImage(page, scale);
  }

  public static async performVisualOCR(imageUrl: string, page?: any, type?: string): Promise<{ text: string, regions?: any, structured?: StructuredOCRResult, debug?: any, metrics?: any }> {
    return this.getInstance().performVisualOCR(imageUrl, page, type);
  }

  public async renderPageToImage(page: any, scale: number = 5.0): Promise<string> {
    const result = await PDFRenderService.renderToDataURL(page, { scale });
    return result.url;
  }

  private validateCanvas(canvas: HTMLCanvasElement): boolean {
    return !!canvas && canvas.width > 32 && canvas.height > 32;
  }

  private validateCrop(imgWidth: number, imgHeight: number, rx: number, ry: number, rw: number, rh: number): boolean {
    if (rw <= 0 || rh <= 0) return false;
    if (rx < 0 || ry < 0) return false;
    if (rx + rw > imgWidth + 10 || ry + rh > imgHeight + 10) {
      console.warn('[CROP_VALIDATION] Region out of bounds', { imgWidth, imgHeight, rx, ry, rw, rh });
      return false;
    }
    return true;
  }

  public async performVisualOCR(imageUrl: string, page?: any, type?: string): Promise<{ text: string, regions?: any, structured?: StructuredOCRResult, debug?: any, metrics?: any }> {
    const startTime = Date.now();
    const metrics: any = {
      startTime,
      typeUsed: type,
      source: page ? 'PDF_RENDER' : 'IMAGE_URL'
    };

    try {
      let finalImageUrl = imageUrl;
      if (page && !imageUrl) {
        const renderResult = await PDFRenderService.renderToDataURL(page, { type });
        finalImageUrl = renderResult.url;
        metrics.renderScale = renderResult.scale;
        metrics.resolution = `${renderResult.width}x${renderResult.height}`;
      }
      
      if (!finalImageUrl) throw new Error('NO_IMAGE_SOURCE');

    if (type === 'cnh') {
        const baseCanvas = await this.prepareCNHSourceImage(finalImageUrl);
        const result = await this.performCNHRegionPipelineWithCanvas(baseCanvas, startTime);
        
        // CNH STRATEGY: Regional tokens are primary, but 0 tokens triggers a global fallback for parsing survivability
        if (result.structured.words.length === 0) {
           console.warn('[HYBRID_OCR] [CNH] Regional extraction returned 0 tokens. Attempting global fallback.');
           
           // Pass 1: Fresh Global OCR
           let globalStructured = await LocalOCRService.getInstance().performStructuredOCR(baseCanvas);
           
           // Pass 2: If Pass 1 failed, try with high-contrast preprocessing
           if (globalStructured.words.length === 0) {
             console.warn('[HYBRID_OCR] [CNH] Global Pass 1 failed. Retrying with preprocessing...');
             const fallbackCanvas = document.createElement('canvas');
             fallbackCanvas.width = baseCanvas.width;
             fallbackCanvas.height = baseCanvas.height;
             const fctx = fallbackCanvas.getContext('2d')!;
             fctx.drawImage(baseCanvas, 0, 0);
             OCRPreprocessService.process(fctx, fallbackCanvas.width, fallbackCanvas.height, { pass: 2 });
             globalStructured = await LocalOCRService.getInstance().performStructuredOCR(fallbackCanvas);
           }
           
           if (globalStructured.words.length === 0) {
             console.error('[HYBRID_OCR] [CNH] All spatial extraction attempts failed (Reg + Global + Preproc). Aborting.');
             throw new Error('CNH_SPATIAL_EXTRACTION_FAILED');
           }

           console.log(`[HYBRID_OCR] [CNH] Global Fallback SUCCESS. Tokens: ${globalStructured.words.length}`);

           // Remap global tokens to REF space
           const REF_W = 1000;
           const REF_H = 700;
           const scaleX = REF_W / baseCanvas.width;
           const scaleY = REF_H / baseCanvas.height;

           const remappedWords = globalStructured.words.map(w => ({
             ...w,
             x: w.x * scaleX,
             y: w.y * scaleY,
             width: w.width * scaleX,
             height: w.height * scaleY
           }));

           result.structured.words = remappedWords;
           result.structured.text = globalStructured.text;
           result.debug.pipeline = 'CNH_Global_Fallback_v1';
        }
        return { ...result, metrics: { ...metrics, ...result.debug.metrics, totalTime: Date.now() - startTime } };
      }

      const structured = await LocalOCRService.getInstance().performStructuredOCR(finalImageUrl);
      metrics.totalTime = Date.now() - startTime;
      metrics.chars = structured.text.length;

      const debug = {
        time: metrics.totalTime,
        chars: structured.text.length,
        isVisual: true,
        pipeline: 'Tesseract_v5_FullPage_Structured'
      };
      return { text: structured.text, structured, debug, metrics };
    } catch (err: any) {
      console.error('[VISUAL_OCR_CRITICAL_FAIL]', err);
      return { text: '', debug: { success: false, error: err.message }, metrics: { ...metrics, error: err.message } };
    }
  }

  private async prepareCNHSourceImage(imageUrl: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const orientedCanvas = await this.detectAndFixCNHOrientation(img);
          
          // SCALE NORMALIZATION: Standardize to 2200px width for OCR stability
          const TARGET_WIDTH = 2200;
          const scale = TARGET_WIDTH / orientedCanvas.width;
          
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = TARGET_WIDTH;
          finalCanvas.height = Math.round(orientedCanvas.height * scale);
          const fctx = finalCanvas.getContext('2d')!;
          fctx.drawImage(orientedCanvas, 0, 0, orientedCanvas.width, orientedCanvas.height, 0, 0, finalCanvas.width, finalCanvas.height);
          
          console.log(`[HYBRID_OCR] [CNH] Source ready: ${finalCanvas.width}x${finalCanvas.height} (Scale: ${scale.toFixed(2)})`);
          resolve(finalCanvas);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
      img.src = imageUrl;
    });
  }

  private async detectAndFixCNHOrientation(img: HTMLImageElement): Promise<HTMLCanvasElement> {
    const isPortrait = img.height > img.width;
    console.log(`[ORIENTATION_ENGINE] Initial aspect: ${isPortrait ? 'Portrait' : 'Landscape'}`);

    const candidateRotations = isPortrait ? [90, 270] : [0, 180];
    let bestRotation = candidateRotations[0];
    let foundAnchor = false;
    
    // Quick probe for anchors in the header of each candidate
    for (const rot of candidateRotations) {
      const probeCanvas = document.createElement('canvas');
      const pctx = probeCanvas.getContext('2d', { willReadFrequently: true })!;
      
      const pWidth = rot % 180 === 0 ? img.width : img.height;
      const pHeight = rot % 180 === 0 ? img.height : img.width;
      
      probeCanvas.width = Math.min(800, pWidth);
      probeCanvas.height = Math.min(200, pHeight);
      
      const tempFull = document.createElement('canvas');
      tempFull.width = pWidth;
      tempFull.height = pHeight;
      const tctx = tempFull.getContext('2d')!;
      tctx.translate(tempFull.width / 2, tempFull.height / 2);
      tctx.rotate(rot * Math.PI / 180);
      tctx.drawImage(img, -img.width / 2, -img.height / 2);

      pctx.drawImage(tempFull, 0, 0, pWidth, pHeight * 0.2, 0, 0, probeCanvas.width, probeCanvas.height);
      
      const probeResult = await LocalOCRService.getInstance().performStructuredOCR(probeCanvas);
      const uProbe = probeResult.text.toUpperCase();
      console.log(`[ORIENTATION_PROBE] Rotation ${rot} text: "${uProbe.trim()}" | Conf: ${probeResult.confidence} | Tokens: ${probeResult.words.length}`);
      
      const markers = ['REPUBLICA', 'FEDERATIVA', 'BRASIL', 'HABILITACAO', 'VALE', 'EM', 'TODO', 'TERRITORIO', 'NACIONAL', 'DOCUMENTO', 'MINISTERIO', 'TRANSITO'];
      if ((markers.some(m => uProbe.includes(m)) && probeResult.confidence > 15) || (probeResult.words.length > 5 && probeResult.confidence > 25)) {
        console.log(`[ORIENTATION_ENGINE] Anchor found for ${rot}deg. Confidence: ${probeResult.confidence}. Alignment locked.`);
        bestRotation = rot;
        foundAnchor = true;
        break;
      }
    }

    if (!foundAnchor) {
      console.warn(`[ORIENTATION_ENGINE] No clear anchors found. Defaulting to ${bestRotation}deg approach.`);
    }

    const finalCanvas = document.createElement('canvas');
    const fctx = finalCanvas.getContext('2d')!;
    if (bestRotation % 180 === 0) {
      finalCanvas.width = img.width;
      finalCanvas.height = img.height;
    } else {
      finalCanvas.width = img.height;
      finalCanvas.height = img.width;
    }

    fctx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
    fctx.rotate(bestRotation * Math.PI / 180);
    fctx.drawImage(img, -img.width / 2, -img.height / 2);
    
    return finalCanvas;
  }

  private async performCNHRegionPipelineWithCanvas(baseCanvas: HTMLCanvasElement, startTime: number): Promise<{ text: string, regions: any, structured: StructuredOCRResult, debug: any }> {
    const regionResults: Record<string, string> = {};
    const regionImages: Record<string, string> = {};
    const regionMetrics: Record<string, any> = {};
    
    // REFERENCE COORDINATE SPACE (Hardened Requirement)
    const REF_W = 1000;
    const REF_H = 700;

    const globalStructured: StructuredOCRResult = {
      text: '',
      words: [],
      lines: [],
      confidence: 0
    };

    const fieldProfiles = Object.values(CNH_LANDSCAPE_PROFILE.fields);
    let totalConf = 0;
    let wordCount = 0;
    
    console.log(`[HYBRID_OCR] Starting CNH Regional Pipeline. Base size: ${baseCanvas.width}x${baseCanvas.height}`);

    for (const profile of fieldProfiles) {
      const regionStart = Date.now();
      try {
        const { text: regionText, structured: regionStructured, debugImg, metrics, actualRegion } = await this.extractRegionWithRetry(baseCanvas, profile);
        
        const sanitized = regionText.trim();
        regionResults[profile.key] = sanitized;
        if (debugImg) regionImages[profile.key] = debugImg;
        regionMetrics[profile.key] = { ...metrics, time: Date.now() - regionStart };

        if (regionStructured && actualRegion && regionStructured.metrics) {
          // Normalize to REFERENCE space (1000x700)
          const localToSourceScaleX = actualRegion.width / regionStructured.metrics.canvasWidth;
          const localToSourceScaleY = actualRegion.height / regionStructured.metrics.canvasHeight;
          
          const sourceToRefScaleX = REF_W / baseCanvas.width;
          const sourceToRefScaleY = REF_H / baseCanvas.height;

          const regionWords: OCRWord[] = [];
          regionStructured.words.forEach(w => {
            const sourceX = actualRegion.x + (w.x * localToSourceScaleX);
            const sourceY = actualRegion.y + (w.y * localToSourceScaleY);
            
            const rw = (w.width * localToSourceScaleX) * sourceToRefScaleX;
            const rh = (w.height * localToSourceScaleY) * sourceToRefScaleY;

            // SANITY CHECK: Filter invalid geometries
            if (rw <= 0 || rh <= 0 || isNaN(sourceX) || isNaN(sourceY)) return;

            const refWord: OCRWord = {
              ...w,
              x: sourceX * sourceToRefScaleX,
              y: sourceY * sourceToRefScaleY,
              width: rw,
              height: rh
            };

            globalStructured.words.push(refWord);
            regionWords.push(refWord);
            totalConf += w.confidence;
            wordCount++;
          });

          if (HybridOCRService.SPATIAL_DEBUG_MODE) {
            console.log(`[SPATIAL_DEBUG] [${profile.key.toUpperCase()}] Extracted: "${sanitized}" | Tokens: ${regionWords.length} | Pass: ${metrics.pass}`);
          }
        } else {
          console.warn(`[HYBRID_OCR] Region ${profile.key} returned no structured data.`);
        }
      } catch (err) {
        console.error(`[HYBRID_OCR] Critical error in region ${profile.key}:`, err);
        regionResults[profile.key] = "";
      }
    }

    globalStructured.confidence = wordCount > 0 ? totalConf / wordCount : 0;
    globalStructured.text = Object.values(regionResults).filter(t => t.length > 0).join(' ');

    if (HybridOCRService.SPATIAL_DEBUG_MODE) {
       this.generateSpatialDebugOverlay(baseCanvas, globalStructured);
    }

    const debug = {
      time: Date.now() - startTime,
      isVisual: true,
      pipeline: 'CNH_Regional_Deterministic_v8_Telemetry',
      profile: CNH_LANDSCAPE_PROFILE.id,
      regions: regionResults,
      regionImages,
      metrics: regionMetrics,
      telemetry: {
        totalTokens: wordCount,
        avgConfidence: globalStructured.confidence,
        regionsProcessed: fieldProfiles.length,
        baseResolution: `${baseCanvas.width}x${baseCanvas.height}`
      }
    };

    return { text: globalStructured.text, regions: regionResults, structured: globalStructured, debug };
  }

  private generateSpatialDebugOverlay(baseCanvas: HTMLCanvasElement, structured: StructuredOCRResult) {
    try {
      const debugCanvas = document.createElement('canvas');
      debugCanvas.width = baseCanvas.width;
      debugCanvas.height = baseCanvas.height;
      const ctx = debugCanvas.getContext('2d')!;
      ctx.drawImage(baseCanvas, 0, 0);
      
      const sourceToRefScaleX = 1000 / baseCanvas.width;
      const sourceToRefScaleY = 700 / baseCanvas.height;
      
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.lineWidth = 3;
      
      structured.words.forEach(w => {
        const sx = w.x / sourceToRefScaleX;
        const sy = w.y / sourceToRefScaleY;
        const sw = w.width / sourceToRefScaleX;
        const sh = w.height / sourceToRefScaleY;
        ctx.strokeRect(sx, sy, sw, sh);
      });
      console.log(`[GEOMETRIC_DEBUG] Master overlay generated for CNH. Tokens: ${structured.words.length}`);
    } catch (e) {
      console.error('[GEOMETRIC_DEBUG_FAIL]', e);
    }
  }

  private async extractRegionWithRetry(source: HTMLCanvasElement | string, profile: CNHFieldProfile): Promise<{ text: string, structured?: StructuredOCRResult, debugImg?: string, metrics?: any, actualRegion?: any }> {
    const passes = [1, 2, 3]; 
    let lastResult: any = { text: '' };
    
    for (const pass of passes) {
      const result = await this.extractRegionSinglePass(source, profile, pass);
      const cleanText = result.text.trim();
      const minLen = profile.key === 'categoria' ? 1 : 3;

      if (cleanText.length >= minLen && !this.isCorruptedOCRText(cleanText)) {
        if (profile.validationRegex && !profile.validationRegex.test(cleanText)) continue;
        return { ...result, metrics: { pass } };
      }
      lastResult = result;
    }
    return { ...lastResult, metrics: { pass: passes.length, failed: true } };
  }

  private async extractRegionSinglePass(source: HTMLCanvasElement | string, profile: CNHFieldProfile, pass: number): Promise<{ text: string, structured?: StructuredOCRResult, debugImg?: string, actualRegion?: any }> {
    return new Promise((resolve) => {
      const processWithCanvas = (baseCanvas: HTMLCanvasElement) => {
        try {
          const baseWidth = baseCanvas.width;
          const baseHeight = baseCanvas.height;

          const region = CNHCoordinateEngine.resolveRegion(profile.key, baseWidth, baseHeight);
          if (!region || !this.validateCrop(baseWidth, baseHeight, region.x, region.y, region.width, region.height)) {
            return resolve({ text: '' });
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
          
          const upscaleFactor = pass === 3 ? 4.0 : 3.0; 
          canvas.width = region.width * upscaleFactor;
          canvas.height = region.height * upscaleFactor;
          
          if (!this.validateCanvas(canvas)) return resolve({ text: '' });

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(baseCanvas, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
          
          CNHCoordinateEngine.applyExclusions(ctx, profile, canvas.width, canvas.height);
          
          OCRPreprocessService.process(ctx, canvas.width, canvas.height, {
            pass,
            sharpen: pass >= 2,
            contrast: pass === 3 ? 1.8 : 1.4,
            grayscale: true
          });
          
          LocalOCRService.getInstance().performStructuredOCR(canvas, { char_whitelist: profile.whitelist || '' })
            .then(structured => {
              if (HybridOCRService.SPATIAL_DEBUG_MODE) {
                console.log(`[LOCAL_OCR_DEBUG] Region: ${profile.key} | Pass: ${pass} | Words: ${structured.words.length} | Text: "${structured.text.trim()}"`);
              }
              (structured as any).metrics = { canvasWidth: canvas.width, canvasHeight: canvas.height };
              const debugImg = pass === 1 ? canvas.toDataURL('image/jpeg', 0.6) : '';
              canvas.width = 0; canvas.height = 0;
              resolve({ text: structured.text, structured, debugImg, actualRegion: region });
            }).catch(err => {
              console.error(`[LOCAL_OCR_ERROR] Region: ${profile.key}`, err);
              resolve({ text: '' });
            });
        } catch (e) { resolve({ text: '' }); }
      };

      if (source instanceof HTMLCanvasElement) {
        processWithCanvas(source);
      } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
          const baseCanvas = await this.fixOrientation(img);
          processWithCanvas(baseCanvas);
        };
        img.onerror = () => resolve({ text: '' });
        img.src = source;
      }
    });
  }

  private isCorruptedOCRText(text: string): boolean {
    if (!text) return false;
    const tokens = text.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length > 6 && tokens.every(t => t.length === 1)) return true;
    
    const alphaCount = (text.match(/[a-z0-9]/gi) || []).length;
    if (text.length > 8 && alphaCount / text.length < 0.2) return true;
    return false;
  }

  private async fixOrientation(img: HTMLImageElement): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const isPortrait = img.height > img.width;
    if (isPortrait) {
      canvas.width = img.height;
      canvas.height = img.width;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(90 * Math.PI / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    }
    return canvas;
  }
}


