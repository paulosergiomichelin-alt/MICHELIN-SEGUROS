import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { motion } from 'motion/react';
import { Mail, X, Bold, Italic, Underline } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEmail } from '../../contexts/EmailContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { EmailShell } from './components/layout/EmailShell';

// ─── NoAccountsOnboarding ─────────────────────────────────────────────────────

const NoAccountsOnboarding: React.FC = () => {
  const { userProfile } = usePermissions();
  const uid = userProfile?.uid ?? '';
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  const returnUrl = encodeURIComponent(cleanUrl);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0f0f0f] gap-6 p-8">
      <div className="w-20 h-20 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
        <Mail className="w-10 h-10 text-blue-400" />
      </div>
      <div className="text-center">
        <h2 className="text-white/80 text-xl font-semibold mb-2">Conecte sua conta de e-mail</h2>
        <p className="text-white/40 text-sm max-w-md">
          Conecte uma conta Gmail ou Microsoft Outlook para começar a gerenciar seus e-mails diretamente no CRM.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={uid ? `/api/email/auth/gmail/init?userId=${encodeURIComponent(uid)}&returnUrl=${returnUrl}` : '#'}
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white/70 hover:text-white/90"
        >
          <svg viewBox="0 0 48 48" className="w-5 h-5">
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          </svg>
          Conectar Gmail
        </a>
        <a
          href={uid ? `/api/email/auth/microsoft/init?userId=${encodeURIComponent(uid)}&returnUrl=${returnUrl}` : '#'}
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white/70 hover:text-white/90"
        >
          <svg viewBox="0 0 48 48" className="w-5 h-5">
            <path fill="#F25022" d="M22 22H2V2h20z"/>
            <path fill="#7FBA00" d="M46 22H26V2h20z"/>
            <path fill="#00A4EF" d="M22 46H2V26h20z"/>
            <path fill="#FFB900" d="M46 46H26V26h20z"/>
          </svg>
          Conectar Outlook
        </a>
      </div>
    </div>
  );
};

// ─── EmailSignatureSettings ───────────────────────────────────────────────────

const EmailSignatureSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, saveSettings } = useEmail();
  const sigRef = React.useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (sigRef.current) {
      sigRef.current.innerHTML = state.settings?.signature ?? '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const execCmd = (cmd: string) => {
    document.execCommand(cmd, false);
    sigRef.current?.focus();
  };

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({ signature: sigRef.current?.innerHTML ?? '' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 700);
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-2xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-[#161616]">
          <div>
            <h2 className="text-white/85 text-sm font-semibold">Assinatura de E-mail</h2>
            <p className="text-white/35 text-xs mt-0.5">Adicionada automaticamente ao compor e responder e-mails</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-white/5 bg-[#141414]">
          {[
            { cmd: 'bold', icon: <Bold className="w-3.5 h-3.5" />, title: 'Negrito' },
            { cmd: 'italic', icon: <Italic className="w-3.5 h-3.5" />, title: 'Itálico' },
            { cmd: 'underline', icon: <Underline className="w-3.5 h-3.5" />, title: 'Sublinhado' },
          ].map(btn => (
            <button
              key={btn.cmd}
              type="button"
              title={btn.title}
              onMouseDown={e => { e.preventDefault(); execCmd(btn.cmd); }}
              className="p-1.5 rounded text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors"
            >
              {btn.icon}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <span className="text-white/25 text-xs ml-1">Use Enter para quebra de linha</span>
        </div>
        <div
          ref={sigRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Digite sua assinatura aqui..."
          className="min-h-[180px] max-h-[320px] overflow-y-auto px-5 py-4 text-white/75 text-sm leading-relaxed outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-white/20"
          style={{ wordBreak: 'break-word' }}
        />
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/8 bg-[#161616]">
          <p className="text-white/25 text-xs">A assinatura aparece abaixo do seu texto ao compor</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60',
              )}
            >
              {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar Assinatura'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── EmailPage ────────────────────────────────────────────────────────────────

export const EmailPage: React.FC = () => {
  const { state } = useEmail();
  const { accounts, loading } = state;
  const [showSettings, setShowSettings] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f0f0f]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-white/30 text-sm">Carregando e-mails...</p>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex h-full w-full bg-[#0f0f0f] overflow-hidden">
        <NoAccountsOnboarding />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] overflow-hidden">
      <EmailShell onOpenSettings={() => setShowSettings(true)} />
      <AnimatePresence>
        {showSettings && <EmailSignatureSettings onClose={() => setShowSettings(false)} />}
      </AnimatePresence>
    </div>
  );
};
