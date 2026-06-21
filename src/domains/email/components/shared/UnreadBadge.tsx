import React from 'react';
import { cn } from '../../../../lib/utils';

interface Props {
  count: number;
  active?: boolean;
}

export const UnreadBadge: React.FC<Props> = ({ count, active }) => {
  if (count <= 0) return null;
  return (
    <span className={cn(
      'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0',
      active ? 'bg-blue-500/30 text-blue-200' : 'bg-blue-600/30 text-blue-400',
    )}>
      {count > 99 ? '99+' : count}
    </span>
  );
};
