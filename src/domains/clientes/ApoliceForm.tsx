import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, FileText, Upload, CheckCircle2, X, ExternalLink, Paperclip, Trash2, ArrowLeft, Pencil, Car, RefreshCw } from 'lucide-react';
import { Apolice, ApoliceAnexo, ApoliceAnexoTipo, ApoliceStatus, ApoliceVeiculo, ProdutoSeguro, PRODUTOS_SEGURO, PRODUTOS_COM_VEICULO } from '../../types';
import { SEGURADORAS } from '../../lib/seguradoras';
import { Modal } from '../../components/Modal';
import { UniversalDocumentViewer } from '../../components/UniversalDocumentViewer';
import { OCRService } from '../../services/OCRService';
import { StorageService } from '../../services/StorageService';
import { Button, Card } from '../../components/ui';
import { cn } from '../../lib/utils';
import { parseISO } from 'date-fns';
import { authHeader } from '../../lib/dataApiClient';

interface ApoliceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Apolice, 'id' | 'clienteId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  apolice?: Apolice | null;
  inline?: boolean;
  // Abre em modo visualização (todos os campos travados) em vez de edição direta —
  // usado quando o usuário clica na apólice na lista pra só consultar os dados;
  // o botão "Editar" dentro do próprio formulário destrava pra edição.
  initialReadOnly?: boolean;
}

const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all placeholder:text-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed disabled:border-slate-200";

const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-0.5">
      {label}{required && <span className="text-[#C0392B] ml-0.5">*</span>}
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

