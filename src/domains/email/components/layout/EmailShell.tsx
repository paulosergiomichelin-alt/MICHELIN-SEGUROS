import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { EmailRibbon } from './EmailRibbon';
import { EmailSidebar } from './EmailSidebar';
import { EmailPanelResizer } from './EmailPanelResizer';
import { EmailList } from '../list/EmailList';
import { EmailViewer } from '../viewer/EmailViewer';
import { EmailComposer } from '../../EmailComposer';
import { useEmail } from '../../../../contexts/EmailContext';
import { useColumnResize } from '../../hooks/useColumnResize';
import { useViewport } from '../../../../hooks/useAppContexts';

type MobilePane = 'sidebar' | 'list' | 'viewer';

export const EmailShell: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { state, closeComposer } = useEmail();
  const { composerOpen, selectedMessage, currentFolderLabel } = state;
  const sidebarResizer = useColumnResize(200, 160, 280);
  const listResizer = useColumnResize(380, 280, 560);
  const { isMobile } = useViewport();

  const [mobilePane, setMobilePane] = useState<MobilePane>('sidebar');

  // Acompanha as transições que o próprio EmailContext já faz — abrir uma mensagem ou o
  // composer avança pro visualizador; nunca volta sozinho (só os botões "voltar" abaixo
  // mudam de tela pra trás), senão reabrir a mesma pasta/mensagem prenderia o usuário lá.
  useEffect(() => {
    if (isMobile && (composerOpen || selectedMessage)) setMobilePane('viewer');
  }, [isMobile, composerOpen, selectedMessage]);

  const isFirstFolderRender = useRef(true);
  useEffect(() => {
    // Ignora o valor inicial no mount — só reage a troca de pasta feita pelo usuário,
    // senão a tela pularia direto de "Pastas" pra "Lista" antes de qualquer escolha.
    if (isFirstFolderRender.current) { isFirstFolderRender.current = false; return; }
    if (isMobile) setMobilePane((prev) => (prev === 'sidebar' ? 'list' : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderLabel]);

  if (!isMobile) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <EmailRibbon />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div style={{ width: sidebarResizer.width }} className="shrink-0 h-full">
            <EmailSidebar onOpenSettings={onOpenSettings} />
          </div>
          <EmailPanelResizer onMouseDown={sidebarResizer.onMouseDown} />
          <div style={{ width: listResizer.width }} className="shrink-0 h-full">
            <EmailList />
          </div>
          <EmailPanelResizer onMouseDown={listResizer.onMouseDown} />
          <AnimatePresence mode="wait">
            {composerOpen
              ? <EmailComposer key="composer" />
              : <EmailViewer key="viewer" />
            }
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // Celular: uma coluna por vez (pastas -> lista -> mensagem), com barra de voltar —
  // mesmo padrão de navegação já usado em WhatsAppInboxPage.tsx pra conversas.
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <EmailRibbon />
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {mobilePane === 'sidebar' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <EmailSidebar onOpenSettings={onOpenSettings} />
          </div>
        )}

        {mobilePane === 'list' && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => setMobilePane('sidebar')}
              className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold text-white/50 uppercase tracking-widest shrink-0 border-b border-white/5"
            >
              <ChevronLeft className="w-4 h-4" /> Pastas
            </button>
            <div className="flex-1 min-h-0 overflow-hidden"><EmailList /></div>
          </div>
        )}

        {mobilePane === 'viewer' && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => { closeComposer(); setMobilePane('list'); }}
              className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold text-white/50 uppercase tracking-widest shrink-0 border-b border-white/5"
            >
              <ChevronLeft className="w-4 h-4" /> {currentFolderLabel}
            </button>
            <div className="flex-1 min-h-0 overflow-hidden">
              <AnimatePresence mode="wait">
                {composerOpen
                  ? <EmailComposer key="composer" />
                  : <EmailViewer key="viewer" />
                }
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
