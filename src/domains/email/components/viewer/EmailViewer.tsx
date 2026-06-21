import React, { useState } from 'react';
import {
  Reply, ReplyAll, Forward, Star, Archive, Trash2, MoreVertical,
  ChevronDown, Mail,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../../lib/utils';
import { useEmail } from '../../../../contexts/EmailContext';
import { SenderAvatar } from '../shared/SenderAvatar';
import { EmailViewerBody } from './EmailViewerBody';
import { EmailViewerAttachments } from './EmailViewerAttachments';
import { addrDisplay, addrFull } from '../../utils/addressFormat';
import { fmtFull } from '../../utils/dateFormat';

export const EmailViewer: React.FC = () => {
  const { state, doAction, openComposer } = useEmail();
  const { selectedMessage } = state;
  const [moreOpen, setMoreOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!selectedMessage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#161616] gap-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
          <Mail className="w-8 h-8 text-white/15" />
        </div>
        <p className="text-white/25 text-sm">Selecione um e-mail para ler</p>
      </div>
    );
  }

  const handleAction = (action: string) => {
    doAction(selectedMessage.id, action);
    setMoreOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#161616] min-w-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-white/90 font-semibold text-base leading-snug flex-1">
            {selectedMessage.subject || '(sem assunto)'}
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            <button title="Responder" onClick={() => openComposer('reply', selectedMessage)}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors">
              <Reply className="w-4 h-4" />
            </button>
            <button title="Responder a todos" onClick={() => openComposer('replyAll', selectedMessage)}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors">
              <ReplyAll className="w-4 h-4" />
            </button>
            <button title="Encaminhar" onClick={() => openComposer('forward', selectedMessage)}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors">
              <Forward className="w-4 h-4" />
            </button>
            <button
              title={selectedMessage.isStarred ? 'Remover estrela' : 'Marcar com estrela'}
              onClick={() => handleAction(selectedMessage.isStarred ? 'unstar' : 'star')}
              className={cn(
                'p-2 rounded-lg transition-colors',
                selectedMessage.isStarred
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                  : 'text-white/40 hover:text-amber-400 hover:bg-amber-500/10',
              )}
            >
              <Star className={cn('w-4 h-4', selectedMessage.isStarred && 'fill-amber-400')} />
            </button>
            <button title="Arquivar" onClick={() => handleAction('archive')}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors">
              <Archive className="w-4 h-4" />
            </button>
            <button title="Mover para lixeira" onClick={() => handleAction('trash')}
              className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="relative">
              <button onClick={() => setMoreOpen(!moreOpen)}
                className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    className="absolute right-0 top-full mt-1 w-48 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden"
                  >
                    {[
                      { label: selectedMessage.isRead ? 'Marcar como não lido' : 'Marcar como lido', action: selectedMessage.isRead ? 'unread' : 'read' },
                      { label: 'Mover para spam', action: 'spam' },
                      { label: 'Restaurar', action: 'restore' },
                    ].map(item => (
                      <button key={item.action} onClick={() => handleAction(item.action)}
                        className="w-full text-left px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white/90 transition-colors">
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* From/To/Date */}
        <div className="flex items-start gap-3">
          <SenderAvatar from={selectedMessage.from} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-white/80 font-medium text-sm">{addrDisplay(selectedMessage.from)}</span>
                <span className="text-white/30 text-xs ml-2">{`<${selectedMessage.from?.email ?? ''}>`}</span>
              </div>
              <span className="text-white/30 text-xs shrink-0">{fmtFull(selectedMessage.date)}</span>
            </div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-xs text-white/30 hover:text-white/50 transition-colors mt-0.5"
            >
              Para: {(selectedMessage.to ?? []).map(addrDisplay).join(', ')}
              <ChevronDown className={cn('w-3 h-3 transition-transform', showDetails && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 space-y-1">
                    <p className="text-xs text-white/40"><span className="text-white/25">De:</span> {addrFull(selectedMessage.from)}</p>
                    <p className="text-xs text-white/40"><span className="text-white/25">Para:</span> {(selectedMessage.to ?? []).map(addrFull).join(', ')}</p>
                    {selectedMessage.cc && selectedMessage.cc.length > 0 && (
                      <p className="text-xs text-white/40"><span className="text-white/25">CC:</span> {selectedMessage.cc.map(addrFull).join(', ')}</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-6 py-4">
          <EmailViewerBody
            bodyHtml={selectedMessage.bodyHtml}
            bodyText={selectedMessage.bodyText}
            snippet={selectedMessage.snippet}
            messageId={selectedMessage.id}
          />
        </div>
        <EmailViewerAttachments attachments={selectedMessage.attachments} />
        {/* Quick reply bar */}
        <div className="px-6 pb-6">
          <div className="flex items-center gap-2">
            <button onClick={() => openComposer('reply', selectedMessage)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/8 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/5 transition-all text-sm">
              <Reply className="w-3.5 h-3.5" /> Responder
            </button>
            <button onClick={() => openComposer('replyAll', selectedMessage)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/8 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/5 transition-all text-sm">
              <ReplyAll className="w-3.5 h-3.5" /> Responder a todos
            </button>
            <button onClick={() => openComposer('forward', selectedMessage)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/8 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/5 transition-all text-sm">
              <Forward className="w-3.5 h-3.5" /> Encaminhar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
