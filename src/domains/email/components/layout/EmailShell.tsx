import React from 'react';
import { AnimatePresence } from 'motion/react';
import { EmailRibbon } from './EmailRibbon';
import { EmailSidebar } from './EmailSidebar';
import { EmailPanelResizer } from './EmailPanelResizer';
import { EmailList } from '../list/EmailList';
import { EmailViewer } from '../viewer/EmailViewer';
import { EmailComposer } from '../../EmailComposer';
import { useEmail } from '../../../../contexts/EmailContext';
import { useColumnResize } from '../../hooks/useColumnResize';

export const EmailShell: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { state } = useEmail();
  const { composerOpen } = state;
  const sidebarResizer = useColumnResize(200, 160, 280);
  const listResizer = useColumnResize(380, 280, 560);

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
};
