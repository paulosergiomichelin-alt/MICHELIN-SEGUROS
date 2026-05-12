/**
 * OCRPreprocessService.ts
 * Enterprise-grade image preprocessing for OCR stabilization.
 * Implements grayscale, contrast, sharpen, and adaptive thresholding.
 */
export class OCRPreprocessService {
  /**
   * Main entry point for preprocessing a canvas.
   */
  public static process(ctx: CanvasRenderingContext2D, width: number, height: number, options: {
    pass: number,
    sharpen?: boolean,
    contrast?: number,
    grayscale?: boolean,
    desaturate?: boolean,  // Remove colored pixels (for security backgrounds like CNH-e)
    adaptiveThreshold?: boolean  // Local-window binarization (better than global threshold for uneven backgrounds)
  }) {
    if (options.adaptiveThreshold) {
      // Apply desaturation first (if requested) then adaptive threshold and short-circuit.
      if (options.desaturate) {
        const id = ctx.getImageData(0, 0, width, height);
        const d = id.data;
        const cutoff = options.pass === 3 ? 25 : 40;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (Math.max(r, g, b) - Math.min(r, g, b) > cutoff) {
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = 255;
          }
        }
        ctx.putImageData(id, 0, 0);
      }
      this.applyAdaptiveThreshold(ctx, width, height, options.pass);
      if (options.sharpen) this.applySharpen(ctx, width, height);
      return;
    }
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Pass 1: Standard
    // Pass 2: High Contrast
    // Pass 3: Extreme Thresholding
    const threshold = options.pass === 1 ? 145 : (options.pass === 2 ? 130 : 175);
    const contrastFactor = options.contrast || (options.pass >= 2 ? 1.7 : 1.3);
    // Saturation cutoff: pixels with R/G/B variance above this are considered "colored" (background)
    const satCutoff = options.pass === 3 ? 25 : 40;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Desaturation filter: if pixel is colored (high R/G/B variance), kill it (white)
      // This removes the colored security pattern from CNH-e while preserving black text
      if (options.desaturate) {
        const maxCh = Math.max(r, g, b);
        const minCh = Math.min(r, g, b);
        if (maxCh - minCh > satCutoff) {
          data[i] = data[i + 1] = data[i + 2] = 255;
          data[i + 3] = 255;
          continue;
        }
      }

      // Grayscale with weighted luminance
      let val = (0.299 * r) + (0.587 * g) + (0.114 * b);

      // Simple Linear Contrast
      val = (contrastFactor * (val - 128)) + 128;

      // Thresholding (Binarization)
      const finalVal = val < threshold ? 0 : 255;

      data[i] = data[i + 1] = data[i + 2] = finalVal;
      data[i + 3] = 255; // Opaque
    }

    ctx.putImageData(imageData, 0, 0);

    if (options.sharpen) {
      this.applySharpen(ctx, width, height);
    }
  }

  /**
   * Adaptive thresholding (Gaussian-style) using a local sliding window.
   * Each pixel is compared to the mean of its neighbors minus a bias.
   * Removes uneven backgrounds (watermarks, security patterns) that defeat global threshold.
   */
  private static applyAdaptiveThreshold(ctx: CanvasRenderingContext2D, w: number, h: number, pass: number) {
    const src = ctx.getImageData(0, 0, w, h);
    const data = src.data;
    // Convert to grayscale luminance array first
    const lum = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      lum[j] = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);
    }

    // Integral image for O(1) box-mean computation
    const integral = new Int32Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
      let rowSum = 0;
      for (let x = 1; x <= w; x++) {
        rowSum += lum[(y - 1) * w + (x - 1)];
        integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + rowSum;
      }
    }

    // Window size relative to image dimensions; small enough to follow shading, large enough to ignore single strokes
    const winSize = Math.max(15, Math.floor(Math.min(w, h) / 25)) | 1; // odd
    const half = (winSize - 1) / 2;
    const bias = pass === 3 ? 18 : 12; // higher bias = more aggressive (more white)

    const out = ctx.createImageData(w, h);
    const od = out.data;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(h - 1, y + half);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half);
        const x1 = Math.min(w - 1, x + half);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum =
          integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
          integral[y0 * (w + 1) + (x1 + 1)] -
          integral[(y1 + 1) * (w + 1) + x0] +
          integral[y0 * (w + 1) + x0];
        const mean = sum / area;
        const v = lum[y * w + x];
        const final = v < mean - bias ? 0 : 255;
        const idx = (y * w + x) * 4;
        od[idx] = od[idx + 1] = od[idx + 2] = final;
        od[idx + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  /**
   * Applies a basic sharpen convolution kernel.
   */
  private static applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const weights = [
       0, -1,  0,
      -1,  5, -1,
       0, -1,  0
    ];
    this.convolute(ctx, w, h, weights);
  }

  private static convolute(ctx: CanvasRenderingContext2D, w: number, h: number, weights: number[]) {
    const side = Math.round(Math.sqrt(weights.length));
    const halfSide = Math.floor(side / 2);
    const src = ctx.getImageData(0, 0, w, h).data;
    const output = ctx.createImageData(w, h);
    const dst = output.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sy = y;
        const sx = x;
        const dstOff = (y * w + x) * 4;
        let r = 0, g = 0, b = 0;

        for (let cy = 0; cy < side; cy++) {
          for (let cx = 0; cx < side; cx++) {
            const scy = sy + cy - halfSide;
            const scx = sx + cx - halfSide;
            if (scy >= 0 && scy < h && scx >= 0 && scx < w) {
              const srcOff = (scy * w + scx) * 4;
              const wt = weights[cy * side + cx];
              r += src[srcOff] * wt;
              g += src[srcOff + 1] * wt;
              b += src[srcOff + 2] * wt;
            }
          }
        }
        dst[dstOff] = r;
        dst[dstOff + 1] = g;
        dst[dstOff + 2] = b;
        dst[dstOff + 3] = 255;
      }
    }
    ctx.putImageData(output, 0, 0);
  }
}
