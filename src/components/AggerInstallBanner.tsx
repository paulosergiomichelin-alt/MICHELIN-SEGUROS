import React, { useState } from 'react';
import { Download, X, ExternalLink, Zap, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  AGGER_USERSCRIPT_URL,
  TAMPERMONKEY_CHROME,
  TAMPERMONKEY_FIREFOX,
  useAggerUserscriptInstalled,
  readInstalledVersion,
  setManualOverride,
} from '../lib/agger-userscript';

interface AggerInstallBannerProps {
  isSidebarOpen: boolean;
}

export const AggerInstallBanner: React.FC<AggerInstallBannerProps> = ({ isSidebarOpen }) => {
  const { installed } = useAggerUserscriptInstalled();
  const [showModal, setShowModal] = useState(false);
  const [diagnostic, setDiagnostic] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('michelin_agger_banner_dismissed') === '1'; }
    catch { return false; }
  });

  const runDiagnostic = () => {
    const v = readInstalledVersion();
    if (v) {
      setDiagnostic({ ok: true, msg: `Detectado! Versão ${v}. Recarregando…` });
      setTimeout(() => window.location.reload(), 800);
    } else {
      setDiagnostic({
        ok: false,
        msg: 'Não detectado nesta página. Verifique no painel Tampermonkey se o script está habilitado e se a página atual bate com algum @match.',
      });
    }
  };

  if (installed || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem('michelin_agger_banner_dismissed', '1'); } catch {}
    setDismissed(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        title="Instalar ferramenta Cotar no Agger"
        className={cn(
          "w-full relative overflow-hidden group rounded-lg border border-gold-deep/40",
          "bg-gradient-to-br from-gold-deep/20 via-gold-deep/10 to-amber-500/10",
          "hover:from-gold-deep/30 hover:via-gold-deep/20 hover:to-amber-500/20",
          "transition-all shadow-lg shadow-gold-deep/10",
          isSidebarOpen ? "p-3" : "p-2 md:p-2"
        )}
      >
        {/* pulse */}
        <span className="absolute inset-0 rounded-lg ring-2 ring-gold-deep/40 animate-pulse pointer-events-none" />

        <div className={cn("flex items-center gap-2.5 relative", !isSidebarOpen && "justify-center")}>
          <div className="w-7 h-7 rounded-md bg-gold-deep/30 border border-gold-deep/40 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-gold-light" />
          </div>
          {isSidebarOpen && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[9px] font-black text-gold-light uppercase tracking-[0.18em] leading-tight truncate">
                  Cotar no Agger
                </p>
                <p className="text-[8px] font-bold text-gold-light/70 uppercase tracking-wider mt-0.5 truncate">
                  Instalar ferramenta
                </p>
              </div>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); dismiss(); }}
                className="p-1 -mr-1 text-gold-light/40 hover:text-gold-light transition-colors"
              >
                <X className="w-3 h-3" />
              </span>
            </>
          )}
        </div>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-brand-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-brand-dark border border-gold-deep/30 rounded-2xl max-w-lg w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-gold-deep" />
                  <h2 className="text-sm font-black text-gold-deep uppercase tracking-[0.2em]">
                    Cotar no Agger
                  </h2>
                </div>
                <p className="text-[11px] text-white/60 font-medium leading-relaxed">
                  Ferramenta de automação que faz login, navega até o formulário de cotação e preenche com os dados do lead.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-white/30 hover:text-white transition-colors -mt-1 -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <Step
                n={1}
                title="Instalar a extensão Tampermonkey"
                body={
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={TAMPERMONKEY_CHROME}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 hover:border-gold-deep/30 transition-all"
                    >
                      <ExternalLink className="w-3 h-3" /> Chrome / Edge
                    </a>
                    <a
                      href={TAMPERMONKEY_FIREFOX}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 hover:border-gold-deep/30 transition-all"
                    >
                      <ExternalLink className="w-3 h-3" /> Firefox
                    </a>
                  </div>
                }
              />

              <Step
                n={2}
                title="Instalar o script da Michelin"
                body={
                  <>
                    <a
                      href={AGGER_USERSCRIPT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gold-deep text-brand-dark rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all"
                    >
                      <Download className="w-3.5 h-3.5" /> Abrir instalação do script
                    </a>
                    <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
                      O Tampermonkey vai abrir e pedir confirmação para instalar.
                      Clique em <span className="text-gold-light font-bold">Instalar</span>.
                    </p>
                  </>
                }
              />

              <Step
                n={3}
                title="Recarregar esta página"
                body={
                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-md text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
                  >
                    Recarregar agora
                  </button>
                }
              />

              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-emerald-300/80 font-medium leading-relaxed">
                  Depois de instalado, este aviso some e o botão <span className="font-black">"Cotar no Agger"</span> aparece em cada lead.
                  As credenciais ficam só na sua máquina, nunca no servidor.
                </p>
              </div>

              <div className="pt-3 border-t border-white/5 space-y-2">
                <button
                  onClick={runDiagnostic}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-md text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
                >
                  <RefreshCw className="w-3 h-3" /> Já instalei — verificar agora
                </button>
                {diagnostic && (
                  <div className={cn(
                    "p-2.5 rounded-md flex items-start gap-2 text-[10px] leading-relaxed font-medium",
                    diagnostic.ok
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                      : "bg-amber-500/10 border border-amber-500/30 text-amber-200"
                  )}>
                    {diagnostic.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                      : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />}
                    <span>{diagnostic.msg}</span>
                  </div>
                )}
                {diagnostic && !diagnostic.ok && (
                  <>
                    <div className="p-3 bg-amber-500/5 border border-amber-500/30 rounded-md text-[10px] text-white/80 font-medium leading-relaxed space-y-2">
                      <p className="text-amber-200 font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> Causa mais provável (Chrome)
                      </p>
                      <p>
                        Desde o Chrome 122, extensões só rodam em sites que você autorizou. Faça isso:
                      </p>
                      <ol className="list-decimal list-inside space-y-1 pl-1 text-[9.5px] text-white/70">
                        <li>Clique no ícone de <span className="font-bold text-gold-light">quebra-cabeça</span> 🧩 (canto superior direito).</li>
                        <li>Procure <span className="font-bold text-gold-light">Tampermonkey</span> → clique nos <span className="font-bold">três pontinhos</span> ao lado.</li>
                        <li>Em <span className="font-bold text-gold-light">"Pode acessar este site"</span> escolha <span className="font-bold text-gold-light">"Em todos os sites"</span>.</li>
                        <li>Repita esse passo enquanto estiver em <span className="font-mono text-gold-light">aggilizador.com.br</span> também.</li>
                        <li>Recarregue a página.</li>
                      </ol>
                    </div>

                    <div className="p-2.5 bg-black/30 rounded-md text-[9.5px] text-white/60 font-medium leading-relaxed space-y-1.5">
                      <p className="text-white/80 font-black uppercase tracking-wider text-[9px]">Outras verificações</p>
                      <p>• Tampermonkey instalado? Painel da extensão deve listar <span className="font-bold text-gold-light">"Michelin Seguros — Cotar no Agger v1.1.0"</span>.</p>
                      <p>• Está habilitado? Toggle verde no painel.</p>
                      <p>• Console (F12) deve mostrar: <span className="font-bold text-gold-light">"[Michelin Agger] userscript v1.1.0 carregado..."</span></p>
                      <p>• Comando de teste: <code className="bg-white/10 px-1 rounded text-gold-light">document.documentElement.getAttribute('data-michelin-agger-installed')</code></p>
                    </div>

                    <a
                      href={AGGER_USERSCRIPT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-md text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
                    >
                      <FileText className="w-3 h-3" /> Testar arquivo do script agora
                    </a>
                    <p className="text-[9px] text-white/40 leading-relaxed -mt-1">
                      Abre o arquivo numa aba nova. Se o Tampermonkey estiver funcionando, ele intercepta e pede para instalar. Se aparecer só código JS bruto, o Tampermonkey não está ativo.
                    </p>

                    <div className="pt-2 border-t border-white/5">
                      <button
                        onClick={() => {
                          setManualOverride(true);
                          setShowModal(false);
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-md text-[10px] font-black uppercase tracking-widest text-amber-200 hover:bg-amber-500/20 transition-all"
                      >
                        Marcar como instalado mesmo assim
                      </button>
                      <p className="text-[9px] text-white/40 leading-relaxed mt-1.5">
                        Esconde este aviso e libera o botão "Cotar no Agger" em cada lead. Útil se você tem certeza que instalou e quer testar — sem o userscript ativo, o Agger abre em nova aba mas <span className="font-bold">não</span> preenche sozinho.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-white/5 flex justify-end">
              <button
                onClick={() => { dismiss(); setShowModal(false); }}
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
              >
                Não mostrar mais
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Step: React.FC<{ n: number; title: string; body: React.ReactNode }> = ({ n, title, body }) => (
  <div className="flex gap-3">
    <div className="w-6 h-6 rounded-full bg-gold-deep/20 border border-gold-deep/40 flex items-center justify-center text-gold-deep text-[10px] font-black shrink-0">
      {n}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-black text-white uppercase tracking-wider mb-2">{title}</p>
      <div>{body}</div>
    </div>
  </div>
);
