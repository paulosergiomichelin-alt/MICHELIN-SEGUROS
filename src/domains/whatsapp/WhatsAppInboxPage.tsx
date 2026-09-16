import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Send, ChevronLeft, MessageSquare, Loader2,
  Smartphone, FileText, RefreshCw, Plus, Smile, Mic,
  Check, CheckCheck, Image, Mic as MicIcon, Lock,
  Video, Download, ExternalLink, X,
} from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
const EmojiPicker = React.lazy(() => import('emoji-picker-react'));
import { io, Socket } from 'socket.io-client';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { WhatsAppConversation, WhatsAppMessage } from '../../types';
import { useWhatsApp } from '../../contexts/WhatsAppContext';
import { EvolutionService } from '../../services/EvolutionService';
import { ContactSidePanel } from './ContactSidePanel';
import { useNavigate } from 'react-router-dom';
import { useBrowserNotifications } from '../../hooks/useBrowserNotifications';

const META_SESSION_NAME = 'meta';

// ─── helpers ─────────────────────────────────────────────────────────────────

function patchConversation(conversationId: string, patch: Record<string, unknown>) {
  fetch('/api/evolution/conversation', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, ...patch }),
  }).catch(() => {});
}

function fmtTime(iso?: string) {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Ontem';
    return format(d, 'dd/MM', { locale: ptBR });
  } catch { return ''; }
}

function fmtFull(iso?: string) {
  if (!iso) return '';
  try { return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return ''; }
}

function sortByLastMsg(a: WhatsAppConversation, b: WhatsAppConversation) {
  return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar: React.FC<{
  name: string; picture?: string; size?: 'sm' | 'md' | 'lg'; isGroup?: boolean;
  session?: string; phone?: string;
}> = ({ name, picture, size = 'md', isGroup, session, phone }) => {
  const [src, setSrc] = useState(picture);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setSrc(picture); setFailed(false); }, [picture]);

  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-12 h-12 text-lg' : 'w-9 h-9 text-sm';

  const handleError = () => {
    if (session && phone && src !== `/api/evolution/avatar?session=${encodeURIComponent(session)}&phone=${encodeURIComponent(phone)}`) {
      setSrc(`/api/evolution/avatar?session=${encodeURIComponent(session)}&phone=${encodeURIComponent(phone)}`);
    } else {
      setFailed(true);
    }
  };

  return (
    <div className={cn(dim, 'rounded-full shrink-0 overflow-hidden bg-gold-deep/10 flex items-center justify-center font-bold text-gold-deep')}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={handleError}
        />
      ) : isGroup ? (
        <svg viewBox="0 0 24 24" className="w-[55%] h-[55%] fill-current opacity-70">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
      ) : (
        (name || '?').charAt(0).toUpperCase()
      )}
    </div>
  );
};

// ─── Conversation item ────────────────────────────────────────────────────────

