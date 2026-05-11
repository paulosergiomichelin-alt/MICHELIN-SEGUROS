import { createWorker } from 'tesseract.js';
import { StructuredOCRResult, OCRWord, OCRLine } from '../types/OCRTypes';

/**
 * LocalOCRService.ts
 * 100% Deterministic Local OCR using Tesseract.js.
 * No AI, No Cloud, No external Vision APIs.
 */
export class LocalOCRService {
  private static instance: LocalOCRService;
  private pool: Tesseract.Worker[] = [];
  private poolSize = 2; // Fixed enterprise pool size
  private queue: Array<(worker: Tesseract.Worker) => void> = [];
  private busyWorkers = new Set<Tesseract.Worker>();

  private constructor() {}

  public static getInstance(): LocalOCRService {
    if (!this.instance) this.instance = new LocalOCRService();
    return this.instance;
  }

  private async getWorkerFromPool(): Promise<Tesseract.Worker> {
    // 1. Reclaim idle worker
    for (const worker of this.pool) {
      if (!this.busyWorkers.has(worker)) {
        this.busyWorkers.add(worker);
        return worker;
      }
    }

    // 2. Grow pool if under limit
    if (this.pool.length < this.poolSize) {
      console.log(`[OCR_POOL] Growing pool: ${this.pool.length + 1}/${this.poolSize}`);
      const worker = await createWorker('por');
      this.pool.push(worker);
      this.busyWorkers.add(worker);
      return worker;
    }

    // 3. Queue request
    return new Promise((resolve) => {
      console.log('[OCR_POOL] Queueing request...');
      this.queue.push((worker) => {
        this.busyWorkers.add(worker);
        resolve(worker);
      });
    });
  }

  private releaseWorker(worker: Tesseract.Worker) {
    this.busyWorkers.delete(worker);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next(worker);
    }
  }

  public async performOCR(input: string | HTMLCanvasElement, options: { char_whitelist?: string } = {}): Promise<string> {
    const result = await this.performStructuredOCR(input, options);
    return result.text;
  }

  public async performStructuredOCR(input: string | HTMLCanvasElement, options: { char_whitelist?: string } = {}): Promise<StructuredOCRResult> {
    const startTime = Date.now();
    const TIMEOUT = 35000;
    
    const worker = await this.getWorkerFromPool();

    try {
      return await new Promise((resolve) => {
        const timeoutId = setTimeout(async () => {
          console.error('[LOCAL_OCR] Timeout reached. Terminating worker for safety.');
          this.pool = this.pool.filter(w => w !== worker);
          this.busyWorkers.delete(worker);
          try { await worker.terminate(); } catch (e) {
            console.warn('[LOCAL_OCR] Worker termination failed', e);
          }
          resolve({ text: '', words: [], lines: [], confidence: 0 });
        }, TIMEOUT);

        (async () => {
          try {
            const params: any = {
              tessjs_create_hocr: '1', // Required for word-level bounding boxes in Tesseract.js v7+
              tessjs_create_tsv: '0'
            };
            if (options.char_whitelist) {
              params.tessedit_char_whitelist = options.char_whitelist;
            }
            await worker.setParameters(params);

            const recognitionResult = await worker.recognize(input);
            const data = recognitionResult.data as any;
            console.log(`[LOCAL_OCR] Structured Success. Confidence: ${data.confidence}, Time: ${Date.now() - startTime}ms`);
            
            const words: OCRWord[] = (data.words || []).map((w: any) => ({
              text: w.text,
              x: w.bbox.x0,
              y: w.bbox.y0,
              width: w.bbox.x1 - w.bbox.x0,
              height: w.bbox.y1 - w.bbox.y0,
              confidence: w.confidence
            }));

            // Tesseract.js v7: data.words is empty; parse word bounding boxes from HOCR HTML.
            if (words.length === 0 && data.hocr) {
              try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.hocr, 'text/html');
                doc.querySelectorAll('.ocrx_word').forEach((el: Element) => {
                  const title = el.getAttribute('title') || '';
                  const bbox = title.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
                  const conf = title.match(/x_wconf\s+(\d+)/);
                  const wordText = (el.textContent || '').trim();
                  if (bbox && wordText) {
                    words.push({
                      text: wordText,
                      x: parseInt(bbox[1]),
                      y: parseInt(bbox[2]),
                      width: parseInt(bbox[3]) - parseInt(bbox[1]),
                      height: parseInt(bbox[4]) - parseInt(bbox[2]),
                      confidence: conf ? parseInt(conf[1]) : 50
                    });
                  }
                });
                if (words.length > 0) {
                  console.log(`[LOCAL_OCR] HOCR fallback: ${words.length} words extracted.`);
                }
              } catch (e) {
                console.warn('[LOCAL_OCR] HOCR parse failed:', e);
              }
            }

            const lines: OCRLine[] = (data.lines || []).map((l: any, idx: number) => ({
              id: `line_${idx}`,
              text: l.text,
              words: (l.words || []).map((w: any) => ({
                text: w.text,
                x: w.bbox.x0,
                y: w.bbox.y0,
                width: w.bbox.x1 - w.bbox.x0,
                height: w.bbox.y1 - w.bbox.y0,
                confidence: w.confidence
              })),
              bounds: {
                x: l.bbox.x0,
                y: l.bbox.y0,
                width: l.bbox.x1 - l.bbox.x0,
                height: l.bbox.y1 - l.bbox.y0
              }
            }));

            clearTimeout(timeoutId);
            this.releaseWorker(worker);
            resolve({
              text: data.text || '',
              words,
              lines,
              confidence: data.confidence
            });
          } catch (err) {
            console.error('[LOCAL_OCR_FAIL] Tesseract error:', err);
            clearTimeout(timeoutId);
            this.releaseWorker(worker);
            resolve({ text: '', words: [], lines: [], confidence: 0 });
          }
        })();
      });
    } catch (e) {
      this.releaseWorker(worker);
      return { text: '', words: [], lines: [], confidence: 0 };
    }
  }

  public async terminate() {
    for (const worker of this.pool) {
      await worker.terminate();
    }
    this.pool = [];
    this.busyWorkers.clear();
    this.queue = [];
  }
}
