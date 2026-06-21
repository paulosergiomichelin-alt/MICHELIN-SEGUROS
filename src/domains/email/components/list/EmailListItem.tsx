import React from 'react';
import { Star, Paperclip } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../../lib/utils';
import type { CachedEmail } from '../../types/email.types';
import { SenderAvatar } from '../shared/SenderAvatar';
import { addrDisplay } from '../../utils/addressFormat';
import { fmtDate } from '../../utils/dateFormat';

interface Props {
  message: CachedEmail;
  isSelected: boolean;
  isChecked?: boolean;
  onClick: () => void;
  onCheck?: (checked: boolean) => void;
}

export const EmailListItem: React.FC<Props> = ({ message, isSelected, isChecked, onClick, onCheck }) => {
  return (
    <motion.button
      layout="position"
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-white/5 transition-colors group',
        isSelected
          ? 'bg-[#2d2d2d] border-l-2 border-l-blue-500'
          : 'hover:bg-[#252525]',
        !message.isRead && 'bg-[#1e1e2a]',
      )}
    >
      {/* Checkbox / unread dot */}
      <div className="mt-1.5 shrink-0 w-5 h-5 flex items-center justify-center">
        {onCheck ? (
          <input
            type="checkbox"
            checked={isChecked ?? false}
            onChange={e => { e.stopPropagation(); onCheck(e.target.checked); }}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded accent-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
            style={isChecked ? { opacity: 1 } : undefined}
          />
        ) : (
          !message.isRead && <div className="w-2 h-2 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Avatar */}
      <SenderAvatar from={message.from} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1 mb-0.5">
          <span className={cn(
            'text-sm truncate',
            message.isRead ? 'text-white/60 font-normal' : 'text-white/90 font-semibold',
          )}>
            {addrDisplay(message.from)}
          </span>
          <span className="text-[11px] text-white/30 shrink-0">{fmtDate(message.date)}</span>
        </div>
        <div className={cn(
          'text-xs truncate mb-0.5',
          message.isRead ? 'text-white/50' : 'text-white/80 font-medium',
        )}>
          {message.subject || '(sem assunto)'}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/30 truncate flex-1">{message.snippet}</span>
          <div className="flex items-center gap-1 shrink-0">
            {message.isStarred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
            {message.hasAttachments && <Paperclip className="w-3 h-3 text-white/30" />}
          </div>
        </div>
      </div>
    </motion.button>
  );
};
