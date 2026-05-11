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
    grayscale?: boolean
  }) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Pass 1: Standard
    // Pass 2: High Contrast
    // Pass 3: Extreme Thresholding
    const threshold = options.pass === 1 ? 145 : (options.pass === 2 ? 130 : 175);
    const contrastFactor = options.contrast || (options.pass >= 2 ? 1.7 : 1.3);

    for (let i = 0; i < data.length; i += 4) {
      // Grayscale with weighted luminance
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
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
