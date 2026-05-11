import { DocumentMemoryManager } from "./DocumentMemoryManager";

/**
 * PDFRenderService.ts
 * Isolated PDF rendering engine with high-resolution control.
 * Optimized for OCR precision.
 */
export class PDFRenderService {
  private static readonly DEFAULT_DPI = 72;

  /**
   * Renders a PDF page to a high-resolution data URL.
   */
  public static async renderToDataURL(page: any, options: { 
    scale?: number, 
    type?: string 
  } = {}): Promise<{
    url: string;
    width: number;
    height: number;
    scale: number;
  }> {
    // Mandate high-res scales: 5.0 for documents requiring precision (CNH), 4.0 default.
    const scale = options.scale || (options.type === 'cnh' ? 5.0 : 4.0);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: false // Faster rendering for OCR-bound images
    });

    if (!context) throw new Error('PDF_RENDER_CONTEXT_ERROR');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Background should be white for OCR
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    console.log(`[PDF_RENDER] Render Start: ${viewport.width}x${viewport.height}, Scale=${scale}`);

    const renderTask = page.render({
      canvasContext: context,
      viewport: viewport,
      intent: 'display'
    });

    try {
      await renderTask.promise;
      const url = canvas.toDataURL('image/jpeg', 0.95); // JPEG 0.95 balance quality and size
      
      const result = {
        url,
        width: canvas.width,
        height: canvas.height,
        scale
      };

      // Immediate cleanup of canvas CPU/GPU memory
      DocumentMemoryManager.getInstance().cleanupCanvas(canvas);
      
      return result;
    } catch (err) {
      console.error('[PDF_RENDER_FAILED]', err);
      DocumentMemoryManager.getInstance().cleanupCanvas(canvas);
      throw err;
    }
  }

  /**
   * Validates if a page is ready for rendering.
   */
  public static validatePage(page: any): boolean {
    if (!page) return false;
    const view = page.view;
    if (!view || view.length < 4) return false;
    // Basic sanity check: width and height > 0
    return (view[2] - view[0]) > 0 && (view[3] - view[1]) > 0;
  }
}
