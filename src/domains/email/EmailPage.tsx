import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  Mail,
  Inbox,
  Send,
  Archive,
  Trash2,
  AlertCircle,
  Star,
  Reply,
  Forward,
  MoreVertical,
  Search,
  RefreshCw,
  Plus,
  Paperclip,
  X,
  ChevronDown,
  Check,
  ReplyAll,
  MailOpen,
  FileText,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { useEmail } from '../../contexts/EmailContext';
import { CachedEmail, EmailAddress } from '../../services/EmailService';
import { EmailComposer } from './EmailComposer';
import { usePermissions } from '../../contexts/PermissionsContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Ontem';
    if (differenceInDays(new Date(), d) < 7) return format(d, 'EEE', { locale: ptBR });
    return format(d, 'dd/MM/yy');
  } catch {
    return '';
  }
}

function fmtFull(iso?: string): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

function addrDisplay(addr?: EmailAddress): string {
  if (!addr) return '';
  return addr.name ? `${addr.name}` : addr.email;
}

function addrFull(addr?: EmailAddress): string {
  if (!addr) return '';
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function getInitials(name?: string, email?: string): string {
  const src = name || email || '?';
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, 'void:');
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-purple-600', 'bg-green-600', 'bg-rose-600',
  'bg-amber-600', 'bg-teal-600', 'bg-indigo-600', 'bg-orange-600',
];

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SenderAvatar: React.FC<{ from?: EmailAddress; size?: 'sm' | 'md' }> = ({ from, size = 'md' }) => {
  const initials = getInitials(from?.name, from?.email);
  const color = getAvatarColor(from?.email ?? '');
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={cn(dim, color, 'rounded-full shrink-0 flex items-center justify-center font-bold text-white')}>
      {initials}
    </div>
  );
};

// ─── Folder definitions ────────────────────────────────────────────────────────

const FOLDERS = [
  { id: 'inbox', label: 'Caixa de Entrada', icon: Inbox },
  { id: 'sent', label: 'Enviados', icon: Send },
  { id: 'drafts', label: 'Rascunhos', icon: FileText },
  { id: 'archived', label: 'Arquivados', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertCircle },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
];

// ─── EmailFolderSidebar ───────────────────────────────────────────────────────

