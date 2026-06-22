import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, FileText, Upload, CheckCircle2, X, ExternalLink, Paperclip, Trash2, ArrowLeft } from 'lucide-react';
import { Apolice, ApoliceAnexo, ApoliceAnexoTipo, ApoliceStatus, ProdutoSeguro, PRODUTOS_SEGURO } from '../../types';
import { SEGURADORAS } from '../../lib/seguradoras';
import { Modal } from '../../components/Modal';
import { UniversalDocumentViewer } from '../../components/UniversalDocumentViewer';
import { OCRService } from '../../services/OCRService';
import { StorageService } from '../../services/StorageService';
import { cn } from '../../lib/utils';
import { parseISO } from 'date-fns';

interface ApoliceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Apolice, 'id' | 'clienteId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  apolice?: Apolice | null;
  inline?: boolean;
}

const inputCls = "w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all placeholder:text-white/20";

const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-0.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

function fmtCurrency(v: string) {
  const n = v.replace(/\D/g, '');
  if (!n) return '';
  return (parseInt(n) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function parseCurrency(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
}

function parsePct(v: string): number {
  return parseFloat(v.replace(',', '.')) || 0;
}

function parseBRDate(s: string): string {
  if (!s) return '';
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return '';
}

function parseBRMoneyStr(v: string): string {
  if (!v) return '';
  const s = v.replace(/[R$\s]/g, '').trim();
  let num: number;
  if (s.includes('.') && s.includes(',')) {
    num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  } else if (s.includes(',')) {
    num = parseFloat(s.replace(',', '.'));
  } else {
    num = parseFloat(s);
  }
  if (isNaN(num) || num <= 0) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function matchSeguradora(ocrInsurer: string): string {
  if (!ocrInsurer) return '';
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').trim();
  const target = norm(ocrInsurer);
  for (const seg of SEGURADORAS) {
    if (target.includes(norm(seg.id))) return seg.id;
    const words = norm(seg.nome).split(' ').filter(w => w.length > 3);
    if (words.some(w => target.includes(w))) return seg.id;
  }
  return '';
}

const ANEXO_TIPO_LABEL: Record<ApoliceAnexoTipo, string> = {
  carta_verde: 'Carta Verde',
  carteirinha: 'Carteirinha',
  boleto: 'Boleto',
  outros: 'Outros',
};

export const ApoliceForm: React.FC<ApoliceFormProps> = ({ isOpen, onClose, onSave, apolice, inline = false }) => {
  const isEditing = !!apolice;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    produto: '' as ProdutoSeguro | '',
    seguradoraId: '',
    numeroApolice: '',
    inicioVigencia: '',
    fimVigencia: '',
    dataRenovacao: '',
    premioLiquido: '',
    valorTotal: '',
    comissaoPct: '',
    corretoraOrigem: '',
    observacoes: '',
    status: 'ativo' as ApoliceStatus,
  });

  // Main document import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docObjectUrl, setDocObjectUrl] = useState<string>('');
  const [docProcessing, setDocProcessing] = useState(false);
  const [docError, setDocError] = useState('');
  const [ocrData, setOcrData] = useState<any>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [docMeta, setDocMeta] = useState<{ url: string; path: string; name: string } | null>(null);

  // Additional attachments state
  const [anexos, setAnexos] = useState<ApoliceAnexo[]>([]);
  const [novoAnexoTipo, setNovoAnexoTipo] = useState<ApoliceAnexoTipo>('carta_verde');
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [anexoError, setAnexoError] = useState('');
  const anexoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (apolice) {
      setForm({
        produto: apolice.produto ?? '',
        seguradoraId: apolice.seguradoraId ?? '',
        numeroApolice: apolice.numeroApolice ?? '',
        inicioVigencia: apolice.inicioVigencia ? apolice.inicioVigencia.slice(0, 10) : '',
        fimVigencia: apolice.fimVigencia ? apolice.fimVigencia.slice(0, 10) : '',
        dataRenovacao: apolice.dataRenovacao ? apolice.dataRenovacao.slice(0, 10) : '',
        premioLiquido: apolice.premioLiquido ? (apolice.premioLiquido / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
        valorTotal: apolice.valorTotal ? (apolice.valorTotal / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
        comissaoPct: apolice.comissaoPct != null ? apolice.comissaoPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
        corretoraOrigem: apolice.corretoraOrigem ?? '',
        observacoes: apolice.observacoes ?? '',
        status: apolice.status ?? 'ativo',
      });
      setDocMeta(apolice.documentoUrl ? { url: apolice.documentoUrl, path: apolice.documentoPath ?? '', name: apolice.documentoFileName ?? 'Apólice' } : null);
      setAnexos(apolice.anexos ?? []);
    } else {
      setForm({
        produto: '', seguradoraId: '', numeroApolice: '',
        inicioVigencia: '', fimVigencia: '', dataRenovacao: '',
        premioLiquido: '', valorTotal: '', comissaoPct: '',
        corretoraOrigem: '', observacoes: '', status: 'ativo',
      });
      setDocMeta(null);
      setAnexos([]);
    }
    setDocFile(null);
    setDocObjectUrl('');
    setOcrData(null);
    setDocError('');
    setAnexoError('');
    setSaveError('');
  }, [apolice, isOpen]);

  useEffect(() => {
    return () => { if (docObjectUrl) URL.revokeObjectURL(docObjectUrl); };
  }, [docObjectUrl]);

  const set = (k: string, v: string) => {
    if (saveError) setSaveError('');
    setForm(f => ({ ...f, [k]: v }));
  };

  const handleFimVigencia = (v: string) => {
    set('fimVigencia', v);
  };

  // Computed comissão value in reais
  const premioLiquidoReais = parseCurrency(form.premioLiquido);
  const comissaoPctValue = parsePct(form.comissaoPct);
  const valorComissaoReais = premioLiquidoReais * comissaoPctValue / 100;

  // ── Main document OCR ──────────────────────────────────────────────────────

  const handleFileSelect = async (file: File) => {
    setDocError('');
    setDocFile(file);
    const objUrl = URL.createObjectURL(file);
    setDocObjectUrl(objUrl);
    setDocProcessing(true);
    try {
      const result = await OCRService.processDocument(file, { hintType: 'policy' });
      const data = result?.structuredData ?? result?.data ?? result ?? {};
      setOcrData(data);
      setViewerOpen(true);
    } catch {
      setDocError('Falha ao processar documento. Verifique o arquivo e tente novamente.');
    } finally {
      setDocProcessing(false);
    }
  };

  const handleViewerConfirm = async (data: any) => {
    setViewerOpen(false);
    if (!docFile) return;

    const updates: Partial<typeof form> = {};
    if (data.policyNumber) updates.numeroApolice = data.policyNumber;
    const seg = matchSeguradora(data.insurer ?? '');
    if (seg) updates.seguradoraId = seg;
    const inicio = parseBRDate(data.startDate ?? '');
    if (inicio) updates.inicioVigencia = inicio;
    const fim = parseBRDate(data.insuranceExpiry ?? '');
    if (fim) {
      updates.fimVigencia = fim;
      updates.dataRenovacao = fim;
    }
    if (data.brokerName && !form.corretoraOrigem) updates.corretoraOrigem = data.brokerName;

    // Map premium values from OCR
    const premioLiquidoStr = parseBRMoneyStr(data.premioLiquido ?? data.premio_liquido ?? '');
    if (premioLiquidoStr) updates.premioLiquido = premioLiquidoStr;

    const premioTotalStr = parseBRMoneyStr(data.premio ?? data.valor_total ?? data.valorTotal ?? '');
    if (premioTotalStr) updates.valorTotal = premioTotalStr;

    setForm(f => ({ ...f, ...updates }));

    try {
      const ext = docFile.name.split('.').pop() ?? 'pdf';
      const { url, path } = await StorageService.uploadFile(docFile, 'documents', `apolice_${Date.now()}.${ext}`);
      setDocMeta({ url, path, name: docFile.name });
    } catch {}
  };

  // ── Additional attachments ─────────────────────────────────────────────────

  const handleAnexoFileSelect = async (file: File) => {
    setAnexoError('');
    setUploadingAnexo(true);
    try {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const { url, path } = await StorageService.uploadFile(file, 'documents', `${novoAnexoTipo}_${Date.now()}.${ext}`);
      setAnexos(prev => [...prev, {
        url, path, nome: file.name, tipo: novoAnexoTipo,
        uploadedAt: new Date().toISOString(),
      }]);
    } catch {
      setAnexoError('Falha ao enviar arquivo. Tente novamente.');
    } finally {
      setUploadingAnexo(false);
      if (anexoInputRef.current) anexoInputRef.current.value = '';
    }
  };

  const removeAnexo = (index: number) => {
    setAnexos(prev => prev.filter((_, i) => i !== index));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields and show specific message instead of silently blocking
    const missing: string[] = [];
    if (!form.produto) missing.push('Produto');
    if (!form.seguradoraId) missing.push('Seguradora');
    if (!form.fimVigencia) missing.push('Fim de Vigência');
    if (!form.comissaoPct.trim()) missing.push('Comissão (%)');
    if (missing.length > 0) {
      setSaveError(`Preencha os campos obrigatórios: ${missing.join(', ')}`);
      return;
    }

    const dataRenovacao = form.fimVigencia;

    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        produto: form.produto as ProdutoSeguro,
        seguradoraId: form.seguradoraId,
        numeroApolice: form.numeroApolice,
        inicioVigencia: form.inicioVigencia || form.fimVigencia,
        fimVigencia: form.fimVigencia,
        dataRenovacao,
        premioLiquido: parseCurrency(form.premioLiquido) * 100,
        valorTotal: parseCurrency(form.valorTotal) * 100,
        comissao: Math.round(valorComissaoReais * 100),
        comissaoPct: comissaoPctValue || undefined,
        corretoraOrigem: form.corretoraOrigem || undefined,
        observacoes: form.observacoes || undefined,
        status: form.status,
        documentoUrl: docMeta?.url,
        documentoPath: docMeta?.path,
        documentoFileName: docMeta?.name,
        documentoUploadedAt: docMeta ? new Date().toISOString() : undefined,
        anexos: anexos.length > 0 ? anexos : undefined,
      });
      onClose();
    } catch (err: any) {
      console.error('[ApoliceForm] Erro ao salvar:', err);
      setSaveError(err?.message || 'Erro ao salvar apólice. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !saving;

  const formBody = (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* ── Importar PDF ────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3">
              <Upload className="w-3.5 h-3.5 text-gold-deep" />
              <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Importar Apólice (PDF)</span>
            </div>

            {docMeta ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[10px] text-emerald-300 font-medium flex-1 truncate">{docMeta.name}</span>
                <a href={docMeta.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400 hover:text-emerald-200 transition-colors" />
                </a>
                <button type="button" onClick={() => { setDocMeta(null); setDocFile(null); setOcrData(null); }} className="text-white/30 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                className={cn(
                  'border-2 border-dashed border-white/10 rounded-xl p-5 text-center cursor-pointer transition-all hover:border-gold-deep/30 hover:bg-gold-deep/5',
                  docProcessing && 'pointer-events-none opacity-60'
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              >
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                {docProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 text-gold-deep animate-spin" />
                    <p className="text-[10px] text-white/50">Processando documento...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-6 h-6 text-white/20" />
                    <p className="text-[10px] text-white/50">Arraste o PDF da apólice ou <span className="text-gold-deep font-bold">clique para selecionar</span></p>
                    <p className="text-[9px] text-white/20">Os campos serão preenchidos automaticamente</p>
                  </div>
                )}
              </div>
            )}
            {docError && <p className="text-[10px] text-red-400 font-medium">{docError}</p>}
          </div>

          {/* ── Dados da Apólice ────────────────────────────────────────── */}
          <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3">
            <FileText className="w-3.5 h-3.5 text-gold-deep" />
            <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Dados da Apólice</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Produto" required>
              <select className={inputCls} value={form.produto} onChange={e => set('produto', e.target.value)} required>
                <option value="">Selecionar...</option>
                {PRODUTOS_SEGURO.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Seguradora" required>
              <select className={inputCls} value={form.seguradoraId} onChange={e => set('seguradoraId', e.target.value)} required>
                <option value="">Selecionar...</option>
                {SEGURADORAS.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </Field>
            <Field label="Número da apólice">
              <input className={inputCls} value={form.numeroApolice} onChange={e => set('numeroApolice', e.target.value)} placeholder="000.000.000-0" />
            </Field>
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value as ApoliceStatus)}>
                <option value="ativo">Ativo</option>
                <option value="em_renovacao">Em renovação</option>
                <option value="expirado">Expirado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </Field>
            <Field label="Início de vigência">
              <input type="date" className={inputCls} value={form.inicioVigencia} onChange={e => set('inicioVigencia', e.target.value)} />
            </Field>
            <Field label="Fim de vigência" required>
              <input type="date" className={inputCls} value={form.fimVigencia} onChange={e => handleFimVigencia(e.target.value)} required />
            </Field>
            <Field label="Corretora origem">
              <input className={inputCls} value={form.corretoraOrigem} onChange={e => set('corretoraOrigem', e.target.value)} placeholder="Nome da corretora" />
            </Field>
          </div>

          {/* ── Valores ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3">
            <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Valores</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Prêmio líquido">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-[11px]">R$</span>
                <input className={cn(inputCls, 'pl-8')} value={form.premioLiquido}
                  onChange={e => set('premioLiquido', fmtCurrency(e.target.value))} placeholder="0,00" />
              </div>
            </Field>
            <Field label="Valor total">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-[11px]">R$</span>
                <input className={cn(inputCls, 'pl-8')} value={form.valorTotal}
                  onChange={e => set('valorTotal', fmtCurrency(e.target.value))} placeholder="0,00" />
              </div>
            </Field>
            <Field label="Comissão (%)*">
              <div className="relative">
                <input
                  className={cn(inputCls, 'pr-8', !form.comissaoPct.trim() && 'border-amber-500/40')}
                  value={form.comissaoPct}
                  onChange={e => {
                    const v = e.target.value.replace(/[^\d,.]/g, '');
                    set('comissaoPct', v);
                  }}
                  placeholder="10,00"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-[11px]">%</span>
              </div>
            </Field>
            <Field label="Valor da comissão (calculado)">
              <div className={cn(inputCls, 'bg-brand-dark/60 text-white/50 cursor-default flex items-center gap-2')}>
                <span className="text-white/30 text-[11px]">R$</span>
                <span className="text-[11px]">
                  {valorComissaoReais > 0
                    ? valorComissaoReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    : '—'}
                </span>
              </div>
            </Field>
          </div>

          {/* ── Documentos adicionais ────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3">
              <Paperclip className="w-3.5 h-3.5 text-gold-deep" />
              <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Documentos Adicionais</span>
            </div>

            {/* Existing attachments */}
            {anexos.length > 0 && (
              <div className="space-y-1.5">
                {anexos.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-brand-dark/60 border border-white/5 rounded-lg">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest w-20 shrink-0">
                      {ANEXO_TIPO_LABEL[a.tipo]}
                    </span>
                    <span className="text-[10px] text-white/70 flex-1 truncate">{a.nome}</span>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-white/30 hover:text-gold-deep transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button type="button" onClick={() => removeAnexo(i)} className="shrink-0 text-white/20 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add attachment row */}
            <div className="flex items-center gap-2">
              <select
                className={cn(inputCls, 'flex-1')}
                value={novoAnexoTipo}
                onChange={e => setNovoAnexoTipo(e.target.value as ApoliceAnexoTipo)}
              >
                <option value="carta_verde">Carta Verde</option>
                <option value="carteirinha">Carteirinha</option>
                <option value="boleto">Boleto</option>
                <option value="outros">Outros</option>
              </select>
              <input
                ref={anexoInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAnexoFileSelect(f); }}
              />
              <button
                type="button"
                disabled={uploadingAnexo}
                onClick={() => anexoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/50 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40 shrink-0 whitespace-nowrap"
              >
                {uploadingAnexo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                {uploadingAnexo ? 'Enviando...' : 'Anexar'}
              </button>
            </div>
            {anexoError && <p className="text-[10px] text-red-400">{anexoError}</p>}
          </div>

          {/* ── Observações ──────────────────────────────────────────────── */}
          <Field label="Observações">
            <textarea className={cn(inputCls, 'resize-none h-16')} value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)} placeholder="Observações sobre esta apólice..." />
          </Field>

          {saveError && (
            <div className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-[10px] text-red-400 font-medium">{saveError}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2.5 bg-gold-deep text-brand-dark rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {isEditing ? 'Salvar' : 'Criar apólice'}
            </button>
          </div>
        </form>
  );

  return (
    <>
      {inline ? (
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>
            <span className="text-white/10">|</span>
            <h2 className="text-[11px] font-black text-white uppercase tracking-widest">
              {isEditing ? 'Editar Apólice' : 'Nova Apólice'}
            </h2>
          </div>
          {formBody}
        </div>
      ) : (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Apólice' : 'Nova Apólice'} maxWidth="max-w-2xl">
          {formBody}
        </Modal>
      )}

      {viewerOpen && docObjectUrl && (
        <UniversalDocumentViewer
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          onConfirm={handleViewerConfirm}
          url={docObjectUrl}
          type="policy"
          title={docFile?.name ?? 'Apólice'}
          data={ocrData}
        />
      )}
    </>
  );
};
