import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { usePermissions } from './PermissionsContext';
import {
  EmailService,
  CachedEmail,
  EmailAccount,
  EmailStats,
  EmailSettings,
} from '../services/EmailService';

// ─── State ────────────────────────────────────────────────────────────────────

interface EmailState {
  accounts: EmailAccount[];
  selectedAccountId: string | null;
  currentFolder: string;
  messages: CachedEmail[];
  selectedMessage: CachedEmail | null;
  loading: boolean;
  messagesLoading: boolean;
  syncing: boolean;
  stats: EmailStats;
  searchQuery: string;
  searchResults: CachedEmail[];
  isSearching: boolean;
  settings: EmailSettings | null;
  page: number;
  hasMore: boolean;
  composerOpen: boolean;
  composerMode: 'new' | 'reply' | 'replyAll' | 'forward';
  composerReplyTo: CachedEmail | null;
  unreadByFolder: Record<string, number>;
  error: string | null;
}

const DEFAULT_STATS: EmailStats = {
  inbox: 0,
  unread: 0,
  sent: 0,
  drafts: 0,
  archived: 0,
  spam: 0,
  trash: 0,
};

const initialState: EmailState = {
  accounts: [],
  selectedAccountId: null,
  currentFolder: 'inbox',
  messages: [],
  selectedMessage: null,
  loading: true,
  messagesLoading: false,
  syncing: false,
  stats: DEFAULT_STATS,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  settings: null,
  page: 1,
  hasMore: false,
  composerOpen: false,
  composerMode: 'new',
  composerReplyTo: null,
  unreadByFolder: {},
  error: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type EmailAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_MESSAGES_LOADING'; payload: boolean }
  | { type: 'SET_ACCOUNTS'; payload: EmailAccount[] }
  | { type: 'SET_SELECTED_ACCOUNT'; payload: string | null }
  | { type: 'SET_FOLDER'; payload: string }
  | { type: 'SET_MESSAGES'; payload: { messages: CachedEmail[]; page: number; hasMore: boolean } }
  | { type: 'APPEND_MESSAGES'; payload: { messages: CachedEmail[]; page: number; hasMore: boolean } }
  | { type: 'SET_SELECTED_MESSAGE'; payload: CachedEmail | null }
  | { type: 'UPDATE_MESSAGE'; payload: Partial<CachedEmail> & { id: string } }
  | { type: 'PREPEND_MESSAGE'; payload: CachedEmail }
  | { type: 'REMOVE_MESSAGE'; payload: string }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'SET_STATS'; payload: EmailStats }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_RESULTS'; payload: CachedEmail[] }
  | { type: 'SET_IS_SEARCHING'; payload: boolean }
  | { type: 'SET_SETTINGS'; payload: EmailSettings }
  | { type: 'OPEN_COMPOSER'; payload: { mode: EmailState['composerMode']; replyTo?: CachedEmail | null } }
  | { type: 'CLOSE_COMPOSER' }
  | { type: 'SET_UNREAD_BY_FOLDER'; payload: Record<string, number> }
  | { type: 'INCREMENT_UNREAD'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null };

