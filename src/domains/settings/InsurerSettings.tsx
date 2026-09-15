import React, { useEffect, useState } from 'react';
import { Shield, Eye, EyeOff, Save, CheckCircle2, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { InsurerCredentialsService, TokioMarineCredentialsForm } from '../../services/InsurerCredentialsService';

const EMPTY_FORM: TokioMarineCredentialsForm = {
  ativa: false, ambiente: 'aceite-w', codigoCorretor: '', codigoUsuario: '', codigoOperadora: '', cpfEmissor: '',
};

export const InsurerSettings: React.FC = () => {
  const [form, setForm] = useState<TokioMarineCredentialsForm>(EMPTY_FORM);
  const [temCredencial, setTemCredencial] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    InsurerCredentialsService.get().then((all) => {
      const tokio = all.tokio;
      if (tokio) {
        setForm({
          ativa: tokio.ativa, ambiente: tokio.ambiente as any, codigoCorretor: tokio.codigoCorretor,
          codigoUsuario: tokio.codigoUsuario, codigoOperadora: '', cpfEmissor: tokio.cpfEmissor,
        });
        setTemCredencial(tokio.temCredencial);
      }
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await InsurerCredentialsService.save('tokio', form);
      setSaved(true);
      setTemCredencial(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const validar = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await InsurerCredentialsService.validar('tokio');
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({ ok: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };

  if (loading) return <div className="text-slate-400 text-[11px] p-6">Carregando...</div>;

  return (
    <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
          <Shield className="w-5 h-5 text-gold-deep" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Tokio Marine</h3>
        </div>
        <div className={cn(
          "px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-[0.18em] flex items-center gap-1.5",
          temCredencial ? "bg-[#E4F5EA] text-[#1F8A4C] border-[#1F8A4C]/30" : "bg-[#FDE4E4] text-[#C0392B] border-[#C0392B]/30"
        )}>
          {temCredencial ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {temCredencial ? 'Credencial salva' : 'Sem credencial'}
        </div>
      </div>

      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Seguradora ativa</p>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, ativa: !f.ativa }))}
          className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors", form.ativa ? "bg-[#1F8A4C]" : "bg-slate-200")}
        >
          <span className={cn("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition", form.ativa ? "translate-x-5" : "translate-x-0")} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Ambiente</label>
          <select
            value={form.ambiente}
            onChange={(e) => setForm((f) => ({ ...f, ambiente: e.target.value as any }))}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
          >
            <option value="aceite-w">Aceite W (homologação)</option>
            <option value="aceite-y">Aceite Y (homologação)</option>
            <option value="producao">Produção</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">CPF Emissor</label>
          <input
            value={form.cpfEmissor}
            onChange={(e) => setForm((f) => ({ ...f, cpfEmissor: e.target.value }))}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
            placeholder="000.000.000-00"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Código Corretor</label>
          <input
            value={form.codigoCorretor}
            onChange={(e) => setForm((f) => ({ ...f, codigoCorretor: e.target.value }))}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Código Usuário</label>
          <input
            value={form.codigoUsuario}
            onChange={(e) => setForm((f) => ({ ...f, codigoUsuario: e.target.value }))}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Código Operadora (senha)</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.codigoOperadora}
              onChange={(e) => setForm((f) => ({ ...f, codigoOperadora: e.target.value }))}
              className="w-full px-3 py-2 pr-9 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
              placeholder={temCredencial ? 'Deixe em branco para manter a senha atual' : '••••••••'}
            />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#1B4D8F] transition-colors">
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {validationResult && (
        <div className={cn(
          "p-3 rounded-xl border flex items-start gap-2.5 text-[11px] font-medium",
          validationResult.ok ? "bg-[#E4F5EA] border-[#1F8A4C]/20 text-[#1F8A4C]" : "bg-[#FDE4E4] border-[#C0392B]/30 text-[#C0392B]"
        )}>
          {validationResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
          <span>{validationResult.ok ? 'Credenciais válidas.' : (validationResult.error || 'Falha na validação.')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={validar}
          disabled={!temCredencial || validating}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F] transition-all disabled:opacity-40"
        >
          {validating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Validar credenciais
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !form.ambiente || !form.codigoCorretor || !form.codigoUsuario || !form.cpfEmissor}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            saved ? "bg-[#E4F5EA] border border-[#1F8A4C]/40 text-[#1F8A4C]" : "bg-[#1B4D8F] text-white hover:bg-[#153E73] disabled:opacity-40"
          )}
        >
          {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Salvo</> : <><Save className="w-3.5 h-3.5" /> Salvar</>}
        </button>
      </div>
    </section>
  );
};
