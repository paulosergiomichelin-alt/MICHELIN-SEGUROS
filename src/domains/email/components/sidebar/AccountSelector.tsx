import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../../lib/utils';
import type { EmailAccount } from '../../types/email.types';

interface Props {
  accounts: EmailAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
}

export const AccountSelector: React.FC<Props> = ({ accounts, selectedAccountId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.id === selectedAccountId);

  if (accounts.length <= 1) return null;

  return (
    <div className="px-3 pb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 transition-colors text-xs text-white/60"
      >
        <span className="truncate">{selected?.email ?? 'Selecionar conta'}</span>
        <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-1 rounded-lg bg-[#1a1a1a] border border-white/10 overflow-hidden z-10"
          >
            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => { onSelect(acc.id); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left',
                  acc.id === selectedAccountId
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/80',
                )}
              >
                {acc.id === selectedAccountId && <Check className="w-3 h-3 shrink-0" />}
                <span className="truncate">{acc.email}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
