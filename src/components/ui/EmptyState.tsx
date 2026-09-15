import React from 'react';

export interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
      <Icon className="w-5 h-5 text-slate-400" />
    </div>
    <p className="text-[12px] font-black text-slate-700 uppercase tracking-wide">{title}</p>
    {description && <p className="text-[10px] text-slate-400 font-medium mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
