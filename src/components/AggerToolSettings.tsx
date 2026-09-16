import React, { useState } from 'react';
import { Zap, CheckCircle2, AlertTriangle, RefreshCw, FileText, ShieldCheck, Eye, EyeOff, Save, Key } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useAggerUserscriptInstalled,
  pingExtension,
  setManualOverride,
} from '../lib/agger-userscript';
import { getAggerCredentials, setAggerCredentials } from '../lib/agger-quote';

export const AggerToolSettings: React.FC = () => {
  const { installed, version, manualOverride } = useAggerUserscriptInstalled();
  const [verifyState, setVerifyState] = useState<{ ok: boolean; detected: string | null; nonce: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Credenciais
  const [creds, setCreds] = useState(() => getAggerCredentials());
  const [showPassword, setShowPassword] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);

  const runVerify = async () => {
    const result = await pingExtension();
    setVerifyState({ ok: result.ok, detected: result.ok ? (result.version ?? '?') : null, nonce: Date.now() });
  };

  const saveCreds = () => {
    setAggerCredentials(creds);
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 2500);
  };

  const statusBadge = (() => {
    if (version) return { color: 'emerald', label: `Instalado v${version}`, icon: CheckCircle2 };
    if (manualOverride) return { color: 'amber', label: 'Marcado manualmente (sem detecção)', icon: AlertTriangle };
    return { color: 'red', label: 'Não instalado', icon: AlertTriangle };
  })();

  const StatusIcon = statusBadge.icon;

  return (
    <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
          <Zap className="w-5 h-5 text-gold-deep" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Ferramenta "Cotar no Agger"</h3>
        </div>
        <div className={cn(
          "px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-[0.18em] flex items-center gap-1.5",
          statusBadge.color === 'emerald' && "bg-[#E4F5EA] text-[#1F8A4C] border-[#1F8A4C]/30",
          statusBadge.color === 'amber' && "bg-[#FFF3DC] text-[#8a6206] border-[#B8860B]/30",
          statusBadge.color === 'red' && "bg-[#FDE4E4] text-[#C0392B] border-[#C0392B]/30",
        )}>
          <StatusIcon className="w-3 h-3" /> {statusBadge.label}
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed font-medium">
        Extensão Chrome própria da Michelin que automatiza login no Aggilizador e preenche o formulário de cotação com os dados do lead. Funciona com qualquer lead que tenha nome, CPF e placa.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={runVerify}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1B4D8F] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#153E73] transition-all shadow-sm shadow-[#1B4D8F]/20"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Verificar extensão
        </button>
        <button
          type="button"
          onClick={() => setShowHelp(v => !v)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F] transition-all"
        >
          <FileText className="w-3.5 h-3.5" /> {showHelp ? 'Ocultar instruções' : 'Como instalar'}
        </button>
      </div>

      {verifyState && (
        <div className={cn(
          "p-3 rounded-xl border flex items-start gap-2.5 text-[11px] font-medium",
          verifyState.ok
            ? "bg-[#E4F5EA] border-[#1F8A4C]/20 text-[#1F8A4C]"
            : "bg-[#FFF3DC] border-[#B8860B]/30 text-[#8a6206]"
        )}>
          {verifyState.ok
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
          <span>
            {verifyState.ok
              ? <>Detectado! Versão <span className="font-black">{verifyState.detected}</span> está ativa nesta página.</>
              : <>Não detectado nesta página. Confira o painel da Tampermonkey, a permissão "Acesso ao site" para localhost, e recarregue.</>}
          </span>
        </div>
      )}

      {/* Manual override toggle */}
      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Forçar liberação manual</p>
          <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
            Esconde o banner e libera o botão "Cotar no Agger" mesmo sem detectar o userscript. Use quando souber que está instalado mas a detecção falhar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setManualOverride(!manualOverride)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ml-3",
            manualOverride ? "bg-gold-deep" : "bg-slate-200"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition",
              manualOverride ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {/* Credenciais Agger */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-gold-deep" />
          <p className="text-[11px] font-black text-slate-800 uppercase tracking-[0.18em]">Credenciais do Agger</p>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          E-mail e senha usados pela ferramenta para fazer login automático. Ficam apenas no seu navegador, nunca no servidor.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail Agger</label>
            <input
              type="email"
              value={creds.email}
              onChange={(e) => setCreds(c => ({ ...c, email: e.target.value }))}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
              placeholder="michelinseguros@hotmail.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha Agger</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={creds.password}
                onChange={(e) => setCreds(c => ({ ...c, password: e.target.value }))}
                className="w-full px-3 py-2 pr-9 bg-white border border-slate-200 rounded-lg text-slate-800 text-[11px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#1B4D8F] transition-colors"
                title={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={saveCreds}
          disabled={!creds.email || !creds.password}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
            credsSaved
              ? "bg-[#E4F5EA] border border-[#1F8A4C]/40 text-[#1F8A4C]"
              : "bg-[#1B4D8F] text-white hover:bg-[#153E73] disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {credsSaved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Salvo</> : <><Save className="w-3.5 h-3.5" /> Salvar credenciais</>}
        </button>
      </div>

      {/* Help expander */}
      {showHelp && (
        <div className="space-y-4 p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <Step n={1} title="Abrir o gerenciador de extensões">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              No Chrome, navegue para <span className="font-mono text-gold-deep">chrome://extensions</span> ou clique no ícone 🧩 e depois em <span className="font-bold text-gold-deep">Gerenciar extensões</span>.
            </p>
          </Step>

          <Step n={2} title="Ativar o modo desenvolvedor">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Ative o toggle <span className="font-bold text-gold-deep">Modo do desenvolvedor</span> (canto superior direito).
            </p>
          </Step>

          <Step n={3} title="Carregar a extensão sem compactação">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Clique em <span className="font-bold text-gold-deep">Carregar sem compactação</span> e selecione a pasta <span className="font-mono text-gold-deep">Extenção GoogleChrome</span> do repositório. Após qualquer atualização nos arquivos, clique no ícone de recarga (🔄) da extensão nessa mesma tela.
            </p>
          </Step>

          <Step n={4} title="Confirmar funcionamento">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Recarregue esta página e clique em <span className="font-bold text-gold-deep">"Verificar extensão"</span>. O status acima deve ficar verde. No console (F12) do Aggilizador, procure por <span className="font-mono text-gold-deep">[Michelin Seguros] extensão ativa</span>.
            </p>
          </Step>

          <div className="p-3 bg-[#E4F5EA] border border-[#1F8A4C]/20 rounded-lg flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#1F8A4C] shrink-0 mt-0.5" />
            <p className="text-[10px] text-[#1F8A4C] font-medium leading-relaxed">
              Os dados do lead são enviados diretamente da extensão ao Aggilizador — nunca passam pelo servidor. As credenciais ficam apenas no seu navegador.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <div className="flex gap-3">
    <div className="w-6 h-6 rounded-full bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center text-gold-deep text-[10px] font-black shrink-0">
      {n}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-black text-slate-800 uppercase tracking-wider mb-2">{title}</p>
      <div>{children}</div>
    </div>
  </div>
);