function splitBrandModel(v: string): Partial<ApoliceVeiculo> {
  const clean = v.trim();
  if (!clean) return {};
  const parts = clean.split('/').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { marca: parts[0], modelo: parts.slice(1).join(' ') };
  return { modelo: clean };
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

export const ApoliceForm: React.FC<ApoliceFormProps> = ({ isOpen, onClose, onSave, apolice, inline = false, initialReadOnly = false }) => {
  const isEditing = !!apolice;
  const [readOnly, setReadOnly] = useState(initialReadOnly);
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
  const [veiculo, setVeiculo] = useState<ApoliceVeiculo>({});
  const isVeiculo = form.produto ? PRODUTOS_COM_VEICULO.includes(form.produto as ProdutoSeguro) : false;
  const setVeic = (k: keyof ApoliceVeiculo, v: string) => setVeiculo(vv => ({ ...vv, [k]: v }));

  // Main document import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docObjectUrl, setDocObjectUrl] = useState<string>('');
  const [docProcessing, setDocProcessing] = useState(false);
  const [docError, setDocError] = useState('');
  const [ocrData, setOcrData] = useState<any>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [docMeta, setDocMeta] = useState<{ url: string; path: string; name: string } | null>(null);
  const [reimporting, setReimporting] = useState(false);
  // true enquanto os dados extraídos vêm de uma reimportação do doc já salvo,
  // pra handleViewerConfirm não subir o mesmo arquivo de novo pro storage
  const isReimportRef = useRef(false);

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
      setVeiculo(apolice.veiculo ?? {});
    } else {
      setForm({
        produto: '', seguradoraId: '', numeroApolice: '',
        inicioVigencia: '', fimVigencia: '', dataRenovacao: '',
        premioLiquido: '', valorTotal: '', comissaoPct: '',
        corretoraOrigem: '', observacoes: '', status: 'ativo',
      });
      setDocMeta(null);
      setAnexos([]);
      setVeiculo({});
    }
    setDocFile(null);
    setDocObjectUrl('');
    setOcrData(null);
    setDocError('');
    setAnexoError('');
    setSaveError('');
    setReadOnly(initialReadOnly);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Refaz o OCR sobre o PDF já importado, sem exigir que o usuário selecione
  // o arquivo de novo — útil quando o parser ganhou novos campos (ex: dados
  // do veículo) depois que a apólice já tinha sido cadastrada.
  const handleReimport = async () => {
    if (!docMeta) return;
    // Reimportar sempre destrava a edição — sem isso o usuário reprocessaria
    // o documento na visualização somente-leitura sem conseguir salvar o resultado.
    if (readOnly) setReadOnly(false);
    setDocError('');
    setReimporting(true);
    try {
      const resp = await fetch(`/api/documents/fetch?url=${encodeURIComponent(docMeta.url)}`, { headers: await authHeader() });
      if (!resp.ok) throw new Error('download failed');
      const blob = await resp.blob();
      const file = new File([blob], docMeta.name, { type: blob.type || 'application/pdf' });
      isReimportRef.current = true;
      setDocFile(file);
      const objUrl = URL.createObjectURL(file);
      setDocObjectUrl(objUrl);
      setDocProcessing(true);
      const result = await OCRService.processDocument(file, { hintType: 'policy' });
      const data = result?.structuredData ?? result?.data ?? result ?? {};
      setOcrData(data);
      setViewerOpen(true);
    } catch {
      setDocError('Falha ao reimportar documento. Verifique a conexão e tente novamente.');
    } finally {
      setDocProcessing(false);
      setReimporting(false);
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

    const veicUpdates: Partial<ApoliceVeiculo> = {};
    if (data.plate || data.placa) veicUpdates.placa = data.plate || data.placa;
    if (data.chassis || data.chassi) veicUpdates.chassi = data.chassis || data.chassi;
    if (data.renavam) veicUpdates.renavam = data.renavam;
    if (data.manufactureYear || data.ano_fabricacao) veicUpdates.anoFabricacao = data.manufactureYear || data.ano_fabricacao;
    if (data.modelYear || data.ano_modelo) veicUpdates.anoModelo = data.modelYear || data.ano_modelo;
    if (data.color || data.cor) veicUpdates.cor = data.color || data.cor;
    const brandModel = data.brandModel || data.marca_modelo;
    if (brandModel) Object.assign(veicUpdates, splitBrandModel(brandModel));
    if (Object.keys(veicUpdates).length > 0) setVeiculo(v => ({ ...v, ...veicUpdates }));

    // Map premium values from OCR
    const premioLiquidoStr = parseBRMoneyStr(data.premioLiquido || data.premio_liquido || '');
    if (premioLiquidoStr) updates.premioLiquido = premioLiquidoStr;

    const premioTotalStr = parseBRMoneyStr(data.premio || data.valor_total || data.valorTotal || '');
    if (premioTotalStr) updates.valorTotal = premioTotalStr;

    setForm(f => ({ ...f, ...updates }));

    if (isReimportRef.current) {
      // Arquivo já está salvo no storage; reimportação só reprocessa os campos.
      isReimportRef.current = false;
      return;
    }

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
        premioLiquido: Math.round(parseCurrency(form.premioLiquido) * 100),
        valorTotal: Math.round(parseCurrency(form.valorTotal) * 100),
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
        veiculo: isVeiculo && Object.values(veiculo).some(v => v && v.trim()) ? veiculo : undefined,
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
    <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-50">

          {/* ── Importar PDF ────────────────────────────────────────────── */}
          {(!readOnly || docMeta) && (
          <Card title="Importar Apólice (PDF)" icon={Upload}>
            {docMeta ? (
              <div className="flex items-center gap-2 p-3 bg-[#E4F5EA] border border-[#1F8A4C]/20 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-[#1F8A4C] shrink-0" />
                <span className="text-[10px] text-[#1F8A4C] font-medium flex-1 truncate">{docMeta.name}</span>
                <a href={docMeta.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 text-[#1F8A4C] hover:opacity-80 transition-colors" />
                </a>
                <button
                  type="button"
                  onClick={handleReimport}
                  disabled={reimporting || docProcessing}
                  title="Reimportar documento (atualiza os campos extraídos, ex: dados do veículo)"
                  className="text-[#1F8A4C] hover:text-[#153E73] transition-colors disabled:opacity-40"
                >
                  {reimporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
                {!readOnly && (
                  <button type="button" onClick={() => { setDocMeta(null); setDocFile(null); setOcrData(null); }} className="text-slate-400 hover:text-[#C0392B] transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div
                className={cn(
                  'border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer transition-all hover:border-gold-deep/40 hover:bg-gold-deep/5',
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
                    <p className="text-[10px] text-slate-500">Processando documento...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-6 h-6 text-slate-300" />
                    <p className="text-[10px] text-slate-500">Arraste o PDF da apólice ou <span className="text-gold-deep font-bold">clique para selecionar</span></p>
                    <p className="text-[9px] text-slate-400">Os campos serão preenchidos automaticamente</p>
                  </div>
                )}
              </div>
            )}
            {docError && <p className="text-[10px] text-[#C0392B] font-medium mt-2">{docError}</p>}
          </Card>
          )}

          {/* ── Dados da Apólice ────────────────────────────────────────── */}
          <Card title="Dados da Apólice" icon={FileText}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Produto" required>
                <select className={inputCls} value={form.produto} onChange={e => set('produto', e.target.value)} required disabled={readOnly}>
                  <option value="">Selecionar...</option>
                  {PRODUTOS_SEGURO.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Seguradora" required>
                <select className={inputCls} value={form.seguradoraId} onChange={e => set('seguradoraId', e.target.value)} required disabled={readOnly}>
                  <option value="">Selecionar...</option>
                  {SEGURADORAS.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </Field>
              <Field label="Número da apólice">
                <input className={inputCls} value={form.numeroApolice} onChange={e => set('numeroApolice', e.target.value)} placeholder="000.000.000-0" disabled={readOnly} />
              </Field>
              <Field label="Status">
                <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value as ApoliceStatus)} disabled={readOnly}>
                  <option value="ativo">Ativo</option>
                  <option value="em_renovacao">Em renovação</option>
                  <option value="expirado">Expirado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </Field>
              <Field label="Início de vigência">
                <input type="date" className={inputCls} value={form.inicioVigencia} onChange={e => set('inicioVigencia', e.target.value)} disabled={readOnly} />
              </Field>
              <Field label="Fim de vigência" required>
                <input type="date" className={inputCls} value={form.fimVigencia} onChange={e => handleFimVigencia(e.target.value)} required disabled={readOnly} />
              </Field>
              <Field label="Corretora origem">
                <input className={inputCls} value={form.corretoraOrigem} onChange={e => set('corretoraOrigem', e.target.value)} placeholder="Nome da corretora" disabled={readOnly} />
              </Field>
            </div>
          </Card>

          {/* ── Dados do Veículo ────────────────────────────────────────── */}
          {isVeiculo && (
          <Card title="Dados do Veículo" icon={Car}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Marca">
                <input className={inputCls} value={veiculo.marca ?? ''} onChange={e => setVeic('marca', e.target.value)} placeholder="Ex: Volkswagen" disabled={readOnly} />
              </Field>
              <Field label="Modelo">
                <input className={inputCls} value={veiculo.modelo ?? ''} onChange={e => setVeic('modelo', e.target.value)} placeholder="Ex: Gol 1.0" disabled={readOnly} />
              </Field>
              <Field label="Ano de fabricação">
                <input className={inputCls} value={veiculo.anoFabricacao ?? ''} onChange={e => setVeic('anoFabricacao', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2020" disabled={readOnly} />
              </Field>
              <Field label="Ano modelo">
                <input className={inputCls} value={veiculo.anoModelo ?? ''} onChange={e => setVeic('anoModelo', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2021" disabled={readOnly} />
              </Field>
              <Field label="Placa">
                <input className={inputCls} value={veiculo.placa ?? ''} onChange={e => setVeic('placa', e.target.value.toUpperCase())} placeholder="ABC1D23" disabled={readOnly} />
              </Field>
              <Field label="Chassi">
                <input className={inputCls} value={veiculo.chassi ?? ''} onChange={e => setVeic('chassi', e.target.value.toUpperCase())} placeholder="9BWZZZ..." disabled={readOnly} />
              </Field>
              <Field label="Cor">
                <input className={inputCls} value={veiculo.cor ?? ''} onChange={e => setVeic('cor', e.target.value)} placeholder="Ex: Prata" disabled={readOnly} />
              </Field>
              <Field label="Renavam">
                <input className={inputCls} value={veiculo.renavam ?? ''} onChange={e => setVeic('renavam', e.target.value.replace(/\D/g, ''))} placeholder="00000000000" disabled={readOnly} />
              </Field>
            </div>
          </Card>
          )}

          {/* ── Valores ─────────────────────────────────────────────────── */}
          <Card title="Valores" icon={FileText}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Prêmio líquido">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]">R$</span>
                  <input className={cn(inputCls, 'pl-8')} value={form.premioLiquido}
                    onChange={e => set('premioLiquido', fmtCurrency(e.target.value))} placeholder="0,00" disabled={readOnly} />
                </div>
              </Field>
              <Field label="Valor total">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]">R$</span>
                  <input className={cn(inputCls, 'pl-8')} value={form.valorTotal}
                    onChange={e => set('valorTotal', fmtCurrency(e.target.value))} placeholder="0,00" disabled={readOnly} />
                </div>
              </Field>
              <Field label="Comissão (%)*">
                <div className="relative">
                  <input
                    className={cn(inputCls, 'pr-8', !form.comissaoPct.trim() && 'border-[#B8860B]/50')}
                    value={form.comissaoPct}
                    onChange={e => {
                      const v = e.target.value.replace(/[^\d,.]/g, '');
                      set('comissaoPct', v);
                    }}
                    placeholder="10,00"
                    required
                    disabled={readOnly}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]">%</span>
                </div>
              </Field>
              <Field label="Valor da comissão (calculado)">
                <div className={cn(inputCls, 'bg-slate-100 text-slate-500 cursor-default flex items-center gap-2')}>
                  <span className="text-slate-400 text-[11px]">R$</span>
                  <span className="text-[11px]">
                    {valorComissaoReais > 0
                      ? valorComissaoReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                      : '—'}
                  </span>
                </div>
              </Field>
            </div>
          </Card>

          {/* ── Documentos adicionais ────────────────────────────────────── */}
          {(!readOnly || anexos.length > 0) && (
          <Card title="Documentos Adicionais" icon={Paperclip}>
            <div className="space-y-2">
              {/* Existing attachments */}
              {anexos.length > 0 && (
                <div className="space-y-1.5">
                  {anexos.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest w-20 shrink-0">
                        {ANEXO_TIPO_LABEL[a.tipo]}
                      </span>
                      <span className="text-[10px] text-slate-600 flex-1 truncate">{a.nome}</span>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-slate-400 hover:text-gold-deep transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {!readOnly && (
                        <button type="button" onClick={() => removeAnexo(i)} className="shrink-0 text-slate-300 hover:text-[#C0392B] transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add attachment row */}
              {!readOnly && (
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
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-all disabled:opacity-40 shrink-0 whitespace-nowrap"
                >
                  {uploadingAnexo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                  {uploadingAnexo ? 'Enviando...' : 'Anexar'}
                </button>
              </div>
              )}
              {anexoError && <p className="text-[10px] text-[#C0392B]">{anexoError}</p>}
            </div>
          </Card>
          )}

          {/* ── Observações ──────────────────────────────────────────────── */}
          {(!readOnly || form.observacoes) && (
          <Card>
            <Field label="Observações">
              <textarea className={cn(inputCls, 'resize-none h-16')} value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)} placeholder="Observações sobre esta apólice..." disabled={readOnly} />
            </Field>
          </Card>
          )}

          {saveError && (
            <div className="px-4 py-2.5 bg-[#FDE4E4] border border-[#C0392B]/20 rounded-xl">
              <p className="text-[10px] text-[#C0392B] font-medium">{saveError}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            {readOnly ? (
              <>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Fechar
                </Button>
                <Button type="button" variant="primary" icon={Pencil} onClick={() => setReadOnly(false)}>
                  Editar
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={!canSubmit}>
                  {isEditing ? 'Salvar' : 'Criar apólice'}
                </Button>
              </>
            )}
          </div>
        </form>
  );

  return (
    <>
      {inline ? (
        <div className="max-w-5xl">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>
            <span className="text-slate-200">|</span>
            <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
              {readOnly ? 'Apólice' : isEditing ? 'Editar Apólice' : 'Nova Apólice'}
            </h2>
          </div>
          {formBody}
        </div>
      ) : (
        <Modal isOpen={isOpen} onClose={onClose} title={readOnly ? 'Apólice' : isEditing ? 'Editar Apólice' : 'Nova Apólice'} maxWidth="max-w-2xl">
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
