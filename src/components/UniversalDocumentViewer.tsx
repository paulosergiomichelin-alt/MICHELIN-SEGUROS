/**
 * UniversalDocumentViewer.tsx
 * Deterministic single-instance document viewer for all CRM documents.
 * Handles Blobs, Storage Paths, and Remote URLs using a unified PDF.js strategy.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Download, ZoomIn, ZoomOut, RotateCw, 
  ChevronLeft, ChevronRight, FileText, 
  ExternalLink, Maximize2, AlertCircle, Loader2
} from 'lucide-react';
import { PDFViewer } from './PDFViewer';
import { cn } from '../lib/utils';
import { StorageService } from '../services/StorageService';

interface UniversalDocumentViewerProps {
  url?: string;
  storagePath?: string;
  type?: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (data: any) => void;
  data?: any; // Extraction data for validation UI
  debug?: {
    chars?: number;
    score?: number;
    time?: number;
    resolution?: string;
    isVisual?: boolean;
    scale?: number;
    regions?: Record<string, string>;
    regionImages?: Record<string, string>;
  };
}

export const UniversalDocumentViewer: React.FC<UniversalDocumentViewerProps> = ({
  url,
  storagePath,
  type,
  title,
  isOpen,
  onClose,
  onConfirm,
  data,
  debug
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renderLockRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Global Blob Cache for the current session to prevent redundant storage hits
  const blobCacheRef = useRef<Map<string, string>>(new Map());

  // Resolution Logic
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      // Defer state updates to avoid synchronous setState in effect linter error
      Promise.resolve().then(() => {
        setResolvedUrl(null);
        setError(null);
      });
      renderLockRef.current = null;
      return;
    }

    const resolveSource = async () => {
      const sessionKey = url || storagePath || 'unknown';
      if (renderLockRef.current === sessionKey) return;
      renderLockRef.current = sessionKey;

      // Check Cache
      if (storagePath && blobCacheRef.current.has(storagePath)) {
        const cachedUrl = blobCacheRef.current.get(storagePath)!;
        setResolvedUrl(cachedUrl);
        setLoading(false);
        console.log(`[VIEWER_CACHE_HIT] Using existing blob for: ${storagePath}`);
        return;
      }

      setLoading(true);
      setError(null);
      
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      try {
        if (url?.startsWith('blob:')) {
          setResolvedUrl(url);
          console.log(`[DOCUMENT_RENDER_SUCCESS] Resource: BLOB`);
        } else if (storagePath) {
          console.log(`[STORAGE_FETCH_START] Path: ${storagePath}`);
          // StorageService.getFileUrl uses Firebase SDK, which is generally fast but we should guard it
          const downloadUrl = await StorageService.getFileUrl(storagePath);
          blobCacheRef.current.set(storagePath, downloadUrl);
          setResolvedUrl(downloadUrl);
          console.log(`[STORAGE_FETCH_SUCCESS] Resource: ${downloadUrl.substring(0, 50)}...`);
        } else if (url) {
          setResolvedUrl(url);
          console.log(`[REMOTE_FETCH_DIRECT] Resource: ${url.substring(0, 50)}...`);
        } else {
          throw new Error('Nenhuma fonte de documento fornecida.');
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('[DOCUMENT_RENDER_FAILED]', err);
        setError(err.message || 'Falha ao carregar documento.');
      } finally {
        setLoading(false);
      }
    };

    resolveSource();

    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [isOpen, url, storagePath]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-md"
      >
        <div className="relative w-full h-full max-w-7xl flex flex-col bg-[#1A1A1A] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/20">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                type === 'cnh' ? "bg-emerald-500/10 text-emerald-500" :
                type === 'crv' ? "bg-amber-500/10 text-amber-500" :
                type === 'policy' ? "bg-blue-500/10 text-blue-500" :
                type === 'COTACAO' ? "bg-purple-500/10 text-purple-500" :
                "bg-[#D4A854]/10 text-[#D4A854]"
              )}>
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-white font-medium">{title || 'Visualizador de Documento'}</h3>
                <p className="text-xs text-white/40 uppercase tracking-wider">{type || 'PDF'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {resolvedUrl && (
                <a 
                  href={resolvedUrl} 
                  download 
                  className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </a>
              )}
              <button 
                onClick={onClose}
                className="p-2 text-white/60 hover:text-white hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Document Viewer (70% or full) */}
            <div className={cn(
              "flex-1 relative bg-[#121212] overflow-auto",
              onConfirm && "md:border-r border-white/5"
            )}>
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/40">
                  <Loader2 className="w-8 h-8 animate-spin text-[#D4A854]" />
                  <p className="text-sm animate-pulse">Carregando visualizador seguro...</p>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <div className="p-4 bg-red-500/10 rounded-full mb-4">
                    <AlertCircle className="w-12 h-12 text-red-500" />
                  </div>
                  <h4 className="text-white font-medium mb-2">Erro ao carregar documento</h4>
                  <p className="text-white/60 text-sm max-w-md mb-6">{error}</p>
                  <button 
                    onClick={onClose}
                    className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {resolvedUrl && !loading && !error && (
                <div className="w-full h-full p-4 overflow-auto scrollbar-hide">
                   <div className="max-w-4xl mx-auto rounded-lg overflow-hidden shadow-2xl">
                     <PDFViewer url={resolvedUrl} storagePath={storagePath} title={title} />
                   </div>
                </div>
              )}
            </div>

            {/* Validation Panel (30%) - Visible only if data & onConfirm provided */}
            {onConfirm && data && (
              <div className="w-full md:w-96 bg-black/40 flex flex-col overflow-hidden">
                <div className="p-6 overflow-y-auto flex-1 space-y-6 scrollbar-hide">
                  <header>
                    <h4 className="text-white font-semibold flex items-center gap-2">
                       <Maximize2 className="w-4 h-4 text-[#D4A854]" />
                       Validar Extração Técnica
                    </h4>
                    <p className="text-xs text-white/40 mt-1">
                      Confirme se os dados extraídos pelo pipeline determinístico estão corretos.
                    </p>
                  </header>

                  <div className="space-y-4">
                    {Object.entries(data).map(([key, value]: any) => {
                      if (key.startsWith('_')) return null;
                      
                      const fieldLabels: any = {
                        name: 'Nome Completo',
                        insuredName: 'Nome do Segurado',
                        cpf: 'CPF',
                        insuredCpf: 'CPF do Segurado',
                        birthDate: 'Data de Nascimento',
                        licenseExpiry: 'Validade CNH',
                        licenseCategory: 'Categoria',
                        plate: 'Placa',
                        chassis: 'Chassi',
                        renavam: 'RENAVAM',
                        brandModel: 'Marca/Modelo',
                        insuranceExpiry: 'Fim da Vigência',
                        insurer: 'Seguradora',
                        brokerName: 'Corretora',
                        brokerSusep: 'SUSEP Corretora',
                        financialInstitution: 'Instituição Financeira',
                        restrictionType: 'Tipo de Restrição',
                        fiduciaryAlienation: 'Alienação Fiduciária'
                      };

                      if (key === 'broker' && typeof value === 'object' && value !== null) {
                         return (
                           <div key={key} className="space-y-3 p-3 bg-[#D4A85405] border border-[#D4A85410] rounded-2xl">
                             <div className="space-y-1.5">
                               <label className="text-[9px] uppercase tracking-wider text-[#D4A854] font-black ml-1">Corretora (Nome)</label>
                               <input 
                                 type="text" 
                                 defaultValue={value.name || ''} 
                                 className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] font-medium focus:border-[#D4A854]/50 outline-none transition-all" 
                               />
                             </div>
                             <div className="space-y-1.5">
                               <label className="text-[9px] uppercase tracking-wider text-[#D4A854] font-black ml-1">SUSEP</label>
                               <input 
                                 type="text" 
                                 defaultValue={value.susep || ''} 
                                 className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] font-medium focus:border-[#D4A854]/50 outline-none transition-all" 
                               />
                             </div>
                           </div>
                         );
                      }

                      return (
                        <div key={key} className="space-y-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-[#D4A854] font-black ml-1">
                            {fieldLabels[key] || key}
                          </label>
                          <div className="relative group">
                            <input 
                              type="text"
                              defaultValue={value || ''}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[12px] font-medium focus:border-[#D4A854]/50 focus:ring-1 focus:ring-[#D4A854]/50 outline-none transition-all"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#D4A854] opacity-0 group-focus-within:opacity-100 transition-opacity shadow-[0_0_8px_#D4A854]" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Technical Debug Info */}
                  {debug && (
                    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                      <div className="flex items-center gap-2">
                         <div className="w-1 h-1 rounded-full bg-[#D4A854]" />
                         <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Painel de Controle OCR</h3>
                      </div>
                      
                      {/* Regional Debug Visuals */}
                      {debug.regions && debug.regionImages && (
                        <div className="space-y-4">
                          <p className="text-[9px] font-black text-[#D4A854] uppercase tracking-[0.2em] border-b border-[#D4A85420] pb-2">Análise Regional Determinística</p>
                          <div className="space-y-3">
                            {Object.entries(debug.regions).map(([key, val]: [string, any]) => {
                              const metrics = (debug as any).metrics?.[key];
                              return (
                                <div key={key} className="bg-white/[0.04] rounded-2xl border border-white/5 overflow-hidden transition-all hover:border-[#D4A85420] group">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-3 p-3 bg-black/40">
                                      <div className="w-16 h-10 bg-black rounded-lg overflow-hidden flex-shrink-0 border border-white/10 shadow-inner group-hover:border-[#D4A85440] transition-colors">
                                        {debug.regionImages?.[key] ? (
                                          <img src={debug.regionImages?.[key]} className="w-full h-full object-contain mix-blend-screen" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <AlertCircle className="w-4 h-4 text-white/20" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[8px] font-black text-[#8E8E93] uppercase tracking-tighter">{key}</p>
                                          {metrics && (
                                            <span className="text-[7px] font-bold text-emerald-500/80 bg-emerald-500/5 px-1.5 rounded uppercase">Pass {metrics.pass}</span>
                                          )}
                                        </div>
                                        <p className={cn(
                                          "text-[10px] font-bold truncate mt-0.5",
                                          val ? "text-[#D4A854]" : "text-red-500 italic"
                                        )}>
                                          {val ? `"${val}"` : '[Falha na Extração]'}
                                        </p>
                                      </div>
                                    </div>
                                    {metrics && (
                                      <div className="flex items-center gap-4 px-3 py-1.5 bg-white/[0.02] border-t border-white/[0.03]">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[7px] text-white/20 uppercase font-bold">Tempo:</span>
                                            <span className="text-[8px] text-white/60 font-mono">{metrics.time}ms</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-[7px] text-white/20 uppercase font-bold">Conf:</span>
                                            <span className="text-[8px] text-white/60 font-mono">{(metrics.confidence * 100 || 100).toFixed(0)}%</span>
                                          </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                           <p className="text-[8px] font-black text-[#8E8E93] uppercase">Pipeline</p>
                        <p className="text-[10px] font-bold text-white mt-1 leading-none">{debug.isVisual ? 'PROCESSAMENTO REGIONAL' : 'NATIVO (TEXTO)'}</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-[8px] font-black text-[#8E8E93] uppercase">Tempo Proc.</p>
                        <p className="text-[10px] font-bold text-white mt-1 leading-none">{(Number(debug.time) / 1000).toFixed(2)}s</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-[8px] font-black text-[#8E8E93] uppercase">Volume</p>
                        <p className="text-[10px] font-bold text-white mt-1 leading-none">{debug.chars} chars</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-[8px] font-black text-[#8E8E93] uppercase">Status</p>
                        <p className="text-[10px] font-bold text-[#D4A854] mt-1 leading-none">{(debug.chars ?? 0) > 10 ? 'ESTÁVEL' : 'DIVERGENTE'}</p>
                      </div>
                        {debug.resolution && (
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5 col-span-2 flex items-center justify-between">
                            <p className="text-[8px] font-black text-[#8E8E93] uppercase">Resolução / Escala</p>
                            <p className="text-[10px] font-bold text-white leading-none">{debug.resolution} @ {debug.scale}x</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-white/5 bg-black/40 flex flex-col gap-3">
                  <button 
                    onClick={() => onConfirm(data)}
                    className="w-full bg-[#D4A854] hover:bg-[#C2984B] text-black font-bold py-3.5 rounded-xl transition-all shadow-lg active:scale-[0.98]"
                  >
                    Confirmar e Importar
                  </button>
                  <button 
                    onClick={onClose}
                    className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-all"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
