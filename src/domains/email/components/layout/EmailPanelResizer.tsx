import React from 'react';

interface Props {
  onMouseDown: (e: React.MouseEvent) => void;
}

export const EmailPanelResizer: React.FC<Props> = ({ onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    className="w-1 cursor-col-resize bg-transparent hover:bg-[#1B4D8F]/30 transition-colors active:bg-[#1B4D8F]/50 shrink-0 h-full"
  />
);