function emailReducer(state: EmailState, action: EmailAction): EmailState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_MESSAGES_LOADING':
      return { ...state, messagesLoading: action.payload };
    case 'SET_ACCOUNTS':
      return { ...state, accounts: action.payload };
    case 'SET_SELECTED_ACCOUNT':
      return { ...state, selectedAccountId: action.payload };
    case 'SET_FOLDER':
      return { ...state, currentFolder: action.payload, messages: [], page: 1, hasMore: false, selectedMessage: null, searchQuery: '', searchResults: [] };
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload.messages, page: action.payload.page, hasMore: action.payload.hasMore };
    case 'APPEND_MESSAGES':
      return {
        ...state,
        messages: [...state.messages, ...action.payload.messages],
        page: action.payload.page,
        hasMore: action.payload.hasMore,
      };
    case 'SET_SELECTED_MESSAGE': {
      const msg = action.payload;
      if (msg && !msg.isRead) {
        return {
          ...state,
          selectedMessage: { ...msg, isRead: true },
          messages: state.messages.map(m => m.id === msg.id ? { ...m, isRead: true } : m),
        };
      }
      return { ...state, selectedMessage: action.payload };
    }
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(m => m.id === action.payload.id ? { ...m, ...action.payload } : m),
        selectedMessage: state.selectedMessage?.id === action.payload.id
          ? { ...state.selectedMessage, ...action.payload }
          : state.selectedMessage,
      };
    case 'PREPEND_MESSAGE':
      return { ...state, messages: [action.payload, ...state.messages] };
    case 'REMOVE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter(m => m.id !== action.payload),
        selectedMessage: state.selectedMessage?.id === action.payload ? null : state.selectedMessage,
      };
    case 'SET_SYNCING':
      return { ...state, syncing: action.payload };
    case 'SET_STATS':
      return { ...state, stats: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'SET_SEARCH_RESULTS':
      return { ...state, searchResults: action.payload };
    case 'SET_IS_SEARCHING':
      return { ...state, isSearching: action.payload };
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload };
    case 'OPEN_COMPOSER':
      return {
        ...state,
        composerOpen: true,
        composerMode: action.payload.mode,
        composerReplyTo: action.payload.replyTo ?? null,
      };
    case 'CLOSE_COMPOSER':
      return { ...state, composerOpen: false, composerMode: 'new', composerReplyTo: null };
    case 'SET_UNREAD_BY_FOLDER':
      return { ...state, unreadByFolder: action.payload };
    case 'INCREMENT_UNREAD': {
      const folder = action.payload;
      return {
        ...state,
        unreadByFolder: {
          ...state.unreadByFolder,
          [folder]: (state.unreadByFolder[folder] ?? 0) + 1,
        },
      };
    }
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface EmailContextType {
  state: EmailState;
  loadAccounts: () => Promise<void>;
  selectAccount: (accountId: string) => void;
  changeFolder: (folder: string) => void;
  loadMessages: (reset?: boolean) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  openMessage: (message: CachedEmail) => Promise<void>;
  doAction: (messageId: string, action: string) => Promise<void>;
  openComposer: (mode?: EmailState['composerMode'], replyTo?: CachedEmail) => void;
  closeComposer: () => void;
  triggerSync: () => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  loadStats: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<EmailSettings>) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  setDefaultAccount: (accountId: string) => Promise<void>;
}

const EmailContext = createContext<EmailContextType | undefined>(undefined);

const PAGE_LIMIT = 30;

// ─── Provider ────────────────────────────────────────────────────────────────

