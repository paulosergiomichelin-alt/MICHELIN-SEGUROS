import React from 'react';

export interface PageHeaderProps {
  icon?: React.ElementType;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon: Icon, title, subtitle, actions }) => (
  <div className="flex items-center justify-between flex-wrap gap-3">
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-gold-deep" />
        </div>
      )}
      <div>
        <h1 className="text-[15px] font-black text-slate-900 uppercase tracking-widest">{title}</h1>
        {subtitle && <p className="text-[10px] text-slate-500 font-medium">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);
