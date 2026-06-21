import React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { EmailFilter } from '../../types/email.types';

interface Props {
  filter: EmailFilter;
  onFilterChange: (f: EmailFilter) => void;
  onSearch: (q: string) => void;
  onClear: () => void;
  searchValue: string;
  onSearchValueChange: (v: string) => void;
}

const FILTER_LABELS: Record<EmailFilter, string> = {
  all: 'Todos',
  unread: 'Não lidos',
  attachments: 'Com anexo',
};

export const EmailListFilters: React.FC<Props> = ({
  filter, onFilterChange, onSearch, onClear, searchValue, onSearchValueChange,
}) => {
  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
        <input
          type="text"
          value={searchValue}
          onChange={e => onSearchValueChange(e.target.value)}
          placeholder="Buscar..."
          className="w-full bg-white/5 border border-white/8 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white/70 placeholder:text-white/25 outline-none focus:border-blue-500/40 focus:bg-white/8 transition-all"
        />
        {searchValue && (
          <button
            onClick={() => { onSearchValueChange(''); onClear(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex gap-1 pt-2">
        {(['all', 'unread', 'attachments'] as EmailFilter[]).map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] transition-colors',
              filter === f
                ? 'bg-blue-600/30 text-blue-300 font-medium'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5',
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>
    </>
  );
};
