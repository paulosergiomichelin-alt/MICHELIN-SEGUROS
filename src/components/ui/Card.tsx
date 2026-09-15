import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps {
  title?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, icon: Icon, action, className, children }) => {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 p-5 shadow-sm', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <div className="flex items-center gap-2 text-slate-800">
              {Icon && <Icon className="w-4 h-4 text-gold-deep" />}
              <h3 className="text-[11px] font-black uppercase tracking-widest">{title}</h3>
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
};
