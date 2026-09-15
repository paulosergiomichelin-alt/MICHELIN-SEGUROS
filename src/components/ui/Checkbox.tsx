import React from 'react';
import { cn } from '../../lib/utils';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, className, id, ...rest }) => {
  const checkboxId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <label htmlFor={checkboxId} className={cn('flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer', className)}>
      <input id={checkboxId} type="checkbox" className="w-3.5 h-3.5 accent-[#1B4D8F]" {...rest} />
      {label}
    </label>
  );
};
