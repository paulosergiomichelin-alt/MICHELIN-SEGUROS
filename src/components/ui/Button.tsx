import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ElementType;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[#1B4D8F] text-white hover:bg-[#153E73] shadow-sm shadow-[#1B4D8F]/20',
  secondary: 'bg-white text-slate-600 border border-slate-200 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F]',
  danger: 'bg-[#C0392B] text-white hover:bg-[#a53225]',
  ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[9px]',
  md: 'px-5 py-2.5 text-[10px]',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}) => {
  return (
    <button
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        Icon && <Icon className="w-3.5 h-3.5" />
      )}
      {children}
    </button>
  );
};
