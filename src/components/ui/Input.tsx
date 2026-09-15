import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  action?: { icon: React.ElementType; onClick: () => void; loading?: boolean };
}

export const Input: React.FC<InputProps> = ({ label, error, action, className, id, ...rest }) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <div className={cn('flex rounded-lg border overflow-hidden', error ? 'border-[#C0392B]' : 'border-slate-200 focus-within:border-[#1B4D8F]/60 focus-within:ring-2 focus-within:ring-[#1B4D8F]/15')}>
        <input
          id={inputId}
          className={cn(
            'w-full px-3 py-2 bg-white text-slate-800 text-[12px] font-medium outline-none placeholder:text-slate-300',
            className,
          )}
          {...rest}
        />
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="px-3 bg-slate-50 border-l border-slate-200 text-slate-500 hover:text-[#1B4D8F] transition-colors shrink-0"
          >
            <action.icon className="w-4 h-4" />
          </button>
        )}
      </div>
      {error && <p className="text-[9px] text-[#C0392B] font-bold ml-1">{error}</p>}
    </div>
  );
};
