import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, X } from 'lucide-react';
import { useEmail, EmailToast } from '../contexts/EmailContext';
import { cn } from '../lib/utils';

const AUTO_DISMISS_MS = 8000;

const ToastCard: React.FC<{ toast: EmailToast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const { message } = toast;
  const navigate = useNavigate();
  const { selectAccount, openMessage } = useEmail();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Dispara a transição de entrada no próximo frame (senão o navegador não anima).
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = React.useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    const t = setTimeout(close, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [close]);

  const handleClick = () => {
    selectAccount(message.accountId);
    openMessage(message);
    navigate('/email');
    close();
  };

  const senderName = message.from?.name || message.from?.email || 'Remetente desconhecido';
  const inicial = senderName.charAt(0).toUpperCase();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      className={cn(
        'pointer-events-auto w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-slate-200',
        'flex items-start gap-3 p-3.5 cursor-pointer transition-all duration-200 ease-out',
        visible && !leaving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
      )}
    >
      <div className="w-9 h-9 rounded-full bg-[#1B4D8F] flex items-center justify-center text-white font-black text-sm shrink-0">
        {inicial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Mail className="w-3 h-3 text-[#1B4D8F] shrink-0" />
          <p className="text-[10px] font-black text-[#1B4D8F] uppercase tracking-widest">Novo e-mail</p>
        </div>
        <p className="text-[12px] font-bold text-slate-800 truncate">{senderName}</p>
        <p className="text-[11px] text-slate-600 truncate">{message.subject || '(sem assunto)'}</p>
        <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{message.snippet}</p>
      </div>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); close(); }}
        className="p-1 text-slate-300 hover:text-slate-600 transition-colors shrink-0"
        title="Fechar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const EmailToastNotifications: React.FC = () => {
  const { state, dismissToast } = useEmail();

  if (state.toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex flex-col-reverse gap-2.5 pointer-events-none">
      {state.toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
};
