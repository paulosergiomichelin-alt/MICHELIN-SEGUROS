import React from 'react';

interface Props {
  onMouseDown: (e: React.MouseEvent) => void;
}

export const EmailPanelResizer: React.FC<Props> = ({ onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    className="w-1 cursor-col-resize bg-transparent hover:bg-blue-500/30 transition-colors active:bg-blue-500/50 shrink-0 h-full"
  />
);
