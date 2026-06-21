import React from 'react';
import { cn } from '../../../../lib/utils';
import type { EmailAddress } from '../../types/email.types';
import { getAvatarColor, getInitials } from '../../utils/avatarColor';

interface Props {
  from?: EmailAddress;
  size?: 'sm' | 'md' | 'lg';
}

export const SenderAvatar: React.FC<Props> = ({ from, size = 'md' }) => {
  const initials = getInitials(from?.name, from?.email);
  const color = getAvatarColor(from?.email ?? '');
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-sm';
  return (
    <div className={cn(dim, color, 'rounded-full shrink-0 flex items-center justify-center font-bold text-white')}>
      {initials}
    </div>
  );
};
