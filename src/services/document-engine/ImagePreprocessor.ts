/**
 * ImagePreprocessor.ts
 *
 * Light, OCR-friendly image preprocessing using canvas only.
 * Used as the input pipeline before sending an image to the AI OCR provider.
 *
 * Steps applied (in order):
 *   1. Resize proportionally so the larger side <= 1200px.
 *   2. Convert to grayscale with weighted luminance.
 *   3. Normalize contrast (linear stretch + soft boost).
 *   4. Drop transparency, fill white background.
 *   5. Encode as JPEG q80.
 *
 * Intentionally avoids: morphology, adaptive threshold, heavy denoise — the AI
 * OCR model (Qianfan) handles those at the model level.
 */

export interface PreprocessedImage {
  base64: string; // Data URL (image/jpeg;base64,...)
  rawBase64: string; // Just the base64 payload (no prefix)
  width: number;
  height: number;
  bytes: number;
}

const DEFAULT_MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export interface PreprocessOptions {
  maxDimension?: number;
}

export class ImagePreprocessor {
  /** Prepare a canvas for AI OCR. Returns a JPEG base64 string with size & dim metadata. */
  public static async fromCanvas(source: HTMLCanvasElement, options: PreprocessOptions = {}): Promise<PreprocessedImage> {
    const maxDim = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
    const { width: dstW, height: dstH } = this.fitToMax(source.width, source.height, maxDim);
    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // White background to drop any transparency
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, dstW, dstH);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, dstW, dstH);

    this.grayscaleAndContrast(ctx, dstW, dstH);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const rawBase64 = dataUrl.split(',')[1] || '';
    // Approximate byte size: base64 is 4/3 of binary
    const bytes = Math.floor((rawBase64.length * 3) / 4);
    return { base64: dataUrl, rawBase64, width: dstW, height: dstH, bytes };
  }

  /** Load an image from a URL or blob and run the pipeline. */
  public static async fromImageUrl(url: string): Promise<PreprocessedImage> {
    const img = await this.loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return this.fromCanvas(canvas);
  }

  /** Convenience hash for cache keys. SHA-256 hex of the base64 payload. */
  public static async hash(rawBase64: string): Promise<string> {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(rawBase64));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private static fitToMax(w: number, h: number, max: number): { width: number; height: number } {
    if (w <= max && h <= max) return { width: w, height: h };
    const ratio = w / h;
    if (w >= h) return { width: max, height: Math.round(max / ratio) };
    return { width: Math.round(max * ratio), height: max };
  }

  private static grayscaleAndContrast(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;

    // First pass: grayscale + collect min/max for contrast stretch
    let lo = 255, hi = 0;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
      gray[j] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = Math.max(1, hi - lo);

    // Second pass: linear stretch [lo, hi] -> [0, 255] then mild S-curve
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let v = ((gray[j] - lo) / span) * 255;
      // Mild contrast boost: factor 1.15 around 128
      v = 1.15 * (v - 128) + 128;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
  }

  private static loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
      img.src = url;
    });
  }
}
