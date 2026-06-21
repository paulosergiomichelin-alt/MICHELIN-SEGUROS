import React, { useState, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEmail } from '../../../../contexts/EmailContext';
import { EmailListItem } from './EmailListItem';
import { EmailListEmpty } from './EmailListEmpty';
import { EmailListFilters } from './EmailListFilters';
import type { EmailFilter } from '../../types/email.types';

const FOLDERS_LABEL: Record<string, string> = {
  inbox: 'Caixa de Entrada',
  sent: 'Enviados',
  drafts: 'Rascunhos',
  archived: 'Arquivados',
  spam: 'Spam',
  trash: 'Lixeira',
};

export const EmailList: React.FC = () => {
  const { state, openMessage, loadMoreMessages, search, clearSearch } = useEmail();
  const {
    messages, selectedMessage, messagesLoading, currentFolder,
    searchQuery, searchResults, isSearching, hasMore, accounts,
  } = state;

  const [filter, setFilter] = useState<EmailFilter>('all');
  const [localSearch, setLocalSearch] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folderLabel = FOLDERS_LABEL[currentFolder] ?? currentFolder;

  const displayMessages = searchQuery
    ? searchResults
    : messages.filter(m => {
        if (filter === 'unread') return !m.isRead;
        if (filter === 'attachments') return m.hasAttachments;
        return true;
      });

  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  const handleSearchValueChange = (v: string) => {
    setLocalSearch(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!v.trim()) { clearSearch(); return; }
    searchDebounceRef.current = setTimeout(() => search(v), 400);
  };

  // IntersectionObserver sentinel for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !messagesLoading) {
          loadMoreMessages();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, messagesLoading, loadMoreMessages]);

  const hasNoAccounts = accounts.length === 0 && !messagesLoading;

  return (
    <div className="flex flex-col h-full min-w-[300px] w-[380px] shrink-0 border-r border-white/5 bg-[#141414]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white/80 font-semibold text-sm">{folderLabel}</h2>
          {messagesLoading && (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          )}
        </div>
        <EmailListFilters
          filter={filter}
          onFilterChange={setFilter}
          onSearch={search}
          onClear={clearSearch}
          searchValue={localSearch}
          onSearchValueChange={handleSearchValueChange}
        />
      </div>

      {/* Messages list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {hasNoAccounts ? (
          <EmailListEmpty type="no-accounts" />
        ) : isSearching ? (
          <EmailListEmpty type="searching" />
        ) : displayMessages.length === 0 && !messagesLoading ? (
          <EmailListEmpty type={searchQuery ? 'no-results' : 'empty-folder'} />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualItem => {
              const msg = displayMessages[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <EmailListItem
                    message={msg}
                    isSelected={selectedMessage?.id === msg.id}
                    onClick={() => openMessage(msg)}
                  />
                </div>
              );
            })}
            {/* Sentinel for infinite scroll */}
            <div
              ref={sentinelRef}
              style={{
                position: 'absolute',
                top: Math.max(0, virtualizer.getTotalSize() - 100),
                left: 0,
                width: '100%',
                height: 4,
              }}
            />
          </div>
        )}
        {messagesLoading && displayMessages.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
          </div>
        )}
        {!hasMore && displayMessages.length > 0 && !messagesLoading && (
          <p className="text-center text-white/20 text-xs py-4">Fim das mensagens</p>
        )}
      </div>
    </div>
  );
};