const ConvItem: React.FC<{
  conv: WhatsAppConversation;
  active: boolean;
  session?: string;
  onClick: () => void;
}> = ({ conv, active, session, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex gap-2.5 p-2.5 hover:bg-slate-50 transition-colors relative border-b border-slate-100 text-left',
      active && 'bg-slate-100'
    )}
  >
    <Avatar name={conv.contactName || conv.phone} picture={conv.contactPicture} isGroup={conv.isGroup} session={session} phone={conv.phone} />
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-start">
        <p className="text-[12px] font-bold text-slate-900 truncate pr-2 leading-none">
          {conv.contactName || conv.phone}
        </p>
        <span className="text-[8.5px] text-slate-400 shrink-0 font-medium whitespace-nowrap">
          {fmtTime(conv.lastMessageAt)}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className={cn(
          'text-[11px] truncate pr-3 leading-tight',
          (conv.unreadCount ?? 0) > 0 ? 'text-slate-900 font-bold' : 'text-slate-500'
        )}>
          {conv.presence === 'composing' ? (
            <span className="text-emerald-500 italic">digitando...</span>
          ) : conv.presence === 'recording' ? (
            <span className="text-emerald-500 italic">gravando áudio...</span>
          ) : (
            conv.lastMessage || 'Nova conversa'
          )}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {conv.clienteId && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#1F8A4C]" title="Cliente" />
          )}
          {conv.leadId && !conv.clienteId && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" title="Lead" />
          )}
          {(conv.unreadCount ?? 0) > 0 && (
            <span className="bg-[#1F8A4C] text-white w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8.5px] font-black">
              {(conv.unreadCount ?? 0) > 9 ? '9+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  </button>
);

// ─── Message bubble ───────────────────────────────────────────────────────────

function mediaProxyUrl(session: string, msgId: string) {
  const waId = msgId.replace(/^wamsg_/, '');
  return `/api/evolution/media?session=${encodeURIComponent(session)}&msgId=${encodeURIComponent(waId)}`;
}

const MsgBubble: React.FC<{ msg: WhatsAppMessage; session: string; isGroup?: boolean }> = ({ msg, session, isGroup }) => {
  const isOut = msg.direction === 'outbound';
  const hasMedia = msg.messageType !== 'text';

  return (
    <div className={cn('flex', isOut ? 'justify-end' : 'justify-start', 'mt-0.5')}>
      <div className={cn(
        'max-w-[85%] md:max-w-[70%] lg:max-w-[60%] rounded-xl shadow-sm relative group overflow-hidden',
        isOut
          ? 'bg-[#005c4b] text-white rounded-tr-none hover:bg-[#006e5a]'
          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none hover:bg-slate-50',
      )}>
        {/* Nome do remetente em grupos */}
        {isGroup && !isOut && msg.contactName && (
          <p className="text-[10px] font-semibold text-gold-deep px-3 pt-2 pb-0 leading-none truncate">
            {msg.contactName}
          </p>
        )}
        {/* Imagem */}
        {msg.messageType === 'image' && (
          msg.id ? (
            <a href={mediaProxyUrl(session, msg.id)} target="_blank" rel="noopener noreferrer">
              <img
                src={mediaProxyUrl(session, msg.id)}
                alt="Imagem"
                className="max-w-full max-h-64 object-cover block"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </a>
          ) : (
            <div className={cn('flex items-center gap-2 px-3 pt-2 pb-0', isOut ? 'text-white/50' : 'text-slate-500')}>
              <Image className="w-4 h-4" />
              <span className="text-[11px]">Imagem</span>
            </div>
          )
        )}

        {/* Áudio */}
        {msg.messageType === 'audio' && (
          <div className="px-3 pt-2 pb-2">
            {msg.id ? (
              <audio controls className="w-full max-w-[280px]" style={{ accentColor: isOut ? '#25d366' : '#1B4D8F' }}>
                <source src={mediaProxyUrl(session, msg.id)} type={msg.mimeType ?? 'audio/ogg; codecs=opus'} />
                <source src={mediaProxyUrl(session, msg.id)} type="audio/ogg" />
                <source src={mediaProxyUrl(session, msg.id)} />
              </audio>
            ) : (
              <div className={cn('flex items-center gap-2', isOut ? 'text-white/50' : 'text-slate-500')}>
                <MicIcon className="w-4 h-4" />
                <span className="text-[11px]">Áudio</span>
              </div>
            )}
          </div>
        )}

        {/* Vídeo */}
        {msg.messageType === 'video' && (
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-0">
            <Video className={cn('w-5 h-5 shrink-0', isOut ? 'text-white/60' : 'text-slate-500')} />
            <span className={cn('text-[11px] truncate flex-1', isOut ? 'text-white/70' : 'text-slate-600')}>
              {msg.fileName || 'Vídeo'}
            </span>
            {msg.id && (
              <a href={mediaProxyUrl(session, msg.id)} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <ExternalLink className={cn('w-3.5 h-3.5', isOut ? 'text-white/40 hover:text-white/80' : 'text-slate-400 hover:text-slate-700')} />
              </a>
            )}
          </div>
        )}

        {/* Documento */}
        {msg.messageType === 'document' && (
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-0">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-gold-deep',
              isOut ? 'bg-white/10' : 'bg-slate-100'
            )}>
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium truncate">
                {msg.fileName || msg.body || 'Documento'}
              </p>
              {msg.mimeType && (
                <p className={cn('text-[9px] uppercase', isOut ? 'text-white/40' : 'text-slate-500')}>
                  {msg.mimeType.split('/').pop()}
                </p>
              )}
            </div>
            {msg.id && (
              <a
                href={mediaProxyUrl(session, msg.id)}
                target="_blank"
                rel="noopener noreferrer"
                download={msg.fileName}
                className={cn('shrink-0 p-1.5 rounded-lg transition-colors', isOut ? 'hover:bg-white/10' : 'hover:bg-slate-100')}
              >
                <Download className={cn('w-4 h-4', isOut ? 'text-white/60' : 'text-slate-500')} />
              </a>
            )}
          </div>
        )}

        {/* Sticker */}
        {msg.messageType === 'sticker' && (
          msg.id ? (
            <img src={mediaProxyUrl(session, msg.id)} alt="Sticker" className="w-28 h-28 object-contain p-2 block" />
          ) : (
            <div className={cn('flex items-center gap-2 px-3 pt-2 pb-0', isOut ? 'text-white/50' : 'text-slate-500')}>
              <span className="text-[11px]">Sticker</span>
            </div>
          )
        )}

        {/* Texto */}
        {(msg.body || msg.messageType === 'text') && msg.messageType !== 'document' && (
          <p className={cn(
            'text-[12px] md:text-[13px] leading-relaxed whitespace-pre-wrap pb-5',
            hasMedia && msg.body ? 'px-3 pt-1.5' : 'px-2 pt-1.5',
          )}>
            {msg.body || (!hasMedia && <span className="opacity-30 italic">mensagem</span>)}
          </p>
        )}

        {/* Fallback para tipos de mídia não renderizados */}
        {!msg.body && msg.messageType !== 'text' && !['image','video','audio','document','sticker'].includes(msg.messageType) && (
          <div className={cn('flex items-center gap-2 px-3 pt-2 pb-5', isOut ? 'text-white/40' : 'text-slate-500')}>
            <MicIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] italic">{msg.messageType}</span>
          </div>
        )}

        {/* Rodapé: hora + status */}
        <div className="absolute bottom-0.5 right-1.5 flex items-center gap-1 select-none">
          <span className={cn('text-[8px] font-medium', isOut ? 'text-white/70' : 'text-slate-400')}>{fmtTime(msg.timestamp)}</span>
          {isOut && (
            msg.status === 'read' ? <CheckCheck className="w-3 h-3 text-[#53bdeb]" /> :
            msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-white/40" /> :
            msg.status === 'sending' ? <Check className="w-3 h-3 text-white/20" /> :
            <Check className="w-3 h-3 text-white/30" />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Date separator ───────────────────────────────────────────────────────────

const DateSep: React.FC<{ date: string }> = ({ date }) => (
  <div className="flex items-center justify-center my-3">
    <span className="bg-white border border-slate-200 text-slate-500 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-sm">
      {date}
    </span>
  </div>
);

// ─── Contact item (new conversation) ─────────────────────────────────────────

interface WAContact {
  phone: string;
  name: string;
  picture?: string;
  hasChat: boolean;
}

const ContactItem: React.FC<{
  contact: WAContact;
  active: boolean;
  session?: string;
  onClick: () => void;
}> = ({ contact, active, session, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex gap-2.5 p-2.5 hover:bg-slate-50 transition-colors relative border-b border-slate-100 text-left',
      active && 'bg-slate-100',
    )}
  >
    <Avatar name={contact.name} picture={contact.picture} session={session} phone={contact.phone} />
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-center">
        <p className="text-[12px] font-bold text-slate-900 truncate pr-2 leading-none">
          {contact.name}
        </p>
        {contact.hasChat && (
          <span className="text-[8px] text-[#1F8A4C] font-black shrink-0 uppercase tracking-tight">chat</span>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mt-1 font-mono leading-none">
        +{contact.phone}
      </p>
    </div>
  </button>
);

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'unread' | 'leads' | 'clientes' | 'contacts';

export const WhatsAppInboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { sessions, activeSessions, loading: sessionsLoading, selectedSessionName, setSelectedSessionName } = useWhatsApp();
  const { notify } = useBrowserNotifications();

  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState<WhatsAppConversation | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [contacts, setContacts] = useState<WAContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const autoSyncedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedConvRef = useRef<WhatsAppConversation | null>(null);
  const selectedSessionRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Mantém refs sincronizadas para uso dentro de closures de socket
  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);
  useEffect(() => { selectedSessionRef.current = selectedSessionName; }, [selectedSessionName]);

  // Fecha emoji picker ao clicar fora
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  // ── Detect mobile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Socket.IO connection (once, persistent) ────────────────────────────────
  useEffect(() => {
    const vpsUrl = import.meta.env.VITE_API_URL as string | undefined;
    // Vercel não faz proxy de upgrade WebSocket para URLs HTTP externas —
    // usar polling apenas (funciona via rewrite, latência ~1s).
    const socket = vpsUrl
      ? io(vpsUrl, { path: '/socket.io', transports: ['polling'] })
      : io({ path: '/socket.io', transports: ['polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      // Re-entrar na sala quando reconectar (usa ref para evitar closure stale)
      const sName = selectedSessionRef.current;
      if (sName) socket.emit('join_session', sName);
    });

    socket.on('disconnect', () => setSocketConnected(false));

    // Nova conversa ou conversa existente atualizada com nova mensagem
    socket.on('wa:chat_upsert', (conv: WhatsAppConversation) => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === conv.id);
        let next: WhatsAppConversation[];
        if (idx >= 0) {
          next = prev.map((c, i) => i === idx ? { ...c, ...conv } : c);
        } else {
          next = [conv, ...prev];
        }
        return next.sort(sortByLastMsg);
      });
    });

    // Patch em campos específicos de uma conversa (unreadCount, contactName, etc.)
    socket.on('wa:chat_update', ({ id, patch }: { id: string; patch: Partial<WhatsAppConversation> }) => {
      setConversations(prev =>
        prev.map(c => c.id === id ? { ...c, ...patch } : c).sort(sortByLastMsg)
      );
      // Atualiza selectedConv se for a mesma
      setSelectedConv(prev => prev?.id === id ? { ...prev, ...patch } : prev);
    });

    // Nova mensagem chegou
    socket.on('wa:message_upsert', (msg: WhatsAppMessage) => {
      if (msg.direction === 'inbound' && msg.conversationId !== selectedConvRef.current?.id) {
        notify(
          msg.conversationId,
          msg.contactName || msg.phone || 'WhatsApp',
          msg.body || '',
        );
      }
      if (msg.conversationId !== selectedConvRef.current?.id) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev; // dedup
        return [...prev, msg];
      });
    });

    // Status de mensagem atualizado (entregue, lido, etc.)
    socket.on('wa:message_update', ({ id, patch }: { id: string; patch: Partial<WhatsAppMessage> }) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    });

    // Mensagem deletada
    socket.on('wa:message_delete', ({ id }: { id: string }) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    });

    // Presença (digitando...)
    socket.on('wa:presence_update', ({ id, presence }: { id: string; presence: string }) => {
      setConversations(prev =>
        prev.map(c => c.id === id ? { ...c, presence: presence as any } : c)
      );
    });

    // Sync automático concluído pelo servidor — recarrega lista
    socket.on('wa:sync_complete', ({ instanceName }: { instanceName: string }) => {
      if (instanceName !== selectedSessionName) return;
      loadConversations(instanceName);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Entrar/sair da sala de sessão quando session muda ─────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !selectedSessionName) return;

    socket.emit('join_session', selectedSessionName);

    return () => {
      socket.emit('leave_session', selectedSessionName);
    };
  }, [selectedSessionName]);

  // ── Carregar conversas (1 fetch inicial + socket mantém atualizado) ────────
  const loadConversations = useCallback(async (sessionName: string) => {
    setConvLoading(true);
    try {
      const url = sessionName === META_SESSION_NAME
        ? '/api/meta/conversations'
        : `/api/evolution/conversations?session=${encodeURIComponent(sessionName)}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) {
          setConversations(data.sort(sortByLastMsg));
        }
      }
    } catch {}
    setConvLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedSessionName) { setConversations([]); return; }
    autoSyncedRef.current = false;
    loadConversations(selectedSessionName);
  }, [selectedSessionName, loadConversations]);

  // ── Carregar mensagens quando abre uma conversa ────────────────────────────
  const loadMessages = useCallback(async (conv: WhatsAppConversation, sessionName: string, force = false) => {
    setMsgLoading(true);
    const isMeta = sessionName === META_SESSION_NAME;
    const url = isMeta
      ? `/api/meta/messages?phone=${encodeURIComponent(conv.phone)}`
      : `/api/evolution/messages?session=${encodeURIComponent(sessionName)}&phone=${encodeURIComponent(conv.phone)}${force ? '&force=true' : ''}`;
    try {
      const r = await fetch(url);
      const data = await r.json();
      if (Array.isArray(data.messages)) setMessages(data.messages as WhatsAppMessage[]);
    } catch {}
    setMsgLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedConv || !selectedSessionName) { setMessages([]); return; }
    loadMessages(selectedConv, selectedSessionName);
    if ((selectedConv.unreadCount ?? 0) > 0) {
      const isMeta = selectedSessionName === META_SESSION_NAME;
      if (!isMeta) patchConversation(selectedConv.id, { unreadCount: 0 });
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, unreadCount: 0 } : c));
    }
  }, [selectedConv?.id, selectedSessionName]);

  const handleRefreshMessages = useCallback(async () => {
    if (!selectedConv || !selectedSessionName || msgLoading) return;
    await loadMessages(selectedConv, selectedSessionName, true);
  }, [selectedConv, selectedSessionName, msgLoading, loadMessages]);

  const handleSelectConv = (conv: WhatsAppConversation) => {
    setSelectedConv(conv);
    if (isMobile) setShowChat(true);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !selectedConv || !selectedSessionName || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      if (selectedSessionName === META_SESSION_NAME) {
        await fetch('/api/meta/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: selectedConv.phone, type: 'text', message: text }),
        });
      } else {
        await EvolutionService.sendMessage(selectedSessionName, selectedConv.phone, text);
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const input = inputRef.current;
    if (!input) {
      setInputText(prev => prev + emojiData.emoji);
      setShowEmojiPicker(false);
      return;
    }
    const start = input.selectionStart ?? inputText.length;
    const end = input.selectionEnd ?? inputText.length;
    const newText = inputText.slice(0, start) + emojiData.emoji + inputText.slice(end);
    setInputText(newText);
    setShowEmojiPicker(false);
    setTimeout(() => {
      input.focus();
      const pos = start + emojiData.emoji.length;
      input.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv || !selectedSessionName) return;
    if (e.target) e.target.value = '';

    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SIZE) {
      alert('Arquivo muito grande. Máximo: 15MB');
      return;
    }

    const mime = file.type || 'application/octet-stream';
    let mediatype = 'document';
    if (mime.startsWith('image/')) mediatype = 'image';
    else if (mime.startsWith('video/')) mediatype = 'video';
    else if (mime.startsWith('audio/')) mediatype = 'audio';

    setUploadingFile(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data URL prefix (e.g. "data:image/jpeg;base64,")
          resolve(result.split(',')[1] ?? result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await fetch('/api/evolution/sendMedia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionName: selectedSessionName,
          phone: selectedConv.phone,
          base64,
          mediatype,
          mimetype: mime,
          fileName: file.name,
        }),
      });
    } catch (err) {
      console.error('[WhatsApp] Erro ao enviar arquivo:', err);
      alert('Erro ao enviar o arquivo. Tente novamente.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSync = useCallback(async () => {
    if (!selectedSessionName || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    if (selectedSessionName === META_SESSION_NAME) {
      // Meta: apenas recarrega do cache/Firestore
      await loadConversations(META_SESSION_NAME);
      setSyncResult('Meta: conversas atualizadas');
      setTimeout(() => setSyncResult(null), 3000);
    } else {
      const orgId = sessions.find(s => s.sessionName === selectedSessionName)?.organizationId;
      const result = await EvolutionService.syncConversations(selectedSessionName, orgId);
      if (result) {
        await loadConversations(selectedSessionName);
        setSyncResult(`${result.conversationsImported} conversa(s) sincronizada(s)`);
        setTimeout(() => setSyncResult(null), 4000);
      }
    }
    setSyncing(false);
  }, [selectedSessionName, syncing, sessions, loadConversations]);

  // ── Carregar contatos ao entrar na aba "Contatos" ─────────────────────────
  useEffect(() => {
    if (filter !== 'contacts' || !selectedSessionName || selectedSessionName === META_SESSION_NAME) return;
    setContactsLoading(true);
    fetch(`/api/evolution/contacts?session=${encodeURIComponent(selectedSessionName)}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setContacts(data as WAContact[]); })
      .catch(() => {})
      .finally(() => setContactsLoading(false));
  }, [filter, selectedSessionName]);

  const handleSelectContact = (contact: WAContact) => {
    const existingConv = conversations.find(c => c.phone === contact.phone);
    if (existingConv) {
      handleSelectConv(existingConv);
    } else {
      const tempConv: WhatsAppConversation = {
        id: `${selectedSessionName}_${contact.phone}`,
        sessionId: selectedSessionName!,
        sessionName: selectedSessionName!,
        phone: contact.phone,
        contactName: contact.name,
        contactPicture: contact.picture,
        isGroup: false,
        lastMessage: '',
        lastMessageAt: new Date().toISOString(),
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      };
      handleSelectConv(tempConv);
    }
  };

  const handleStartByPhone = () => {
    const phone = newPhoneInput.replace(/\D/g, '');
    if (phone.length < 8) return;
    handleSelectContact({ phone, name: `+${phone}`, hasChat: false });
    setNewPhoneInput('');
  };

  // Auto-sync quando lista vazia (apenas Evolution)
  useEffect(() => {
    if (!selectedSessionName || selectedSessionName === META_SESSION_NAME) return;
    if (autoSyncedRef.current || convLoading) return;
    if (conversations.length === 0) {
      autoSyncedRef.current = true;
      handleSync();
    }
  }, [selectedSessionName, conversations.length, convLoading, handleSync]);

  // ── Filtered conversations ─────────────────────────────────────────────────
  const filteredConvs = conversations.filter(c => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!(c.contactName || '').toLowerCase().includes(q) && !c.phone.includes(q)) return false;
    }
    if (filter === 'unread') return (c.unreadCount ?? 0) > 0;
    if (filter === 'leads') return !!c.leadId;
    if (filter === 'clientes') return !!c.clienteId;
    return true;
  });

  // ── Group messages by date ─────────────────────────────────────────────────
  const groupedMessages = messages.reduce<{ date: string; msgs: WhatsAppMessage[] }[]>((acc, msg) => {
    let label = '';
    try {
      const d = parseISO(msg.timestamp);
      label = isToday(d) ? 'Hoje' : isYesterday(d) ? 'Ontem' : format(d, "dd 'de' MMMM", { locale: ptBR });
    } catch { label = '—'; }
    const last = acc[acc.length - 1];
    if (last && last.date === label) { last.msgs.push(msg); }
    else acc.push({ date: label, msgs: [msg] });
    return acc;
  }, []);

  // Permite exibir o painel se há sessões Evolution ativas OU se o canal Meta
  // está sempre disponível (aba fixa).
  const hasActiveSession = activeSessions.length > 0 || selectedSessionName === META_SESSION_NAME;

  // Presence label para o header
  const convPresence = selectedConv
    ? conversations.find(c => c.id === selectedConv.id)?.presence
    : undefined;

  return (
    <div className="flex h-full w-full bg-slate-50 text-slate-800 overflow-hidden">

      {/* ── Column 1: Conversation list ──────────────────────────────────── */}
      <div className={cn(
        'flex flex-col border-r border-slate-200 shrink-0',
        'w-full md:w-[260px] lg:w-[300px]',
        isMobile && showChat ? 'hidden' : 'flex',
      )}>
        {/* Header */}
        <div className="p-2.5 bg-white border-b border-slate-200 flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Conversas</h2>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                socketConnected ? 'bg-[#1F8A4C]' : 'bg-[#C0392B]'
              )} title={socketConnected ? 'Conectado' : 'Desconectado'} />
            </div>
            <button
              onClick={handleSync}
              disabled={syncing || !selectedSessionName}
              title="Sincronizar"
              className="p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors disabled:opacity-30"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
            </button>
          </div>

          {/* Session selector — Evolution + Meta Oficial */}
          {(activeSessions.length > 0 || true) && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {/* Aba Meta Oficial — sempre visível */}
              <button
                onClick={() => setSelectedSessionName(META_SESSION_NAME)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-[8.5px] font-black uppercase tracking-tight shrink-0 transition-all border',
                  selectedSessionName === META_SESSION_NAME
                    ? 'bg-[#1B4D8F] text-white border-[#1B4D8F]'
                    : 'bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200'
                )}
              >
                <MessageSquare className="w-2.5 h-2.5" />
                Meta Oficial
              </button>
              {/* Abas Evolution */}
              {activeSessions.map(s => (
                <button
                  key={s.sessionName}
                  onClick={() => setSelectedSessionName(s.sessionName)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full text-[8.5px] font-black uppercase tracking-tight shrink-0 transition-all border',
                    selectedSessionName === s.sessionName
                      ? 'bg-[#1B4D8F] text-white border-[#1B4D8F]'
                      : 'bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200'
                  )}
                >
                  <Smartphone className="w-2.5 h-2.5" />
                  {s.profileName || s.phoneNumber || s.sessionName}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-8 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder:text-slate-400"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {([
              { id: 'all', label: 'Todas' },
              { id: 'contacts', label: 'Contatos' },
              { id: 'unread', label: 'Não lidas' },
              { id: 'leads', label: 'Leads' },
              { id: 'clientes', label: 'Clientes' },
            ] as { id: FilterType; label: string }[]).map(item => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-tight transition-all shrink-0 border',
                  filter === item.id
                    ? 'bg-[#1B4D8F] text-white border-[#1B4D8F] shadow-sm'
                    : 'bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {syncResult && <p className="text-[9px] text-[#1F8A4C] px-0.5">{syncResult}</p>}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
          {filter === 'contacts' ? (
            /* ── Aba Contatos ── */
            <>
              {/* Campo para iniciar conversa por número */}
              <div className="p-2 border-b border-slate-100 bg-white">
                <div className="flex gap-1.5">
                  <input
                    type="tel"
                    placeholder="DDI+DDD+número (ex: 5511999...)"
                    value={newPhoneInput}
                    onChange={e => setNewPhoneInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStartByPhone()}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 placeholder:text-slate-400 font-mono"
                  />
                  <button
                    onClick={handleStartByPhone}
                    disabled={newPhoneInput.replace(/\D/g, '').length < 8}
                    className="px-3 py-1.5 rounded-lg bg-[#1B4D8F] text-white text-[10px] font-black uppercase tracking-tight disabled:opacity-30 hover:bg-[#153E73] transition-colors shrink-0"
                  >
                    Iniciar
                  </button>
                </div>
              </div>

              {contactsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                  <p className="text-[10px] text-slate-500">Carregando contatos...</p>
                </div>
              ) : (() => {
                const q = searchText.toLowerCase();
                const filtered = contacts.filter(c =>
                  !q || c.name.toLowerCase().includes(q) || c.phone.includes(q)
                );
                return filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                    <MessageSquare className="w-8 h-8 text-slate-200" />
                    <p className="text-[10px] text-slate-500">
                      {contacts.length === 0 ? 'Nenhum contato encontrado' : 'Nenhum resultado para a busca'}
                    </p>
                  </div>
                ) : (
                  filtered.map(contact => (
                    <ContactItem
                      key={contact.phone}
                      contact={contact}
                      active={selectedConv?.phone === contact.phone}
                      session={selectedSessionName ?? undefined}
                      onClick={() => handleSelectContact(contact)}
                    />
                  ))
                );
              })()}
            </>
          ) : (
            /* ── Aba Conversas (Todas / Não lidas / Leads / Clientes) ── */
            convLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                <MessageSquare className="w-8 h-8 text-slate-200" />
                <p className="text-[10px] text-slate-500">
                  {conversations.length === 0
                    ? syncing ? 'Sincronizando...' : 'Nenhuma conversa ainda'
                    : 'Nenhuma conversa encontrada'}
                </p>
              </div>
            ) : (
              filteredConvs.map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={selectedConv?.id === conv.id}
                  session={selectedSessionName ?? undefined}
                  onClick={() => handleSelectConv(conv)}
                />
              ))
            )
          )}
        </div>
      </div>

      {/* ── Column 2: Chat area ──────────────────────────────────────────── */}
      <div className={cn(
        'flex-1 flex flex-col relative bg-slate-50 h-full min-w-0',
        isMobile && !showChat ? 'hidden' : 'flex',
      )}>
        <AnimatePresence mode="wait">
          {selectedConv ? (
            <motion.div
              key={selectedConv.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full w-full overflow-hidden"
            >
              {/* Chat header */}
              <header className="h-[52px] bg-white flex items-center px-3 md:px-4 shrink-0 border-b border-slate-200 relative z-10">
                {isMobile && (
                  <button onClick={() => setShowChat(false)} className="p-1 -ml-1 text-slate-500 mr-1.5">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar
                    name={selectedConv.contactName || selectedConv.phone}
                    picture={conversations.find(c => c.id === selectedConv.id)?.contactPicture}
                    size="sm"
                    isGroup={selectedConv.isGroup}
                    session={selectedSessionName ?? undefined}
                    phone={selectedConv.phone}
                  />
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-[13px] font-bold text-slate-900 truncate leading-tight">
                      {selectedConv.contactName || selectedConv.phone}
                    </h3>
                    {convPresence === 'composing' ? (
                      <p className="text-[9px] text-emerald-500 leading-none mt-0.5 animate-pulse">digitando...</p>
                    ) : convPresence === 'recording' ? (
                      <p className="text-[9px] text-emerald-500 leading-none mt-0.5 animate-pulse">gravando áudio...</p>
                    ) : (
                      <p className="text-[9px] text-slate-500 font-mono leading-none mt-0.5">
                        {selectedConv.phone}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleRefreshMessages}
                  disabled={msgLoading}
                  title="Atualizar mensagens (limpa cache e recarrega)"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-30"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', msgLoading && 'animate-spin')} />
                </button>
                <button
                  onClick={() => setShowPanel(p => !p)}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors flex items-center gap-1.5',
                    showPanel ? 'bg-gold-deep/10 text-gold-deep' : 'text-slate-500 hover:bg-slate-100'
                  )}
                  title="Painel de contato"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-[8.5px] font-black uppercase tracking-widest">CRM</span>
                </button>
              </header>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-5 flex flex-col gap-0.5 bg-slate-50">
                {msgLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                    <p className="text-[10px] text-slate-500">Carregando mensagens...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <MessageSquare className="w-8 h-8 text-slate-200" />
                    <p className="text-[10px] text-slate-500">
                      Nenhuma mensagem nesta sessão
                    </p>
                    <p className="text-[9px] text-slate-400 max-w-[200px]">
                      Novas mensagens aparecerão em tempo real
                    </p>
                  </div>
                ) : (
                  groupedMessages.map(group => (
                    <React.Fragment key={group.date}>
                      <DateSep date={group.date} />
                      {group.msgs.map(msg => <MsgBubble key={msg.id} msg={msg} session={selectedSessionName ?? ''} isGroup={selectedConv.isGroup} />)}
                    </React.Fragment>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <footer className="bg-white flex flex-col shrink-0 border-t border-slate-200 relative z-20 p-1.5 md:p-2">
                {/* Emoji picker */}
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute bottom-full left-12 mb-1 z-50 shadow-2xl rounded-xl overflow-hidden">
                    <React.Suspense fallback={<div className="w-[300px] h-[350px] bg-slate-100 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}>
                      <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        theme={'light' as any}
                        skinTonesDisabled
                        height={350}
                        width={300}
                        searchPlaceholder="Buscar emoji..."
                      />
                    </React.Suspense>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                  onChange={handleFileSelect}
                />

                <div className="flex items-center gap-2 md:gap-3 relative">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile || !selectedSessionName}
                    title="Enviar arquivo"
                    className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-all disabled:opacity-40"
                  >
                    {uploadingFile
                      ? <Loader2 className="w-5 h-5 animate-spin text-gold-deep" />
                      : <Plus className="w-5 h-5" />
                    }
                  </button>

                  <div className="flex-1 flex items-center bg-slate-100 rounded-[15px] px-2.5 min-h-[36px] border border-slate-200 shadow-inner">
                    <button
                      onClick={() => setShowEmojiPicker(p => !p)}
                      className={cn(
                        'p-1 transition-colors',
                        showEmojiPicker ? 'text-gold-deep' : 'text-slate-400 hover:text-slate-600'
                      )}
                      title="Emojis"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Mensagem..."
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-1 bg-transparent border-none outline-none text-[13px] px-2.5 text-slate-700 placeholder:text-slate-400 py-1"
                    />
                    {inputText.trim() === '' && (
                      <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                        <Mic className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending || !selectedSessionName}
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all shrink-0 active:scale-95',
                      inputText.trim() ? 'bg-[#1B4D8F] text-white' : 'bg-slate-200 text-slate-400'
                    )}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </footer>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-slate-50"
            >
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-8 border border-slate-200 shadow-sm">
                <MessageSquare className="w-12 h-12 text-gold-deep/30" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">Michelin Seguros CRM</h2>
              <p className="text-slate-500 max-w-sm mx-auto leading-relaxed text-sm">
                Gerencie suas conversas do WhatsApp pessoal integradas ao CRM. Selecione uma conversa para começar.
              </p>
              <div className="mt-12 flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                <Lock className="w-3 h-3" />
                Criptografia de ponta a ponta
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Column 3: Contact panel ──────────────────────────────────────── */}
      {showPanel && selectedConv && !isMobile && (
        <div className={cn(
          'transition-all duration-300 border-l border-slate-200 shrink-0',
          showPanel && selectedConv ? 'w-[300px]' : 'w-0 overflow-hidden'
        )}>
          <ContactSidePanel
            phone={selectedConv.phone}
            leadId={selectedConv.leadId}
            clienteId={selectedConv.clienteId}
            contactName={selectedConv.contactName}
            onLeadCreated={(leadId) => {
              patchConversation(selectedConv.id, { leadId });
              setSelectedConv(prev => prev ? { ...prev, leadId } : prev);
            }}
          />
        </div>
      )}
    </div>
  );
};
