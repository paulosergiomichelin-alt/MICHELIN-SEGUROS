import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, User, Phone, MapPin, Briefcase, X, ArrowLeft, Upload, FileText, CheckCircle2, Paperclip, Trash2, Lock } from 'lucide-react';
import { Cliente, ClienteDocumento, ClienteDocumentoTipo, UserProfile } from '../../types';
import { StorageService } from '../../services/StorageService';
import { cn, formatCPF, generateId } from '../../lib/utils';
import { Modal } from '../../components/Modal';
import { OCRService } from '../../services/OCRService';

interface ClienteFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  cliente?: Cliente | null;
  users?: UserProfile[];
  currentUser?: UserProfile | null;
  isAdmin?: boolean;
  inline?: boolean;
}

const ESTADOS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'];

const SECTION = ({ label, icon: Icon }: { label: string; icon: React.ElementType }) => (
  <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3 mb-3">
    <Icon className="w-3.5 h-3.5 text-gold-deep" />
    <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">{label}</span>
  </div>
);

const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-0.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all placeholder:text-white/20";

function formatPhone(v: string) {
  const n = v.replace(/\D/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0,2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7,11)}`;
}

function parseBRDate(s: string): string {
  if (!s) return '';
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return '';
}

function fmtCPF(v: string) {
  const n = v.replace(/\D/g, '');
  let r = '';
  for (let i = 0; i < n.length && i < 11; i++) {
    if (i === 3 || i === 6) r += '.';
    if (i === 9) r += '-';
    r += n[i];
  }
  return r;
}

export const ClienteForm: React.FC<ClienteFormProps> = ({ isOpen, onClose, onSave, cliente, users = [], currentUser, isAdmin = true, inline = false }) => {
  const isEditing = !!cliente;
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [docProcessing, setDocProcessing] = useState(false);
  const [docError, setDocError] = useState('');
  const [docImported, setDocImported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docUploadRef = useRef<HTMLInputElement>(null);
  const [documentos, setDocumentos] = useState<ClienteDocumento[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocError, setUploadDocError] = useState('');
  const [selectedDocTipo, setSelectedDocTipo] = useState<ClienteDocumentoTipo>('rg');
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const citiesCache = useRef<Record<string, string[]>>({});
  const [sexo, setSexo] = useState<'M' | 'F' | ''>('');
  const [form, setForm] = useState({
    nome: '', cpf: '', rg: '', rgDataExpedicao: '', rgOrgaoEmissor: '', dataNascimento: '', estadoCivil: '', profissao: '',
    telefone: '', whatsapp: '', email: '',
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
    responsavelId: '', observacoes: '',
  });

  useEffect(() => {
    if (cliente) {
      setForm({
        nome: cliente.nome ?? '',
        cpf: fmtCPF(cliente.cpf ?? ''),
        rg: cliente.rg ?? '',
        rgDataExpedicao: cliente.rgDataExpedicao ?? '',
        rgOrgaoEmissor: cliente.rgOrgaoEmissor ?? '',
        dataNascimento: cliente.dataNascimento ?? '',
        estadoCivil: cliente.estadoCivil ?? '',
        profissao: cliente.profissao ?? '',
        telefone: formatPhone(cliente.telefone ?? ''),
        whatsapp: formatPhone(cliente.whatsapp ?? ''),
        email: cliente.email ?? '',
        cep: cliente.cep ?? '',
        rua: cliente.rua ?? '',
        numero: cliente.numero ?? '',
        complemento: cliente.complemento ?? '',
        bairro: cliente.bairro ?? '',
        cidade: cliente.cidade ?? '',
        estado: cliente.estado ?? '',
        responsavelId: cliente.responsavelId ?? '',
        observacoes: cliente.observacoes ?? '',
      });
      setSexo(cliente.sexo ?? '');
      setDocumentos(cliente.documentos ?? []);
    } else {
      setForm({
        nome: '', cpf: '', rg: '', rgDataExpedicao: '', rgOrgaoEmissor: '', dataNascimento: '', estadoCivil: '', profissao: '',
        telefone: '', whatsapp: '', email: '',
        cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
        responsavelId: (!isAdmin && currentUser?.uid) ? currentUser.uid : '',
        observacoes: '',
      });
      setSexo('');
      setDocumentos([]);
    }
  }, [cliente, isOpen, isAdmin, currentUser]);

  useEffect(() => {
    const uf = form.estado;
    if (!uf) { setCities([]); return; }
    if (citiesCache.current[uf]) { setCities(citiesCache.current[uf]); return; }
    setLoadingCities(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      .then(r => r.json())
      .then((data: any[]) => {
        const names = data.map((m: any) => m.nome);
        citiesCache.current[uf] = names;
        setCities(names);
      })
      .catch(() => setCities([]))
      .finally(() => setLoadingCities(false));
  }, [form.estado]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const fetchCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({
          ...f,
          rua: data.logradouro || f.rua,
          bairro: data.bairro || f.bairro,
          cidade: data.localidade || f.cidade,
          estado: data.uf || f.estado,
        }));
      }
    } catch {}
    finally { setLoadingCep(false); }
  };

  const handleApoliceImport = async (file: File) => {
    setDocError('');
    setDocProcessing(true);
    try {
      const result = await OCRService.processDocument(file, { hintType: 'policy' });
      const data: any = result?.structuredData ?? result?.data ?? result ?? {};

      const updates: Partial<typeof form> = {};

      const nome = data.segurado_nome || data.insuredName || '';
      if (nome) updates.nome = nome;

      const cpfRaw = (data.segurado_cpf || data.insuredCpf || '').replace(/\D/g, '');
      if (cpfRaw.length === 11) updates.cpf = fmtCPF(cpfRaw);

      const nasc = parseBRDate(data.segurado_data_nascimento || '');
      if (nasc) updates.dataNascimento = nasc;

      const ec = (data.estado_civil || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (ec.includes('casad')) updates.estadoCivil = 'Casado(a)';
      else if (ec.includes('solteiro') || ec.includes('solteira')) updates.estadoCivil = 'Solteiro(a)';
      else if (ec.includes('divorciado') || ec.includes('divorciada')) updates.estadoCivil = 'Divorciado(a)';
      else if (ec.includes('viuvo') || ec.includes('viuva')) updates.estadoCivil = 'Viúvo(a)';
      else if (ec.includes('uniao') || ec.includes('uniao')) updates.estadoCivil = 'União estável';

      const cepDigits = (data.cep || '').replace(/\D/g, '');
      if (cepDigits.length === 8) {
        updates.cep = `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`;
      }

      if (Object.keys(updates).length === 0) {
        setDocError('Nenhum dado do segurado encontrado no documento.');
        return;
      }

      setForm(f => ({ ...f, ...updates }));
      setDocImported(true);
      if (cepDigits.length === 8) fetchCep(cepDigits);
    } catch {
      setDocError('Falha ao processar documento. Verifique o arquivo e tente novamente.');
    } finally {
      setDocProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocUpload = async (file: File) => {
    setUploadDocError('');
    setUploadingDoc(true);
    try {
      const fileName = `${generateId()}_${file.name}`;
      const result = await StorageService.uploadFile(file, 'documents', fileName);
      const doc: ClienteDocumento = {
        tipo: selectedDocTipo,
        url: result.url,
        path: result.path,
        nome: file.name,
        uploadedAt: new Date().toISOString(),
      };
      setDocumentos(prev => [...prev, doc]);
    } catch {
      setUploadDocError('Falha ao enviar arquivo. Tente novamente.');
    } finally {
      setUploadingDoc(false);
      if (docUploadRef.current) docUploadRef.current.value = '';
    }
  };

  const handleRemoveDoc = (idx: number) => {
    setDocumentos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.cpf.trim() || !form.telefone.trim()) return;
    setSaving(true);
    try {
      await onSave({
        nome: form.nome.trim(),
        cpf: form.cpf.replace(/\D/g, ''),
        rg: form.rg || undefined,
        rgDataExpedicao: form.rgDataExpedicao || undefined,
        rgOrgaoEmissor: form.rgOrgaoEmissor || undefined,
        dataNascimento: form.dataNascimento || undefined,
        estadoCivil: form.estadoCivil || undefined,
        profissao: form.profissao || undefined,
        sexo: sexo || undefined,
        telefone: form.telefone.replace(/\D/g, ''),
        whatsapp: form.whatsapp ? form.whatsapp.replace(/\D/g, '') : undefined,
        email: form.email || undefined,
        cep: form.cep.replace(/\D/g, '') || undefined,
        rua: form.rua || undefined,
        numero: form.numero || undefined,
        complemento: form.complemento || undefined,
        bairro: form.bairro || undefined,
        cidade: form.cidade || undefined,
        estado: form.estado || undefined,
        responsavelId: form.responsavelId || undefined,
        observacoes: form.observacoes || undefined,
        status: (cliente?.status as any) ?? 'ativo',
        leadOrigemId: cliente?.leadOrigemId,
        seguradoraAtualId: cliente?.seguradoraAtualId,
        produtoAtual: cliente?.produtoAtual,
        dataRenovacao: cliente?.dataRenovacao,
        documentos: documentos.length > 0 ? documentos : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const formBody = (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">

        {/* ── Importar da Apólice ─────────────────────────────────────── */}
        {!isEditing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3">
              <Upload className="w-3.5 h-3.5 text-gold-deep" />
              <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Importar dados da Apólice (PDF)</span>
            </div>

            {docImported ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[10px] text-emerald-300 font-medium flex-1">Dados importados. Revise os campos e complete as informações.</span>
                <button type="button" onClick={() => setDocImported(false)} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                className={cn('border-2 border-dashed border-white/10 rounded-xl p-5 text-center cursor-pointer transition-all hover:border-gold-deep/30 hover:bg-gold-deep/5', docProcessing && 'pointer-events-none opacity-60')}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleApoliceImport(f); }}
              >
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleApoliceImport(f); }} />
                {docProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 text-gold-deep animate-spin" />
                    <p className="text-[10px] text-white/50">Lendo apólice...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-6 h-6 text-white/20" />
                    <p className="text-[10px] text-white/50">Arraste o PDF da apólice ou <span className="text-gold-deep font-bold">clique para selecionar</span></p>
                    <p className="text-[9px] text-white/20">Nome, CPF e data de nascimento serão preenchidos automaticamente</p>
                  </div>
                )}
              </div>
            )}
            {docError && <p className="text-[10px] text-red-400 font-medium">{docError}</p>}
          </div>
        )}

        {/* Dados pessoais */}
        <div>
          <SECTION label="Dados Pessoais" icon={User} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Field label="Nome completo" required>
                <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" required />
              </Field>
            </div>
            <Field label="CPF" required>
              <input className={inputCls} value={form.cpf} onChange={e => set('cpf', fmtCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} required />
            </Field>
            <Field label="RG">
              <input className={inputCls} value={form.rg} onChange={e => set('rg', e.target.value)} placeholder="RG" />
            </Field>
            <Field label="Data de expedição (RG)">
              <input type="date" className={inputCls} value={form.rgDataExpedicao} onChange={e => set('rgDataExpedicao', e.target.value)} />
            </Field>
            <Field label="Órgão emissor (RG)">
              <input className={inputCls} value={form.rgOrgaoEmissor} onChange={e => set('rgOrgaoEmissor', e.target.value)} placeholder="Ex: SSP/SP" />
            </Field>
            <Field label="Data de nascimento">
              <input type="date" className={inputCls} value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} />
            </Field>
            <Field label="Estado civil">
              <select className={inputCls} value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)}>
                <option value="">Selecionar...</option>
                {ESTADO_CIVIL.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Profissão">
              <input className={inputCls} value={form.profissao} onChange={e => set('profissao', e.target.value)} placeholder="Profissão" />
            </Field>
            <Field label="Sexo">
              <select className={inputCls} value={sexo} onChange={e => setSexo(e.target.value as 'M' | 'F' | '')}>
                <option value="">Não informado</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </Field>
          </div>
        </div>

        {/* Contato */}
        <div>
          <SECTION label="Contato" icon={Phone} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Telefone" required>
              <input className={inputCls} value={form.telefone} onChange={e => set('telefone', formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} required />
            </Field>
            <Field label="WhatsApp">
              <input className={inputCls} value={form.whatsapp} onChange={e => set('whatsapp', formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} />
            </Field>
            <div className="md:col-span-2">
              <Field label="E-mail">
                <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
              </Field>
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div>
          <SECTION label="Endereço" icon={MapPin} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="CEP">
              <div className="relative">
                <input
                  className={inputCls}
                  value={form.cep}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0,8);
                    set('cep', v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v);
                    if (v.length === 8) fetchCep(v);
                  }}
                  placeholder="00000-000"
                  maxLength={9}
                />
                {loadingCep && <Loader2 className="absolute right-2 top-2 w-4 h-4 text-gold-deep animate-spin" />}
              </div>
            </Field>
            <div className="md:col-span-2">
              <Field label="Rua / Logradouro">
                <input className={inputCls} value={form.rua} onChange={e => set('rua', e.target.value)} placeholder="Rua, Avenida..." />
              </Field>
            </div>
            <Field label="Número">
              <input className={inputCls} value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Nº" />
            </Field>
            <Field label="Complemento">
              <input className={inputCls} value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Apto, Bloco..." />
            </Field>
            <Field label="Bairro">
              <input className={inputCls} value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
            </Field>
            <Field label="Estado">
              <select
                className={inputCls}
                value={form.estado}
                onChange={e => {
                  set('estado', e.target.value);
                  set('cidade', '');
                }}
              >
                <option value="">UF</option>
                {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Cidade">
                <div className="relative">
                  <input
                    className={cn(inputCls, loadingCities && 'pr-8')}
                    value={form.cidade}
                    onChange={e => { set('cidade', e.target.value); setShowCityDropdown(true); }}
                    onFocus={() => { if (cities.length > 0) setShowCityDropdown(true); }}
                    onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
                    placeholder={loadingCities ? 'Carregando cidades...' : form.estado ? 'Digite ou selecione...' : 'Cidade'}
                    autoComplete="off"
                  />
                  {loadingCities && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-deep animate-spin" />}
                  {showCityDropdown && cities.length > 0 && (() => {
                    const filtered = form.cidade
                      ? cities.filter(c => c.toLowerCase().includes(form.cidade.toLowerCase()))
                      : cities;
                    if (filtered.length === 0) return null;
                    return (
                      <div className="absolute z-50 w-full mt-1 bg-[#0B1120] border border-white/10 rounded-lg shadow-2xl max-h-52 overflow-y-auto custom-scrollbar">
                        {filtered.slice(0, 60).map(city => (
                          <button
                            key={city}
                            type="button"
                            className="w-full px-3 py-2 text-left text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                            onMouseDown={() => { set('cidade', city); setShowCityDropdown(false); }}
                          >
                            {city}
                          </button>
                        ))}
                        {filtered.length > 60 && (
                          <p className="px-3 py-2 text-[9px] text-white/20 text-center border-t border-white/5">
                            +{filtered.length - 60} cidades — continue digitando para filtrar
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </Field>
            </div>
          </div>
        </div>

        {/* Dados internos */}
        <div>
          <SECTION label="Dados Internos" icon={Briefcase} />
          <div className="grid grid-cols-1 gap-3">
            <Field label="Vendedor responsável">
              <div className="relative">
                <select
                  className={cn(inputCls, !isAdmin && 'opacity-75 cursor-not-allowed pr-8')}
                  value={form.responsavelId}
                  onChange={e => isAdmin && set('responsavelId', e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="">— Sem responsável —</option>
                  {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                </select>
                {!isAdmin && (
                  <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none" />
                )}
              </div>
            </Field>
            <Field label="Observações">
              <textarea
                className={cn(inputCls, 'resize-none h-20')}
                value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Observações internas..."
              />
            </Field>
          </div>
        </div>

        {/* Documentos */}
        <div>
          <div className="flex items-center gap-2 border-l-2 border-gold-deep/40 pl-3 mb-3">
            <Paperclip className="w-3.5 h-3.5 text-gold-deep" />
            <span className="text-[10px] font-black text-gold-light uppercase tracking-[0.2em]">Documentos</span>
          </div>
          <div className="space-y-3">
            {documentos.length > 0 && (
              <div className="space-y-1.5">
                {documentos.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
                    <FileText className="w-3.5 h-3.5 text-gold-deep shrink-0" />
                    <span className="text-[10px] text-white/60 flex-1 truncate">{doc.nome}</span>
                    <span className="text-[9px] text-white/30 uppercase tracking-wider shrink-0">{doc.tipo}</span>
                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-[9px] text-gold-deep hover:text-gold-light shrink-0">Ver</a>
                    <button type="button" onClick={() => handleRemoveDoc(idx)} className="text-white/20 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <select
                className="px-2 py-2 bg-brand-black border border-white/10 rounded-lg text-white text-[11px] font-medium focus:border-gold-deep/40 focus:ring-2 focus:ring-gold-deep/10 transition-all"
                value={selectedDocTipo}
                onChange={e => setSelectedDocTipo(e.target.value as ClienteDocumentoTipo)}
              >
                <option value="rg">RG</option>
                <option value="cpf">CPF</option>
                <option value="cnh">CNH</option>
                <option value="rc">RC</option>
                <option value="outros">Outros</option>
              </select>
              <input
                ref={docUploadRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); }}
              />
              <button
                type="button"
                disabled={uploadingDoc}
                onClick={() => docUploadRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-white/60 hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
              >
                {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploadingDoc ? 'Enviando...' : 'Anexar arquivo'}
              </button>
            </div>
            {uploadDocError && <p className="text-[10px] text-red-400 font-medium">{uploadDocError}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !form.nome || !form.cpf || !form.telefone}
            className="flex items-center gap-2 px-5 py-2.5 bg-gold-deep text-brand-dark rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEditing ? 'Salvar alterações' : 'Criar cliente'}
          </button>
        </div>
      </form>
  );

  if (inline) {
    return (
      <div className="max-w-3xl">
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
            {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
        </div>
        {formBody}
      </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Cliente' : 'Novo Cliente'} maxWidth="max-w-3xl">
      {formBody}
    </Modal>
  );
};
