import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  ExternalLink, 
  Download, 
  Maximize2, 
  AlertCircle, 
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { PDFResourceManager } from '../services/PDFResourceManager';

// pdfjs-dist requires a worker to be loaded. 
interface PDFViewerProps {
  url: string;
  storagePath?: string;
  title?: string;
  onClose?: () => void;
}

type ViewerStrategy = 'pdfjs' | 'iframe';

export const PDFViewer = React.memo<PDFViewerProps>(({ url, storagePath, title = 'Documento' }) => {
  const [strategy, setStrategy] = useState<ViewerStrategy>('pdfjs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const isRenderingRef = useRef<boolean>(false);
  const loadingLockRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isImage = url.startsWith('data:image/') || url.match(/\.(jpeg|jpg|gif|png|webp|svg)/i) || url.includes('image%2F') || url.includes('image/');

  const loadPDFJS = useCallback(async () => {
    if (!url && !storagePath) return;

    // Stable session key to prevent redundant triggers
    const sessionKey = `${storagePath || url}-${pageNumber}-${scale}`;
    if (loadingLockRef.current === sessionKey) return;
    loadingLockRef.current = sessionKey;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    setError(null);

    try {
      console.log(`[PDF_RENDER_START] Resource:`, { url });
      
      let pdf;
      const resourceId = storagePath || url;

      if (url.startsWith('blob:') || url.startsWith('data:application/pdf')) {
        const response = await fetch(url, { signal });
        const buffer = await response.arrayBuffer();
        pdf = await PDFResourceManager.getDocument(new Uint8Array(buffer), resourceId);
      } else if (storagePath) {
        const blob = await getBlob(ref(storage, storagePath));
        const buffer = await blob.arrayBuffer();
        pdf = await PDFResourceManager.getDocument(new Uint8Array(buffer), resourceId);
      } else {
        // Direct URL fallback
        pdf = await PDFResourceManager.getDocument(url, resourceId);
      }
      
      if (signal.aborted) return;

      setNumPages(pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      
      const canvas = canvasRef.current;
      if (!canvas || signal.aborted) return;
      
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {
          // Ignore cancellation errors
        }
      }

      isRenderingRef.current = true;
      renderTaskRef.current = page.render({
        canvasContext: context,
        viewport: viewport
      });
      
      await renderTaskRef.current.promise;
      isRenderingRef.current = false;
      renderTaskRef.current = null;
      
      console.log(`[PDF_PAGE_RENDERED] Page ${pageNumber}`);
      setLoading(false);
    } catch (err: any) {
      isRenderingRef.current = false;
      renderTaskRef.current = null;
      if (err.name === 'AbortError' || signal.aborted) {
        console.log('[PDF_RENDER_ABORTED_EXPECTED]');
        return;
      }
      console.error('[PDF_RENDER_FAILED]', err);
      setStrategy('iframe');
      setLoading(false);
    }
  }, [url, storagePath, pageNumber, scale]);

  useEffect(() => {
    if (!isImage) {
      loadPDFJS();
    } else {
      setLoading(false);
    }
    
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadPDFJS, isImage]);

  const handleOpenNewTab = () => {
    window.open(url, '_blank');
  };

  const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div className="w-full h-full bg-[#121212] flex flex-col overflow-hidden">
      {/* Internal Toolbar (Only for PDF.js) */}
      {strategy === 'pdfjs' && !loading && !error && (
        <div className="bg-black/40 backdrop-blur shadow-sm border-b border-white/5 px-4 py-2 flex items-center justify-center gap-6 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
              disabled={pageNumber <= 1}
              className="p-1 text-white/50 hover:bg-white/10 rounded disabled:opacity-30"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs font-bold text-white/70">
              Página {pageNumber} de {numPages || '?'}
            </span>
            <button 
              onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages || prev))}
              disabled={pageNumber >= (numPages || 1)}
              className="p-1 text-white/50 hover:bg-white/10 rounded disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="w-px h-4 bg-white/10" />

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setScale(prev => Math.max(prev - 0.25, 0.5))}
              className="p-1 text-white/50 hover:bg-white/10 rounded"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-xs font-bold text-white/70 w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button 
              onClick={() => setScale(prev => Math.min(prev + 0.25, 3))}
              className="p-1 text-white/50 hover:bg-white/10 rounded"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-[#1A1A1A] p-4 flex items-start justify-center">
        {isImage ? (
          <img 
            src={url} 
            alt={title} 
            className="max-w-full h-auto rounded-lg shadow-2xl" 
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {loading && strategy === 'pdfjs' && (
              <div className="flex flex-col items-center justify-center text-white/40 gap-4 pt-20">
                <Loader2 className="w-12 h-12 animate-spin text-[#D4A854]" />
                <p className="text-sm font-medium animate-pulse">Carregando Documento...</p>
              </div>
            )}

            {strategy === 'pdfjs' && !error && (
              <canvas 
                ref={canvasRef} 
                className={cn("shadow-2xl bg-white max-w-full h-auto", loading ? 'hidden' : 'block')}
              />
            )}

            {strategy === 'iframe' && (
              <iframe 
                src={url.startsWith('blob:') ? url : googleViewerUrl} 
                className="w-full h-[80vh] bg-white rounded-xl border-none shadow-2xl"
                title={title}
              />
            )}
          </div>
        )}

        {error && !isImage && (
          <div className="max-w-md w-full bg-[#1E1E1E] border border-white/10 p-8 rounded-3xl shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-white">Erro na Visualização</h3>
            <p className="text-sm text-white/60">
              {error}
            </p>
            <div className="flex flex-col gap-2 pt-4">
              <button 
                onClick={handleOpenNewTab}
                className="w-full py-3 bg-[#D4A854] text-black rounded-xl font-bold text-sm flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Externamente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// Integration Helper
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
