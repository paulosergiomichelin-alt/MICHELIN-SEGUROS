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

/**
 * Per-document field schema for the validation panel. Whitelist only the
 * canonical keys so duplicated aliases (nome/name, ownerName/nomeProprietario,
 * alienacao_fiduciaria/fiduciaryAlienation) never render twice.
 */
interface FieldDef { key: string; label: string; type?: 'text' | 'boolean' | 'date'; aliases?: string[]; }

const DOCUMENT_SCHEMAS: Record<string, FieldDef[]> = {
  cnh: [
    { key: 'name', label: 'Nome Completo', aliases: ['nome'] },
    { key: 'cpf', label: 'CPF' },
    { key: 'birthDate', label: 'Data de Nascimento', type: 'date', aliases: ['data_nascimento', 'nascimento'] },
    { key: 'licenseNumber', label: 'Nº Registro', aliases: ['registration', 'registro'] },
    { key: 'licenseExpiry', label: 'Validade CNH', type: 'date', aliases: ['validity', 'validade'] },
    { key: 'licenseCategory', label: 'Categoria', aliases: ['category', 'categoria'] },
    { key: 'rg', label: 'RG', aliases: ['doc_identidade'] },
    { key: 'rgOrgaoEmissor', label: 'Órgão Emissor', aliases: ['orgao_emissor'] }
  ],
  crv: [
    { key: 'name', label: 'Nome do Proprietário', aliases: ['nome', 'ownerName', 'nomeProprietario'] },
    { key: 'cpf', label: 'CPF do Proprietário', aliases: ['ownerCpf', 'cpfProprietario'] },
    { key: 'plate', label: 'Placa', aliases: ['placa'] },
    { key: 'chassi', label: 'Chassi', aliases: ['chassis'] },
    { key: 'renavam', label: 'RENAVAM' },
    { key: 'brandModel', label: 'Marca/Modelo', aliases: ['marca_modelo'] },
    { key: 'category', label: 'Categoria', aliases: ['categoria'] },
    { key: 'modelYear', label: 'Ano Modelo', aliases: ['ano_modelo'] },
    { key: 'fuel', label: 'Combustível', aliases: ['combustivel'] },
    { key: 'fiduciaryAlienation', label: 'Alienação Fiduciária', type: 'boolean', aliases: ['alienacao_fiduciaria', 'alienacaoFiduciaria'] }
  ],
  policy: [
    { key: 'policyNumber', label: 'Nº Apólice', aliases: ['numero_apolice'] },
    { key: 'insurer', label: 'Seguradora', aliases: ['seguradora'] },
    { key: 'brokerName', label: 'Corretora', aliases: ['corretora'] },
    { key: 'brokerSusep', label: 'SUSEP Corretora', aliases: ['corretora_susep'] },
    { key: 'insuredName', label: 'Nome do Segurado', aliases: ['segurado_nome'] },
    { key: 'insuredCpf', label: 'CPF do Segurado', aliases: ['segurado_cpf'] },
    { key: 'plate', label: 'Placa', aliases: ['placa'] },
    { key: 'chassi', label: 'Chassi', aliases: ['chassis'] },
    { key: 'marca', label: 'Marca' },
    { key: 'modelo', label: 'Modelo' },
    { key: 'manufactureYear', label: 'Ano Fabricação', aliases: ['ano_fabricacao'] },
    { key: 'modelYear', label: 'Ano Modelo', aliases: ['ano_modelo'] },
    { key: 'color', label: 'Cor', aliases: ['cor'] },
    { key: 'renavam', label: 'RENAVAM' },
    { key: 'cep', label: 'CEP' },
    { key: 'startDate', label: 'Início Vigência', type: 'date', aliases: ['inicio_vigencia'] },
    { key: 'insuranceExpiry', label: 'Fim da Vigência', type: 'date', aliases: ['fim_vigencia'] },
    { key: 'premioLiquido', label: 'Prêmio Líquido', aliases: ['premio_liquido'] },
    { key: 'premio', label: 'Valor Total', aliases: ['valor_total'] },
    { key: 'commercialUse', label: 'Uso Comercial', type: 'boolean', aliases: ['uso_comercial'] },
    { key: 'fiduciaryAlienation', label: 'Alienação Fiduciária', type: 'boolean', aliases: ['alienacao_fiduciaria'] },
    { key: 'isOwnerDriver', label: 'Proprietário é Condutor', type: 'boolean', aliases: ['proprietario_e_condutor'] },
    { key: 'youngDriver', label: 'Condutor Jovem (<25)', type: 'boolean', aliases: ['condutor_jovem'] },
    { key: 'maritalStatus', label: 'Estado Civil', aliases: ['estado_civil'] }
  ]
};

