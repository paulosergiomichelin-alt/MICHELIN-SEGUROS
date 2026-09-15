import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ModalProps {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ title, onClose, footer, className, children }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm cursor-pointer" onClick={onClose} />
    <div className={cn('relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
        <h2 className="text-[12px] font-black uppercase tracking-widest text-slate-800">{title}</h2>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 overflow-y-auto">{children}</div>
      {footer && <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">{footer}</div>}
    </div>
  </div>
);
