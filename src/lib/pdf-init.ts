import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker for pdfjs globally
if (typeof window !== 'undefined') {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
    console.log('[PDF_WORKER_READY] Global worker initialized from pdf-init.ts');
  }
}

export { pdfjsLib };
