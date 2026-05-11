import React from 'react';
import { cn } from '../lib/utils';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-slate-200 rounded-md", className)} />
);

export const LeadSkeleton = () => (
  <div className="p-5 border-b border-slate-50 last:border-0">
    <div className="flex justify-between items-start mb-3">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
    <div className="flex gap-2">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-12" />
    </div>
  </div>
);

export const LeadRowSkeleton = () => (
  <tr className="border-b border-slate-50">
    <td className="px-3 py-4"><Skeleton className="h-4 w-32" /></td>
    <td className="px-3 py-4"><Skeleton className="h-4 w-40" /></td>
    <td className="px-3 py-4"><Skeleton className="h-6 w-24 rounded-full" /></td>
    <td className="px-3 py-4"><Skeleton className="h-4 w-16 mx-auto" /></td>
    <td className="px-3 py-4 text-right"><Skeleton className="h-8 w-24 ml-auto" /></td>
  </tr>
);
