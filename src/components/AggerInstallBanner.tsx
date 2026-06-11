import React, { useState } from 'react';
import { X, Zap, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useAggerUserscriptInstalled,
  pingExtension,
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

  const runDiagnostic = async () => {
    const result = await pingExtension();
    if (result.ok) {
      setDiagnostic({ ok: true, msg: `Detectado! Versão ${result.version ?? '?'}. Recarregando…` });
      setTimeout(() => window.location.reload(), 800);
    } else {
      setDiagnostic({
        ok: false,
        msg: 'Extensão não detectada. Certifique-se de que a extensão Michelin Seguros está instalada e ativada no Chrome.',
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
                title="Abrir o gerenciador de extensões"
                body={
                  <p className="text-[10px] text-white/60 leading-relaxed">
                    No Chrome, acesse <span className="font-mono text-gold-light">chrome://extensions</span> ou clique no ícone 🧩 → <span className="font-bold text-gold-light">Gerenciar extensões</span>.
                  </p>
                }
              />

              <Step
                n={2}
                title="Ativar modo desenvolvedor e carregar"
                body={
                  <p className="text-[10px] text-white/60 leading-relaxed">
                    Ative o toggle <span className="font-bold text-gold-light">Modo do desenvolvedor</span> e clique em <span className="font-bold text-gold-light">Carregar sem compactação</span>. Selecione a pasta <span className="font-mono text-gold-light">Extenção GoogleChrome</span> do repositório.
                  </p>
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
                        <ShieldCheck className="w-3.5 h-3.5" /> O que verificar
                      </p>
                      <ol className="list-decimal list-inside space-y-1 pl-1 text-[9.5px] text-white/70">
                        <li>Acesse <span className="font-mono text-gold-light">chrome://extensions</span> e confirme que a extensão <span className="font-bold text-gold-light">Michelin Seguros - Automação</span> está ativada.</li>
                        <li>Se atualizou os arquivos, clique no ícone de recarga 🔄 da extensão nessa tela.</li>
                        <li>Recarregue esta página e tente verificar novamente.</li>
                      </ol>
                    </div>

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
                        Esconde este aviso e libera o botão "Cotar no Agger" em cada lead. Sem a extensão ativa, o Agger abre em nova aba mas <span className="font-bold">não</span> preenche automaticamente.
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
