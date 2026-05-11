/**
 * UniversalDocumentViewer.tsx
 * Deterministic single-instance document viewer for all CRM documents.
 * Handles Blobs, Storage Paths, and Remote URLs using a unified PDF.js strategy.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Download,
  FileText,
  Maximize2, AlertCircle, Loader2
} from 'lucide-react';
import { PDFViewer } from './PDFViewer';
import { cn } from '../lib/utils';
import { StorageService } from '../services/StorageService';
import { isValidCPF, isValidDate, isValidName } from '../lib/lead-utils';

// ─── Field schema definitions ────────────────────────────────────────────────

interface FieldSchema {
  key: string;
  label: string;
  validator?: 'cpf' | 'plate' | 'chassis' | 'date' | 'name' | 'text';
  required?: boolean;
  section?: true;
}

const DOCUMENT_SCHEMAS: Record<string, FieldSchema[]> = {
  cnh: [
    { key: 'name',      label: 'Nome Completo',       validator: 'name',  required: true  },
    { key: 'cpf',       label: 'CPF',                 validator: 'cpf',   required: true  },
    { key: 'birthDate', label: 'Data de Nascimento',  validator: 'date',  required: true  },
  ],
  crv: [
    { key: 'ownerName',    label: 'Nome do Proprietário', validator: 'name',    required: true  },
    { key: 'ownerCpfCnpj', label: 'CPF / CNPJ',           validator: 'cpf',     required: true  },
    { key: 'plate',        label: 'Placa',                 validator: 'plate',   required: true  },
    { key: 'chassis',      label: 'Chassi',                validator: 'chassis', required: true  },
  ],
  policy: [
    { key: 'insuredName', label: 'Nome Segurado',         validator: 'name',  required: true  },
    { key: 'insuredCpf',  label: 'CPF / CNPJ Segurado',  validator: 'cpf',   required: true  },
    { key: 'policyNumber',label: 'Nº da Apólice',         validator: 'text',  required: true  },
    { key: 'insurer',     label: 'Seguradora',            validator: 'text',  required: false },
    { key: 'brokerName',  label: 'Corretor',              validator: 'text',  required: false },
    { key: 'plate',       label: 'Placa',                 validator: 'plate', required: false },
    { key: 'chassis',     label: 'Chassi',                validator: 'chassis', required: false },
    { key: 'cepPernoite', label: 'CEP',                   validator: 'text',  required: false },
    { key: 'birthDate',   label: 'Data de Nascimento',    validator: 'date',  required: false },
    { key: '_ownerSection', label: 'DADOS DO PROPRIETÁRIO', section: true },
    { key: 'ownerName',    label: 'Nome do Proprietário', validator: 'name', required: false },
    { key: 'ownerCpfCnpj', label: 'CPF / CNPJ Proprietário', validator: 'cpf', required: false },
  ],
};

type ValidationStatus = 'valid' | 'invalid' | 'empty';

function validateField(validator: string | undefined, value: string): ValidationStatus {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'empty';
  switch (validator) {
    case 'cpf': {
      const d = trimmed.replace(/\D/g, '');
      if (d.length === 11) return isValidCPF(trimmed) ? 'valid' : 'invalid';
      if (d.length === 14) return 'valid';
      return 'invalid';
    }
    case 'plate':
      return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(trimmed.replace(/[-\s]/g, '').toUpperCase())
        ? 'valid' : 'invalid';
    case 'chassis':
      return trimmed.replace(/\s/g, '').length >= 17 ? 'valid' : 'invalid';
    case 'date':
      return isValidDate(trimmed) ? 'valid' : 'invalid';
    case 'name':
      return isValidName(trimmed) ? 'valid' : 'invalid';
    default:
      return trimmed.length > 0 ? 'valid' : 'empty';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface UniversalDocumentViewerProps {
  url?: string;
  storagePath?: string;
  type?: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (data: any) => void;
  data?: any;
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
  const [localData, setLocalData] = useState<Record<string, string>>({});
  const renderLockRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const blobCacheRef = useRef<Map<string, string>>(new Map());

  // Seed localData whenever the extraction data changes
  useEffect(() => {
    if (!data) return;
    const init: Record<string, string> = {};
    Object.keys(data).forEach(k => {
      if (!k.startsWith('_')) init[k] = String(data[k] ?? '');
    });
    setLocalData(init);
  }, [data]);

  // URL Resolution
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) abortControllerRef.current.abort();
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

      if (storagePath && blobCacheRef.current.has(storagePath)) {
        setResolvedUrl(blobCacheRef.current.get(storagePath)!);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      try {
        if (url?.startsWith('blob:')) {
          setResolvedUrl(url);
        } else if (storagePath) {
          const downloadUrl = await StorageService.getFileUrl(storagePath);
          blobCacheRef.current.set(storagePath, downloadUrl);
          setResolvedUrl(downloadUrl);
        } else if (url) {
          setResolvedUrl(url);
        } else {
          throw new Error('Nenhuma fonte de documento fornecida.');
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Falha ao carregar documento.');
      } finally {
        setLoading(false);
      }
    };

    resolveSource();
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [isOpen, url, storagePath]);

  if (!isOpen) return null;

  const docType = (type || '').toLowerCase();
  const schema = DOCUMENT_SCHEMAS[docType];

  const handleFieldChange = (key: string, value: string) => {
    setLocalData(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    if (!onConfirm) return;
    onConfirm({ ...data, ...localData });
  };

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
                docType === 'cnh'    ? "bg-emerald-500/10 text-emerald-500" :
                docType === 'crv'    ? "bg-amber-500/10 text-amber-500" :
                docType === 'policy' ? "bg-blue-500/10 text-blue-500" :
                type === 'COTACAO'   ? "bg-purple-500/10 text-purple-500" :
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

          {/* Main Content */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

            {/* Document Viewer */}
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
                  <button onClick={onClose} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all">
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

            {/* Validation Panel */}
            {onConfirm && data && (
              <div className="w-full md:w-96 bg-black/40 flex flex-col overflow-hidden">
                <div className="p-6 overflow-y-auto flex-1 space-y-6 scrollbar-hide">
                  <header>
                    <h4 className="text-white font-semibold flex items-center gap-2">
                      <Maximize2 className="w-4 h-4 text-[#D4A854]" />
                      Validar Extração Técnica
                    </h4>
                    <p className="text-xs text-white/40 mt-1">
                      Confirme os dados extraídos pelo pipeline determinístico. Edite se necessário.
                    </p>
                  </header>

                  {/* Schema-driven fields */}
                  {schema ? (
                    <div className="space-y-4">
                      {schema.map((field) => {
                        // Section separator
                        if (field.section) {
                          return (
                            <div key={field.key} className="flex items-center gap-3 pt-2">
                              <div className="flex-1 h-px bg-[#D4A85430]" />
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D4A854]">
                                {field.label}
                              </span>
                              <div className="flex-1 h-px bg-[#D4A85430]" />
                            </div>
                          );
                        }

                        const rawValue = localData[field.key] ?? '';
                        const status = validateField(field.validator, rawValue);
                        const isEmpty = !rawValue.trim();

                        return (
                          <div key={field.key} className="space-y-1.5">
                            <div className="flex items-center justify-between ml-1">
                              <label className="text-[10px] uppercase tracking-wider text-[#D4A854] font-black">
                                {field.label}
                              </label>
                              <span className={cn(
                                "text-[8px] font-bold uppercase",
                                status === 'valid'   ? "text-emerald-500" :
                                status === 'invalid' ? "text-amber-400" :
                                field.required       ? "text-red-400" : "text-white/20"
                              )}>
                                {status === 'valid'   ? '✓ ok' :
                                 status === 'invalid' ? '⚠ formato' :
                                 field.required       ? '● obrigatório' : '—'}
                              </span>
                            </div>
                            <div className="relative group">
                              <input
                                type="text"
                                value={rawValue}
                                placeholder="Campo não identificado"
                                onChange={e => handleFieldChange(field.key, e.target.value)}
                                className={cn(
                                  "w-full bg-white/5 border rounded-xl px-4 py-3 text-white text-[12px] font-medium outline-none transition-all focus:ring-1 placeholder:text-white/20",
                                  isEmpty && field.required
                                    ? "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20"
                                    : status === 'invalid'
                                    ? "border-amber-500/40 focus:border-amber-500/60 focus:ring-amber-500/20"
                                    : "border-white/10 focus:border-[#D4A854]/50 focus:ring-[#D4A854]/20"
                                )}
                              />
                              {!isEmpty && (
                                <div className={cn(
                                  "absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full",
                                  status === 'valid'   ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" :
                                  status === 'invalid' ? "bg-amber-400 shadow-[0_0_6px_#fbbf24]" :
                                  "bg-white/20"
                                )} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Fallback: dynamic rendering for COTACAO and unknown types */
                    <div className="space-y-4">
                      {Object.entries(data).map(([key, value]: any) => {
                        if (key.startsWith('_')) return null;
                        const fieldLabels: Record<string, string> = {
                          name: 'Nome Completo', insuredName: 'Nome do Segurado',
                          cpf: 'CPF', insuredCpf: 'CPF do Segurado',
                          birthDate: 'Data de Nascimento', licenseExpiry: 'Validade CNH',
                          licenseCategory: 'Categoria', plate: 'Placa', chassis: 'Chassi',
                          renavam: 'RENAVAM', brandModel: 'Marca/Modelo',
                          insuranceExpiry: 'Fim da Vigência', insurer: 'Seguradora',
                          brokerName: 'Corretora', brokerSusep: 'SUSEP Corretora',
                          policyNumber: 'Nº Apólice',
                        };
                        return (
                          <div key={key} className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider text-[#D4A854] font-black ml-1">
                              {fieldLabels[key] || key}
                            </label>
                            <div className="relative group">
                              <input
                                type="text"
                                value={localData[key] ?? String(value ?? '')}
                                onChange={e => handleFieldChange(key, e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[12px] font-medium focus:border-[#D4A854]/50 focus:ring-1 focus:ring-[#D4A854]/20 outline-none transition-all"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#D4A854] opacity-0 group-focus-within:opacity-100 transition-opacity shadow-[0_0_8px_#D4A854]" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* OCR Debug Panel */}
                  {debug && (
                    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-[#D4A854]" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Painel de Controle OCR</h3>
                      </div>

                      {debug.regions && debug.regionImages && (
                        <div className="space-y-4">
                          <p className="text-[9px] font-black text-[#D4A854] uppercase tracking-[0.2em] border-b border-[#D4A85420] pb-2">
                            Análise Regional Determinística
                          </p>
                          <div className="space-y-3">
                            {Object.entries(debug.regions).map(([key, val]: [string, any]) => {
                              const metrics = (debug as any).metrics?.[key];
                              return (
                                <div key={key} className="bg-white/[0.04] rounded-2xl border border-white/5 overflow-hidden hover:border-[#D4A85420] group transition-all">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-3 p-3 bg-black/40">
                                      <div className="w-16 h-10 bg-black rounded-lg overflow-hidden flex-shrink-0 border border-white/10 shadow-inner group-hover:border-[#D4A85440] transition-colors">
                                        {debug.regionImages?.[key] ? (
                                          <img src={debug.regionImages[key]} className="w-full h-full object-contain mix-blend-screen" />
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
                                            <span className="text-[7px] font-bold text-emerald-500/80 bg-emerald-500/5 px-1.5 rounded uppercase">
                                              Pass {metrics.pass}
                                            </span>
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
                          <p className="text-[10px] font-bold text-white mt-1 leading-none">
                            {debug.isVisual ? 'PROCESSAMENTO REGIONAL' : 'NATIVO (TEXTO)'}
                          </p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-[8px] font-black text-[#8E8E93] uppercase">Tempo Proc.</p>
                          <p className="text-[10px] font-bold text-white mt-1 leading-none">
                            {(Number(debug.time) / 1000).toFixed(2)}s
                          </p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-[8px] font-black text-[#8E8E93] uppercase">Volume</p>
                          <p className="text-[10px] font-bold text-white mt-1 leading-none">{debug.chars} chars</p>
                        </div>
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-[8px] font-black text-[#8E8E93] uppercase">Status</p>
                          <p className="text-[10px] font-bold text-[#D4A854] mt-1 leading-none">
                            {(debug.chars ?? 0) > 10 ? 'ESTÁVEL' : 'DIVERGENTE'}
                          </p>
                        </div>
                        {debug.resolution && (
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5 col-span-2 flex items-center justify-between">
                            <p className="text-[8px] font-black text-[#8E8E93] uppercase">Resolução / Escala</p>
                            <p className="text-[10px] font-bold text-white leading-none">
                              {debug.resolution} @ {debug.scale}x
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-white/5 bg-black/40 flex flex-col gap-3">
                  <button
                    onClick={handleConfirm}
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