const EmailFolderSidebar: React.FC = () => {
  const { state, changeFolder, selectAccount, triggerSync, openComposer } = useEmail();
  const { currentFolder, accounts, selectedAccountId, syncing, unreadByFolder } = state;
  const [accountDropdown, setAccountDropdown] = useState(false);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <aside className="w-[160px] shrink-0 bg-[#111111] border-r border-white/5 flex flex-col h-full overflow-hidden">
      {/* New Email button */}
      <div className="p-3">
        <button
          onClick={() => openComposer('new')}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus className="w-4 h-4" />
          Novo E-mail
        </button>
      </div>

      {/* Account selector */}
      {accounts.length > 1 && (
        <div className="px-3 pb-2">
          <button
            onClick={() => setAccountDropdown(!accountDropdown)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 transition-colors text-xs text-white/60"
          >
            <span className="truncate">{selectedAccount?.email ?? 'Selecionar conta'}</span>
            <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform', accountDropdown && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {accountDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-1 rounded-lg bg-[#1a1a1a] border border-white/10 overflow-hidden z-10"
              >
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => { selectAccount(acc.id); setAccountDropdown(false); }}
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
      )}

      {/* Folders */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 py-1">
        {FOLDERS.map(folder => {
          const Icon = folder.icon;
          const unread = unreadByFolder[folder.id] ?? 0;
          const isActive = currentFolder === folder.id;
          return (
            <button
              key={folder.id}
              onClick={() => changeFolder(folder.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all group',
                isActive
                  ? 'bg-blue-600/20 text-blue-300 font-medium'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80',
              )}
            >
              <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-blue-400' : 'group-hover:text-white/70')} />
              <span className="flex-1 text-left truncate">{folder.label}</span>
              {unread > 0 && (
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0',
                  isActive ? 'bg-blue-500/30 text-blue-200' : 'bg-blue-600/30 text-blue-400',
                )}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sync button */}
      <div className="p-2 border-t border-white/5">
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all text-xs disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>
    </aside>
  );
};

// ─── EmailListItem ────────────────────────────────────────────────────────────

const EmailListItem: React.FC<{
  message: CachedEmail;
  isSelected: boolean;
  onClick: () => void;
}> = ({ message, isSelected, onClick }) => {
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
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0 w-2 h-2 flex items-center justify-center">
        {!message.isRead && (
          <div className="w-2 h-2 rounded-full bg-blue-500" />
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

// ─── EmailList ────────────────────────────────────────────────────────────────

const EmailList: React.FC = () => {
  const { state, openMessage, loadMoreMessages, search, clearSearch } = useEmail();
  const {
    messages, selectedMessage, messagesLoading, currentFolder,
    searchQuery, searchResults, isSearching, hasMore, accounts, selectedAccountId,
  } = state;

  const [filter, setFilter] = useState<'all' | 'unread' | 'attachments'>('all');
  const [localSearch, setLocalSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folderLabel = FOLDERS.find(f => f.id === currentFolder)?.label ?? currentFolder;

  const displayMessages = searchQuery
    ? searchResults
    : messages.filter(m => {
        if (filter === 'unread') return !m.isRead;
        if (filter === 'attachments') return m.hasAttachments;
        return true;
      });

  const handleSearchInput = (v: string) => {
    setLocalSearch(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!v.trim()) {
      clearSearch();
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      search(v);
    }, 400);
  };

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadMoreMessages();
    }
  }, [loadMoreMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={localSearch}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-white/5 border border-white/8 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white/70 placeholder:text-white/25 outline-none focus:border-blue-500/40 focus:bg-white/8 transition-all"
          />
          {localSearch && (
            <button
              onClick={() => { setLocalSearch(''); clearSearch(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex gap-1 px-4 pb-2">
        {(['all', 'unread', 'attachments'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] transition-colors',
              filter === f
                ? 'bg-blue-600/30 text-blue-300 font-medium'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5',
            )}
          >
            {f === 'all' ? 'Todos' : f === 'unread' ? 'Não lidos' : 'Com anexo'}
          </button>
        ))}
      </div>

      {/* Messages list */}
      <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {hasNoAccounts ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
            <Mail className="w-10 h-10 text-white/10" />
            <p className="text-white/30 text-sm">Nenhuma conta conectada</p>
          </div>
        ) : isSearching ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : displayMessages.length === 0 && !messagesLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3 py-10">
            <MailOpen className="w-10 h-10 text-white/10" />
            <p className="text-white/30 text-sm">
              {searchQuery ? 'Nenhum resultado encontrado' : 'Nenhuma mensagem'}
            </p>
          </div>
        ) : (
          <>
            {displayMessages.map(msg => (
              <EmailListItem
                key={msg.id}
                message={msg}
                isSelected={selectedMessage?.id === msg.id}
                onClick={() => openMessage(msg)}
              />
            ))}
            {messagesLoading && (
              <div className="flex items-center justify-center py-4">
                <div className="w-4 h-4 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
              </div>
            )}
            {!hasMore && displayMessages.length > 0 && (
              <p className="text-center text-white/20 text-xs py-4">Fim das mensagens</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── EmailViewer ──────────────────────────────────────────────────────────────

const EmailViewer: React.FC = () => {
  const { state, doAction, openComposer } = useEmail();
  const { selectedMessage } = state;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(300);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!iframeRef.current || !selectedMessage?.bodyHtml) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setIframeHeight(h + 32);
      }
    });

    const iframe = iframeRef.current;
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          observer.observe(doc.body);
          setIframeHeight(doc.body.scrollHeight + 32);
        }
      } catch {
        // cross-origin — use fixed height
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      observer.disconnect();
    };
  }, [selectedMessage?.id, selectedMessage?.bodyHtml]);

  if (!selectedMessage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#161616] gap-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
          <Mail className="w-8 h-8 text-white/15" />
        </div>
        <p className="text-white/25 text-sm">Selecione um e-mail para ler</p>
      </div>
    );
  }

  const sanitized = selectedMessage.bodyHtml ? sanitizeHtml(selectedMessage.bodyHtml) : null;

  const handleAction = (action: string) => {
    doAction(selectedMessage.id, action);
    setMoreOpen(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#161616] min-w-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-white/90 font-semibold text-base leading-snug flex-1">
            {selectedMessage.subject || '(sem assunto)'}
          </h1>
          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              title="Responder"
              onClick={() => openComposer('reply', selectedMessage)}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
            >
              <Reply className="w-4 h-4" />
            </button>
            <button
              title="Responder a todos"
              onClick={() => openComposer('replyAll', selectedMessage)}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
            >
              <ReplyAll className="w-4 h-4" />
            </button>
            <button
              title="Encaminhar"
              onClick={() => openComposer('forward', selectedMessage)}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
            >
              <Forward className="w-4 h-4" />
            </button>
            <button
              title={selectedMessage.isStarred ? 'Remover estrela' : 'Marcar com estrela'}
              onClick={() => handleAction(selectedMessage.isStarred ? 'unstar' : 'star')}
              className={cn(
                'p-2 rounded-lg transition-colors',
                selectedMessage.isStarred
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                  : 'text-white/40 hover:text-amber-400 hover:bg-amber-500/10',
              )}
            >
              <Star className={cn('w-4 h-4', selectedMessage.isStarred && 'fill-amber-400')} />
            </button>
            <button
              title="Arquivar"
              onClick={() => handleAction('archive')}
              className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
            >
              <Archive className="w-4 h-4" />
            </button>
            <button
              title="Mover para lixeira"
              onClick={() => handleAction('trash')}
              className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* More options */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    className="absolute right-0 top-full mt-1 w-48 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden"
                  >
                    {[
                      { label: selectedMessage.isRead ? 'Marcar como não lido' : 'Marcar como lido', action: selectedMessage.isRead ? 'unread' : 'read' },
                      { label: 'Mover para spam', action: 'spam' },
                      { label: 'Restaurar', action: 'restore' },
                    ].map(item => (
                      <button
                        key={item.action}
                        onClick={() => handleAction(item.action)}
                        className="w-full text-left px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white/90 transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* From/To/Date */}
        <div className="flex items-start gap-3">
          <SenderAvatar from={selectedMessage.from} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-white/80 font-medium text-sm">{addrDisplay(selectedMessage.from)}</span>
                <span className="text-white/30 text-xs ml-2">{`<${selectedMessage.from?.email ?? ''}>`}</span>
              </div>
              <span className="text-white/30 text-xs shrink-0">{fmtFull(selectedMessage.date)}</span>
            </div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-xs text-white/30 hover:text-white/50 transition-colors mt-0.5"
            >
              Para: {(selectedMessage.to ?? []).map(addrDisplay).join(', ')}
              <ChevronDown className={cn('w-3 h-3 transition-transform', showDetails && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 space-y-1">
                    <p className="text-xs text-white/40">
                      <span className="text-white/25">De:</span> {addrFull(selectedMessage.from)}
                    </p>
                    <p className="text-xs text-white/40">
                      <span className="text-white/25">Para:</span> {(selectedMessage.to ?? []).map(addrFull).join(', ')}
                    </p>
                    {selectedMessage.cc && selectedMessage.cc.length > 0 && (
                      <p className="text-xs text-white/40">
                        <span className="text-white/25">CC:</span> {selectedMessage.cc.map(addrFull).join(', ')}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-6 py-4">
          {sanitized ? (
            <iframe
              ref={iframeRef}
              srcDoc={`<!DOCTYPE html><html><head><style>
                body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                       color: rgba(255,255,255,0.75); background: transparent; font-size: 14px; line-height: 1.6; word-break: break-word; }
                a { color: #60a5fa; }
                img { max-width: 100%; height: auto; }
                blockquote { border-left: 3px solid rgba(255,255,255,0.15); margin: 0; padding-left: 12px; color: rgba(255,255,255,0.4); }
                pre, code { background: rgba(255,255,255,0.05); border-radius: 4px; padding: 2px 6px; font-size: 13px; }
              </style></head><body>${sanitized}</body></html>`}
              sandbox="allow-same-origin allow-popups"
              className="w-full border-0 bg-transparent"
              style={{ height: iframeHeight, minHeight: 200 }}
              title="Email body"
            />
          ) : (
            <pre className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap font-sans">
              {selectedMessage.bodyText || selectedMessage.snippet || '(Mensagem sem conteúdo)'}
            </pre>
          )}
        </div>

        {/* Attachments */}
        {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
          <div className="px-6 pb-6">
            <div className="border-t border-white/5 pt-4">
              <p className="text-xs text-white/30 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Paperclip className="w-3 h-3" />
                {selectedMessage.attachments.length} anexo{selectedMessage.attachments.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedMessage.attachments.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/8 group hover:border-white/15 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-white/40" />
                    <div>
                      <p className="text-xs text-white/70 max-w-[160px] truncate">{att.filename}</p>
                      <p className="text-[10px] text-white/30">{att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}</p>
                    </div>
                    {att.downloadUrl && (
                      <a
                        href={att.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white/70"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick reply bar */}
        <div className="px-6 pb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => openComposer('reply', selectedMessage)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/8 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/5 transition-all text-sm"
            >
              <Reply className="w-3.5 h-3.5" />
              Responder
            </button>
            <button
              onClick={() => openComposer('replyAll', selectedMessage)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/8 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/5 transition-all text-sm"
            >
              <ReplyAll className="w-3.5 h-3.5" />
              Responder a todos
            </button>
            <button
              onClick={() => openComposer('forward', selectedMessage)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/8 text-white/50 hover:text-white/80 hover:border-white/20 hover:bg-white/5 transition-all text-sm"
            >
              <Forward className="w-3.5 h-3.5" />
              Encaminhar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── NoAccountsOnboarding ─────────────────────────────────────────────────────

const NoAccountsOnboarding: React.FC = () => {
  const { userProfile } = usePermissions();
  const uid = userProfile?.uid ?? '';
  // Use clean URL without OAuth params to avoid duplicating params on re-connect
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  const returnUrl = encodeURIComponent(cleanUrl);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0f0f0f] gap-6 p-8">
      <div className="w-20 h-20 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
        <Mail className="w-10 h-10 text-blue-400" />
      </div>
      <div className="text-center">
        <h2 className="text-white/80 text-xl font-semibold mb-2">Conecte sua conta de e-mail</h2>
        <p className="text-white/40 text-sm max-w-md">
          Conecte uma conta Gmail ou Microsoft Outlook para começar a gerenciar seus e-mails diretamente no CRM.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={uid ? `/api/email/auth/gmail/init?userId=${encodeURIComponent(uid)}&returnUrl=${returnUrl}` : '#'}
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white/70 hover:text-white/90"
        >
          <svg viewBox="0 0 48 48" className="w-5 h-5">
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          </svg>
          Conectar Gmail
        </a>
        <a
          href={uid ? `/api/email/auth/microsoft/init?userId=${encodeURIComponent(uid)}&returnUrl=${returnUrl}` : '#'}
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-white/70 hover:text-white/90"
        >
          <svg viewBox="0 0 48 48" className="w-5 h-5">
            <path fill="#F25022" d="M22 22H2V2h20z"/>
            <path fill="#7FBA00" d="M46 22H26V2h20z"/>
            <path fill="#00A4EF" d="M22 46H2V26h20z"/>
            <path fill="#FFB900" d="M46 46H26V26h20z"/>
          </svg>
          Conectar Outlook
        </a>
      </div>
    </div>
  );
};

// ─── EmailPage ────────────────────────────────────────────────────────────────

export const EmailPage: React.FC = () => {
  const { state } = useEmail();
  const { accounts, loading, selectedMessage } = state;
  const [mobileView, setMobileView] = useState<'list' | 'viewer'>('list');

  // On mobile, switch to viewer when message is selected
  useEffect(() => {
    if (selectedMessage) setMobileView('viewer');
  }, [selectedMessage]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f0f0f]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-white/30 text-sm">Carregando e-mails...</p>
        </div>
      </div>
    );
  }

  const noAccounts = accounts.length === 0;

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] overflow-hidden">
      {/* Desktop: always show sidebar */}
      <div className="hidden md:flex h-full">
        <EmailFolderSidebar />
      </div>

      {/* Mobile: folder sidebar only when on list view */}
      <div className={cn('md:hidden h-full', mobileView === 'list' ? 'flex' : 'hidden')}>
        <EmailFolderSidebar />
      </div>

      {noAccounts ? (
        <NoAccountsOnboarding />
      ) : (
        <>
          {/* Email list */}
          <div className={cn(
            'md:flex h-full',
            mobileView === 'list' ? 'flex' : 'hidden',
          )}>
            <EmailList />
          </div>

          {/* Email viewer */}
          <div className={cn(
            'flex-1 md:flex h-full',
            mobileView === 'viewer' ? 'flex' : 'hidden md:flex',
          )}>
            {/* Mobile back button */}
            {mobileView === 'viewer' && (
              <div className="md:hidden absolute top-4 left-4 z-10">
                <button
                  onClick={() => setMobileView('list')}
                  className="flex items-center gap-1.5 text-blue-400 text-sm"
                >
                  ← Voltar
                </button>
              </div>
            )}
            <EmailViewer />
          </div>
        </>
      )}

      {/* Composer overlay */}
      <EmailComposer />
    </div>
  );
};