export const EmailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(emailReducer, initialState);
  const { userProfile } = usePermissions();
  const socketRef = useRef<Socket | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userProfile?.uid) return;

    const socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('email:update', (data: { type: string; userId: string; message: CachedEmail; folder?: string }) => {
      if (data.userId !== userProfile.uid) return;

      if (data.type === 'new' && data.message) {
        const folder = data.folder || 'inbox';
        if (state.currentFolder === folder) {
          dispatch({ type: 'PREPEND_MESSAGE', payload: data.message });
        }
        dispatch({ type: 'INCREMENT_UNREAD', payload: folder });
      } else if (data.type === 'update' && data.message) {
        dispatch({ type: 'UPDATE_MESSAGE', payload: data.message });
      } else if (data.type === 'delete' && data.message?.id) {
        dispatch({ type: 'REMOVE_MESSAGE', payload: data.message.id });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.uid]);

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (userProfile?.uid) {
      loadAccounts();
      loadStats();
      loadSettings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.uid]);

  // ── Reload accounts after OAuth callback ───────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('emailConnected') || !userProfile?.uid) return;
    // Small delay to ensure Firestore write is visible
    const t = setTimeout(() => {
      loadAccounts().then(() => {
        // Clean URL params to prevent duplication on next OAuth
        const clean = `${window.location.pathname}`;
        window.history.replaceState({}, '', clean);
      });
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.uid]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const loadAccounts = useCallback(async () => {
    if (!userProfile?.uid) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const accounts = await EmailService.getAccounts(userProfile.uid);
      dispatch({ type: 'SET_ACCOUNTS', payload: Array.isArray(accounts) ? accounts : [] });

      const defaultAcc = Array.isArray(accounts) && accounts.find(a => a.isDefault);
      const firstAcc = Array.isArray(accounts) && accounts[0];
      const toSelect = defaultAcc || firstAcc;
      if (toSelect) {
        dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: toSelect.id });
      }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar contas de e-mail.' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [userProfile?.uid]);

  const selectAccount = useCallback((accountId: string) => {
    dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: accountId });
    dispatch({ type: 'SET_FOLDER', payload: 'inbox' });
  }, []);

  const changeFolder = useCallback((folder: string) => {
    dispatch({ type: 'SET_FOLDER', payload: folder });
  }, []);

  const loadMessages = useCallback(async (reset = true) => {
    const { selectedAccountId, currentFolder } = state;
    if (!selectedAccountId) return;

    dispatch({ type: 'SET_MESSAGES_LOADING', payload: true });
    try {
      const result = await EmailService.getMessages(selectedAccountId, currentFolder, 1, PAGE_LIMIT);
      dispatch({
        type: 'SET_MESSAGES',
        payload: {
          messages: result.messages ?? [],
          page: 1,
          hasMore: result.hasMore ?? false,
        },
      });

      // Compute unreadByFolder from messages
      const unreadMap: Record<string, number> = {};
      (result.messages ?? []).forEach(m => {
        if (!m.isRead) {
          unreadMap[m.folder] = (unreadMap[m.folder] ?? 0) + 1;
        }
      });
      if (Object.keys(unreadMap).length > 0) {
        dispatch({ type: 'SET_UNREAD_BY_FOLDER', payload: unreadMap });
      }
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao carregar mensagens.' });
    } finally {
      dispatch({ type: 'SET_MESSAGES_LOADING', payload: false });
    }
  }, [state]);

  const loadMoreMessages = useCallback(async () => {
    const { selectedAccountId, currentFolder, page, hasMore, messagesLoading } = state;
    if (!selectedAccountId || !hasMore || messagesLoading) return;

    const nextPage = page + 1;
    dispatch({ type: 'SET_MESSAGES_LOADING', payload: true });
    try {
      const result = await EmailService.getMessages(selectedAccountId, currentFolder, nextPage, PAGE_LIMIT);
      dispatch({
        type: 'APPEND_MESSAGES',
        payload: {
          messages: result.messages ?? [],
          page: nextPage,
          hasMore: result.hasMore ?? false,
        },
      });
    } catch {
      // silently fail pagination
    } finally {
      dispatch({ type: 'SET_MESSAGES_LOADING', payload: false });
    }
  }, [state]);

  const openMessage = useCallback(async (message: CachedEmail) => {
    dispatch({ type: 'SET_SELECTED_MESSAGE', payload: message });

    // Mark as read on server if not already read
    if (!message.isRead) {
      EmailService.doAction(message.accountId, message.id, 'read').catch(() => {});
    }

    // Load full body if not already present
    if (!message.bodyHtml && !message.bodyText) {
      try {
        const full = await EmailService.getMessage(message.id, message.accountId);
        dispatch({ type: 'UPDATE_MESSAGE', payload: full });
        dispatch({ type: 'SET_SELECTED_MESSAGE', payload: full });
      } catch {
        // non-critical
      }
    }
  }, []);

  const doAction = useCallback(async (messageId: string, action: string) => {
    const { selectedAccountId } = state;
    if (!selectedAccountId) return;

    // Optimistic UI update
    if (action === 'read') dispatch({ type: 'UPDATE_MESSAGE', payload: { id: messageId, isRead: true } });
    else if (action === 'unread') dispatch({ type: 'UPDATE_MESSAGE', payload: { id: messageId, isRead: false } });
    else if (action === 'star') dispatch({ type: 'UPDATE_MESSAGE', payload: { id: messageId, isStarred: true } });
    else if (action === 'unstar') dispatch({ type: 'UPDATE_MESSAGE', payload: { id: messageId, isStarred: false } });
    else if (action === 'archive' || action === 'trash' || action === 'spam') {
      dispatch({ type: 'REMOVE_MESSAGE', payload: messageId });
    }

    try {
      await EmailService.doAction(selectedAccountId, messageId, action as any);
    } catch {
      // Reload on error to re-sync state
      loadMessages();
    }
  }, [state, loadMessages]);

  const openComposer = useCallback((
    mode: EmailState['composerMode'] = 'new',
    replyTo?: CachedEmail,
  ) => {
    dispatch({ type: 'OPEN_COMPOSER', payload: { mode, replyTo } });
  }, []);

  const closeComposer = useCallback(() => {
    dispatch({ type: 'CLOSE_COMPOSER' });
  }, []);

  const triggerSync = useCallback(async () => {
    const { selectedAccountId, syncing } = state;
    if (!selectedAccountId || syncing) return;

    dispatch({ type: 'SET_SYNCING', payload: true });
    try {
      await EmailService.syncAccount(selectedAccountId);
      await loadMessages();
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao sincronizar.' });
    } finally {
      dispatch({ type: 'SET_SYNCING', payload: false });
    }
  }, [state, loadMessages]);

  const search = useCallback(async (query: string) => {
    const { selectedAccountId } = state;
    if (!selectedAccountId) return;

    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
    if (!query.trim()) {
      dispatch({ type: 'SET_SEARCH_RESULTS', payload: [] });
      return;
    }

    dispatch({ type: 'SET_IS_SEARCHING', payload: true });
    try {
      const result = await EmailService.search(selectedAccountId, query);
      dispatch({ type: 'SET_SEARCH_RESULTS', payload: result.messages ?? [] });
    } catch {
      dispatch({ type: 'SET_SEARCH_RESULTS', payload: [] });
    } finally {
      dispatch({ type: 'SET_IS_SEARCHING', payload: false });
    }
  }, [state]);

  const clearSearch = useCallback(() => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: '' });
    dispatch({ type: 'SET_SEARCH_RESULTS', payload: [] });
  }, []);

  const loadStats = useCallback(async () => {
    if (!userProfile?.uid) return;
    try {
      const stats = await EmailService.getStats(userProfile.uid);
      dispatch({ type: 'SET_STATS', payload: stats });
      dispatch({
        type: 'SET_UNREAD_BY_FOLDER',
        payload: {
          inbox: stats.unread ?? 0,
          spam: stats.spam ?? 0,
          drafts: stats.drafts ?? 0,
        },
      });
    } catch {
      // non-critical
    }
  }, [userProfile?.uid]);

  const loadSettings = useCallback(async () => {
    if (!userProfile?.uid) return;
    try {
      const settings = await EmailService.getSettings(userProfile.uid);
      dispatch({ type: 'SET_SETTINGS', payload: settings });
    } catch {
      // non-critical
    }
  }, [userProfile?.uid]);

  const saveSettings = useCallback(async (settings: Partial<EmailSettings>) => {
    if (!userProfile?.uid) return;
    try {
      await EmailService.saveSettings({ ...settings, userId: userProfile.uid });
      await loadSettings();
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao salvar configurações.' });
    }
  }, [loadSettings, userProfile?.uid]);

  const deleteAccount = useCallback(async (accountId: string) => {
    try {
      await EmailService.deleteAccount(accountId);
      await loadAccounts();
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao remover conta.' });
    }
  }, [loadAccounts]);

  const setDefaultAccount = useCallback(async (accountId: string) => {
    try {
      await EmailService.updateAccount({ accountId, isDefault: true });
      await loadAccounts();
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Falha ao definir conta padrão.' });
    }
  }, [loadAccounts]);

  // Auto-load messages when account or folder changes
  useEffect(() => {
    if (state.selectedAccountId && state.currentFolder) {
      loadMessages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedAccountId, state.currentFolder]);

  return (
    <EmailContext.Provider
      value={{
        state,
        loadAccounts,
        selectAccount,
        changeFolder,
        loadMessages,
        loadMoreMessages,
        openMessage,
        doAction,
        openComposer,
        closeComposer,
        triggerSync,
        search,
        clearSearch,
        loadStats,
        loadSettings,
        saveSettings,
        deleteAccount,
        setDefaultAccount,
      }}
    >
      {children}
    </EmailContext.Provider>
  );
};

export const useEmail = (): EmailContextType => {
  const ctx = useContext(EmailContext);
  if (!ctx) throw new Error('useEmail must be used inside EmailProvider');
  return ctx;
};
