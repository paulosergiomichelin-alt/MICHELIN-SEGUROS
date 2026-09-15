import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEmail } from '../../../../contexts/EmailContext';
import { useEmailFolders } from '../../hooks/useEmailFolders';
import { EmailListItem } from './EmailListItem';
import { EmailListEmpty } from './EmailListEmpty';
import { EmailListFilters } from './EmailListFilters';
import { groupLabelForDate } from '../../utils/dateFormat';
import type { CachedEmail, EmailFilter } from '../../types/email.types';

type ListRow =
  | { type: 'header'; label: string }
  | { type: 'message'; message: CachedEmail };

const HEADER_HEIGHT = 30;
const MESSAGE_HEIGHT = 72;

export const EmailList: React.FC = () => {
  const { state, openMessage, loadMoreMessages, search, clearSearch, doAction, moveMessage } = useEmail();
  const {
    messages, selectedMessage, messagesLoading, currentFolderLabel,
    searchQuery, searchResults, isSearching, hasMore, accounts,
  } = state;

  const [filter, setFilter] = useState<EmailFilter>('all');
  const [localSearch, setLocalSearch] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folderLabel = currentFolderLabel;
  const { folders: realFolders } = useEmailFolders(state.selectedAccountId);

  const displayMessages = searchQuery
    ? searchResults
    : messages.filter(m => {
        if (filter === 'unread') return !m.isRead;
        if (filter === 'attachments') return m.hasAttachments;
        return true;
      });

  // Agrupamento por data ao estilo Outlook ("Semana Passada" etc.) — só faz sentido
  // navegando a pasta normalmente; resultado de busca fica em lista simples.
  const rows = useMemo<ListRow[]>(() => {
    if (searchQuery) return displayMessages.map(message => ({ type: 'message', message }));
    const out: ListRow[] = [];
    let lastLabel: string | null = null;
    for (const message of displayMessages) {
      const label = groupLabelForDate(message.date);
      if (label !== lastLabel) {
        out.push({ type: 'header', label });
        lastLabel = label;
      }
      out.push({ type: 'message', message });
    }
    return out;
  }, [displayMessages, searchQuery]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === 'header' ? HEADER_HEIGHT : MESSAGE_HEIGHT),
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
    <div className="flex flex-col h-full min-w-[300px] w-[380px] shrink-0 border-r border-slate-200 bg-white">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-slate-800 font-semibold text-sm">{folderLabel}</h2>
          {messagesLoading && (
            <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
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
              const row = rows[virtualItem.index];
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
                  {row.type === 'header' ? (
                    <div className="flex items-center px-4 h-[30px] bg-white">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {row.label}
                      </span>
                    </div>
                  ) : (
                    <EmailListItem
                      message={row.message}
                      isSelected={selectedMessage?.id === row.message.id}
                      folders={realFolders}
                      onClick={() => openMessage(row.message)}
                      onToggleRead={() => doAction(row.message.id, row.message.isRead ? 'unread' : 'read')}
                      onMoveTo={targetFolderId => moveMessage(row.message.id, targetFolderId)}
                      onNotSpam={() => doAction(row.message.id, 'notspam')}
                    />
                  )}
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
            <div className="w-4 h-4 border-2 border-slate-200 border-t-[#1B4D8F] rounded-full animate-spin" />
          </div>
        )}
        {!hasMore && displayMessages.length > 0 && !messagesLoading && (
          <p className="text-center text-slate-400 text-xs py-4">Fim das mensagens</p>
        )}
      </div>
    </div>
  );
};
