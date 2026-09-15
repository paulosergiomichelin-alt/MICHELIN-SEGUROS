import React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-[#E4F5EA] text-[#1F8A4C]',
  warning: 'bg-[#FFF3DC] text-[#B8860B]',
  danger: 'bg-[#FDE4E4] text-[#C0392B]',
  neutral: 'bg-slate-100 text-slate-600',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', children, className }) => (
  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider', variantClasses[variant], className)}>
    {children}
  </span>
);
