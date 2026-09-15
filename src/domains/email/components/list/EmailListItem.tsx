import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Star, Paperclip, MoreVertical, Mail, MailOpen, FolderInput, ShieldOff } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../../lib/utils';
import type { CachedEmail, EmailFolderNode } from '../../types/email.types';
import { SenderAvatar } from '../shared/SenderAvatar';
import { addrDisplay } from '../../utils/addressFormat';
import { fmtDate } from '../../utils/dateFormat';
import { FIXED_FOLDERS } from '../../constants/folders';

interface Props {
  message: CachedEmail;
  isSelected: boolean;
  isChecked?: boolean;
  folders: EmailFolderNode[];
  onClick: () => void;
  onCheck?: (checked: boolean) => void;
  onToggleRead: () => void;
  onMoveTo: (targetFolderId: string) => void;
  onNotSpam: () => void;
}

export const EmailListItem: React.FC<Props> = ({
  message, isSelected, isChecked, folders, onClick, onCheck, onToggleRead, onMoveTo, onNotSpam,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // A linha da lista é posicionada pelo virtualizer via `transform: translateY(...)`
  // (e o próprio motion.div aplica outro transform pra animação de layout) — CSS cria
  // um novo "stacking context" (e um novo containing block pra position:fixed) em
  // qualquer ancestral com transform. Sem portal, o menu ficava preso dentro desse
  // contexto e a linha de baixo (depois no DOM, mesmo nível de z-index) pintava por
  // cima do menu, cobrindo-o — exatamente o "fica sobrescrito pelo fundo" relatado.
  // Renderizar no document.body via portal, com posição calculada a partir do botão,
  // escapa de qualquer transform ancestral.
  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMenuOpen(o => !o);
  };

  // O backend/provedores usam 'archive' internamente, mas a pasta fixa aqui é 'archived'
  // (FIXED_FOLDERS) — sem essa normalização, uma mensagem arquivada mostraria
  // "Arquivados" na própria lista de destinos de "Mover para".
  const normalizedCurrentFolder = message.folder === 'archive' ? 'archived' : message.folder;
  const moveTargets = [
    ...FIXED_FOLDERS.filter(f => f.id !== normalizedCurrentFolder).map(f => ({ id: f.id, name: f.label })),
    ...folders.filter(f => f.id !== message.folder),
  ];

  return (
    <motion.div
      layout="position"
      role="button"
      tabIndex={0}
      draggable
      // motion.div reaproveita onDragStart/onDrag/onDragEnd pro próprio sistema de
      // gesto de arrastar (assinatura (event, info) => void), diferente do evento
      // nativo do HTML5 drag-and-drop — precisa do cast pra acessar dataTransfer.
      onDragStart={e => (e as unknown as React.DragEvent<HTMLDivElement>).dataTransfer.setData('text/plain', message.id)}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-100 transition-colors group cursor-pointer relative',
        isSelected
          ? 'bg-[#EAF1FB] border-l-2 border-l-[#1B4D8F]'
          : 'hover:bg-slate-50',
        !message.isRead && 'bg-[#F5F9FD]',
      )}
    >
      {/* Checkbox / unread dot */}
      <div className="mt-1.5 shrink-0 w-5 h-5 flex items-center justify-center">
        {onCheck ? (
          <input
            type="checkbox"
            checked={isChecked ?? false}
            onChange={e => { e.stopPropagation(); onCheck(e.target.checked); }}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded accent-[#1B4D8F] opacity-0 group-hover:opacity-100 transition-opacity"
            style={isChecked ? { opacity: 1 } : undefined}
          />
        ) : (
          !message.isRead && <div className="w-2 h-2 rounded-full bg-[#1B4D8F]" />
        )}
      </div>

      {/* Avatar */}
      <SenderAvatar from={message.from} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1 mb-0.5">
          <span className={cn(
            'text-sm truncate',
            message.isRead ? 'text-slate-500 font-normal' : 'text-slate-900 font-semibold',
          )}>
            {addrDisplay(message.from)}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">{fmtDate(message.date)}</span>
        </div>
        <div className={cn(
          'text-xs truncate mb-0.5',
          message.isRead ? 'text-slate-500' : 'text-slate-700 font-medium',
        )}>
          {message.subject || '(sem assunto)'}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 truncate flex-1">{message.snippet}</span>
          <div className="flex items-center gap-1 shrink-0">
            {message.isStarred && <Star className="w-3 h-3 text-gold-deep fill-gold-deep" />}
            {message.hasAttachments && <Paperclip className="w-3 h-3 text-slate-400" />}
          </div>
        </div>
      </div>

      {/* Ações rápidas (aparecem no hover) */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title={message.isRead ? 'Marcar como não lida' : 'Marcar como lida'}
          onClick={e => { e.stopPropagation(); onToggleRead(); }}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        >
          {message.isRead ? <Mail className="w-3.5 h-3.5" /> : <MailOpen className="w-3.5 h-3.5" />}
        </button>
        <button
          ref={menuButtonRef}
          type="button"
          title="Mais ações"
          onClick={openMenu}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          className="fixed z-50 w-52 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          {message.folder === 'spam' && (
            <button
              onClick={() => { setMenuOpen(false); onNotSpam(); }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Não é lixo eletrônico
            </button>
          )}
          <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            <FolderInput className="w-3 h-3" /> Mover para
          </div>
          {moveTargets.map(target => (
            <button
              key={target.id}
              onClick={() => { setMenuOpen(false); onMoveTo(target.id); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors truncate"
            >
              {target.name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </motion.div>
  );
};