function pickValue(data: any, def: FieldDef): any {
  if (data == null) return def.type === 'boolean' ? false : '';
  const candidates = [def.key, ...(def.aliases || [])];
  // For boolean fields, the first explicitly-defined value wins (true or false).
  if (def.type === 'boolean') {
    for (const k of candidates) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
    }
    return false;
  }
  // For text fields, skip empty/falsy values
  for (const k of candidates) {
    const v = data[k];
    if (v !== undefined && v !== null && v !== '' && v !== false) return v;
  }
  return '';
}

function coerceBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
  return ['SIM', 'YES', 'TRUE', '1', 'POSSUI', 'CONSTA', 'VERDADEIRO'].includes(s);
}

// `data` é o rascunho local editável (não a prop original) e `onFieldChange`
// escreve cada edição nele — os inputs eram uncontrolled (defaultValue) e o
// botão "Confirmar e Importar" chamava onConfirm(data) com a prop ORIGINAL,
// nunca com o que o usuário tinha acabado de digitar. Qualquer correção manual
// numa extração errada (CPF com um dígito trocado pelo OCR, nome incompleto
// etc.) era silenciosamente descartada e o dado errado ia pro banco mesmo
// assim (achado F-06 da auditoria).
function renderValidationFields(
  type: string | undefined,
  data: any,
  onFieldChange: (key: string, value: string) => void,
) {
  if (!data) return null;
  const t = (type || '').toLowerCase();
  // Normalize 'crlv' → 'crv', 'apolice' → 'policy'
  const schemaKey = t === 'crlv' ? 'crv' : t === 'apolice' ? 'policy' : t;
  const schema = DOCUMENT_SCHEMAS[schemaKey];

  if (!schema) {
    // No schema for this type — fall back to the legacy dynamic rendering
    return Object.entries(data)
      .filter(([k, v]) => !k.startsWith('_') && v !== '' && v != null && typeof v !== 'object')
      .map(([key, value]: any) => (
        <div key={key} className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-gold-deep font-black ml-1">{key}</label>
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onFieldChange(key, e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-[12px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 outline-none transition-all"
          />
        </div>
      ));
  }

  return schema.map((def) => {
    const value = pickValue(data, def);
    if (def.type === 'boolean') {
      const checked = coerceBool(value);
      return (
        <div key={def.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
          <label className="text-[11px] uppercase tracking-wider text-gold-deep font-black">{def.label}</label>
          <span className={cn(
            'px-3 py-1 rounded-md text-[10px] font-black uppercase',
            checked ? 'bg-[#E4F5EA] text-[#1F8A4C]' : 'bg-slate-100 text-slate-400'
          )}>
            {checked ? 'SIM' : 'NÃO'}
          </span>
        </div>
      );
    }
    return (
      <div key={def.key} className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-gold-deep font-black ml-1">{def.label}</label>
        <div className="relative group">
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onFieldChange(def.key, e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-[12px] font-medium focus:border-[#1B4D8F]/60 focus:ring-1 focus:ring-[#1B4D8F]/40 outline-none transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gold-deep opacity-0 group-focus-within:opacity-100 transition-opacity" />
        </div>
      </div>
    );
  });
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

  // Rascunho editável dos campos extraídos — é isto que onConfirm recebe, nunca
  // a prop `data` original (ver comentário em renderValidationFields / F-06).
  const [editedData, setEditedData] = useState<any>(data);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Nova sessão de validação abrindo agora — reseta o rascunho pros valores
      // extraídos originais. Fora desse instante, `data` pode trocar de
      // referência por re-renders do formulário pai sem que isso deva apagar o
      // que o usuário já digitou.
      setEditedData(data);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, data]);

  const handleFieldChange = (key: string, value: string) => {
    setEditedData((prev: any) => ({ ...(prev ?? {}), [key]: value }));
  };

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
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-8 bg-slate-900/70 backdrop-blur-md"
        onClick={(e) => {
          // Clicking the dark overlay (not the inner card) closes the viewer.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full h-full max-w-7xl flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                type === 'cnh' ? "bg-[#E4F5EA] text-[#1F8A4C]" :
                type === 'crv' ? "bg-[#FFF3DC] text-[#8a6206]" :
                type === 'policy' ? "bg-[#1B4D8F]/10 text-[#1B4D8F]" :
                type === 'COTACAO' ? "bg-purple-100 text-purple-600" :
                "bg-gold-deep/10 text-gold-deep"
              )}>
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-slate-800 font-medium">{title || 'Visualizador de Documento'}</h3>
                <p className="text-xs text-slate-500 uppercase tracking-wider">{type || 'PDF'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {resolvedUrl && (
                <a
                  href={resolvedUrl}
                  download
                  className="p-2 text-slate-400 hover:text-[#1B4D8F] hover:bg-[#1B4D8F]/5 rounded-lg transition-colors"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </a>
              )}
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:bg-[#FDE4E4] hover:text-[#C0392B] rounded-lg transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Document Viewer (70% or full) */}
            <div className={cn(
              "flex-1 relative bg-slate-100 overflow-auto",
              onConfirm && "md:border-r border-slate-200"
            )}>
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-gold-deep" />
                  <p className="text-sm animate-pulse">Carregando visualizador seguro...</p>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <div className="p-4 bg-[#FDE4E4] rounded-full mb-4">
                    <AlertCircle className="w-12 h-12 text-[#C0392B]" />
                  </div>
                  <h4 className="text-slate-800 font-medium mb-2">Erro ao carregar documento</h4>
                  <p className="text-slate-500 text-sm max-w-md mb-6">{error}</p>
                  <button
                    onClick={onClose}
                    className="px-6 py-2 bg-white border border-slate-200 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F] text-slate-600 rounded-xl transition-all"
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
              <div className="w-full md:w-96 bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden">
                <div className="p-6 overflow-y-auto flex-1 space-y-6 scrollbar-hide">
                  <header>
                    <h4 className="text-slate-800 font-semibold flex items-center gap-2">
                       <Maximize2 className="w-4 h-4 text-gold-deep" />
                       Validar Extração Técnica
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Confirme se os dados extraídos pelo pipeline determinístico estão corretos.
                    </p>
                  </header>

                  <div className="space-y-4">
                    {(() => {
                      const schemaKey = (type || '').toLowerCase() === 'crlv' ? 'crv' : (type || '').toLowerCase() === 'apolice' ? 'policy' : (type || '').toLowerCase();
                      const schema = DOCUMENT_SCHEMAS[schemaKey];
                      if (schema && editedData) {
                        const filled = schema.filter(d => {
                          const v = pickValue(editedData, d);
                          return v !== '' && v !== false && v != null;
                        }).length;
                        const ratio = filled / schema.length;
                        if (ratio < 0.4) {
                          return (
                            <div className="p-3 mb-3 rounded-xl bg-[#FFF3DC] border border-[#B8860B]/30 text-[#8a6206] text-xs">
                              ⚠️ Extração parcial — apenas {filled}/{schema.length} campos preenchidos. Revise manualmente ou clique <strong>Descartar</strong> e reimporte com melhor qualidade.
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}
                    {renderValidationFields(type, editedData, handleFieldChange)}
                  </div>

                  {/* Technical Debug Info */}
                  {debug && (
                    <div className="mt-8 pt-6 border-t border-slate-200 space-y-4">
                      <div className="flex items-center gap-2">
                         <div className="w-1 h-1 rounded-full bg-gold-deep" />
                         <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Painel de Controle OCR</h3>
                      </div>

                      {/* Regional Debug Visuals */}
                      {debug.regions && debug.regionImages && (
                        <div className="space-y-4">
                          <p className="text-[9px] font-black text-gold-deep uppercase tracking-[0.2em] border-b border-gold-deep/20 pb-2">Análise Regional Determinística</p>
                          <div className="space-y-3">
                            {Object.entries(debug.regions).map(([key, val]: [string, any]) => {
                              const metrics = (debug as any).metrics?.[key];
                              return (
                                <div key={key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all hover:border-gold-deep/30 group shadow-sm">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-3 p-3 bg-slate-50">
                                      <div className="w-16 h-10 bg-slate-200 rounded-lg overflow-hidden flex-shrink-0 border border-slate-300 shadow-inner group-hover:border-gold-deep/40 transition-colors">
                                        {debug.regionImages?.[key] ? (
                                          <img src={debug.regionImages?.[key]} className="w-full h-full object-contain" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <AlertCircle className="w-4 h-4 text-slate-300" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{key}</p>
                                          {metrics && (
                                            <span className="text-[7px] font-bold text-[#1F8A4C] bg-[#E4F5EA] px-1.5 rounded uppercase">Pass {metrics.pass}</span>
                                          )}
                                        </div>
                                        <p className={cn(
                                          "text-[10px] font-bold truncate mt-0.5",
                                          val ? "text-gold-deep" : "text-[#C0392B] italic"
                                        )}>
                                          {val ? `"${val}"` : '[Falha na Extração]'}
                                        </p>
                                      </div>
                                    </div>
                                    {metrics && (
                                      <div className="flex items-center gap-4 px-3 py-1.5 bg-slate-50/50 border-t border-slate-100">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[7px] text-slate-400 uppercase font-bold">Tempo:</span>
                                            <span className="text-[8px] text-slate-600 font-mono">{metrics.time}ms</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-[7px] text-slate-400 uppercase font-bold">Conf:</span>
                                            <span className="text-[8px] text-slate-600 font-mono">{(metrics.confidence * 100 || 100).toFixed(0)}%</span>
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
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                           <p className="text-[8px] font-black text-slate-400 uppercase">Pipeline</p>
                        <p className="text-[10px] font-bold text-slate-800 mt-1 leading-none">{debug.isVisual ? 'PROCESSAMENTO REGIONAL' : 'NATIVO (TEXTO)'}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Tempo Proc.</p>
                        <p className="text-[10px] font-bold text-slate-800 mt-1 leading-none">{(Number(debug.time) / 1000).toFixed(2)}s</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Volume</p>
                        <p className="text-[10px] font-bold text-slate-800 mt-1 leading-none">{debug.chars} chars</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-[8px] font-black text-slate-400 uppercase">Status</p>
                        <p className="text-[10px] font-bold text-gold-deep mt-1 leading-none">{(debug.chars ?? 0) > 10 ? 'ESTÁVEL' : 'DIVERGENTE'}</p>
                      </div>
                        {debug.resolution && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 col-span-2 flex items-center justify-between">
                            <p className="text-[8px] font-black text-slate-400 uppercase">Resolução / Escala</p>
                            <p className="text-[10px] font-bold text-slate-800 leading-none">{debug.resolution} @ {debug.scale}x</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-slate-200 bg-white flex flex-col gap-3">
                  <button
                    onClick={() => onConfirm(editedData)}
                    className="w-full bg-[#1B4D8F] hover:bg-[#153E73] text-white font-bold py-3.5 rounded-xl transition-all shadow-sm shadow-[#1B4D8F]/20 active:scale-[0.98]"
                  >
                    Confirmar e Importar
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full bg-white border border-slate-200 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F] text-slate-600 font-medium py-3 rounded-xl transition-all"
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
