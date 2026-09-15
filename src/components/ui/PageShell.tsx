import React from 'react';
import { PageHeader, PageHeaderProps } from './PageHeader';

export interface PageShellProps extends Partial<PageHeaderProps> {
  title: string;
  children: React.ReactNode;
}

export const PageShell: React.FC<PageShellProps> = ({ title, subtitle, icon, actions, children }) => (
  <div className="min-h-full bg-slate-50">
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader title={title} subtitle={subtitle} icon={icon} actions={actions} />
      {children}
    </div>
  </div>
);
