import React from 'react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({ label, error, className, id, children, ...rest }) => {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full px-3 py-2 bg-white border rounded-lg text-slate-800 text-[12px] font-medium outline-none transition-all',
          error ? 'border-[#C0392B]' : 'border-slate-200 focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="text-[9px] text-[#C0392B] font-bold ml-1">{error}</p>}
    </div>
  );
};
