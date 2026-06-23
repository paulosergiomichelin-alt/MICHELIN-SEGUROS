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
      'w-full flex gap-2.5 p-2.5 hover:bg-[#202c33] transition-colors relative border-b border-[#202c33]/40 text-left',
      active && 'bg-[#2a3942]'
    )}
  >
    <Avatar name={conv.contactName || conv.phone} picture={conv.contactPicture} isGroup={conv.isGroup} session={session} phone={conv.phone} />
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-start">
        <p className="text-[12px] font-bold text-[#e9edef] truncate pr-2 leading-none">
          {conv.contactName || conv.phone}
        </p>
        <span className="text-[8.5px] text-[#8696a0] shrink-0 font-medium whitespace-nowrap">
          {fmtTime(conv.lastMessageAt)}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className={cn(
          'text-[11px] truncate pr-3 leading-tight',
          (conv.unreadCount ?? 0) > 0 ? 'text-[#e9edef] font-bold' : 'text-[#8696a0]'
        )}>
          {conv.presence === 'composing' ? (
            <span className="text-emerald-400 italic">digitando...</span>
          ) : conv.presence === 'recording' ? (
            <span className="text-emerald-400 italic">gravando áudio...</span>
          ) : (
            conv.lastMessage || 'Nova conversa'
          )}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {conv.clienteId && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Cliente" />
          )}
          {conv.leadId && !conv.clienteId && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Lead" />
          )}
          {(conv.unreadCount ?? 0) > 0 && (
            <span className="bg-emerald-500 text-[#111b21] w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8.5px] font-black">
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
          ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none'
          : 'bg-[#202c33] text-[#e9edef] rounded-tl-none',
      )}>
        {/* Nome do remetente em grupos */}
        {isGroup && !isOut && msg.contactName && (
          <p className="text-[10px] font-semibold text-emerald-400 px-3 pt-2 pb-0 leading-none truncate">
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
            <div className="flex items-center gap-2 px-3 pt-2 pb-0 text-white/50">
              <Image className="w-4 h-4" />
              <span className="text-[11px]">Imagem</span>
            </div>
          )
        )}

        {/* Áudio */}
        {msg.messageType === 'audio' && (
          <div className="px-3 pt-2 pb-6">
            {msg.id ? (
              <audio controls className="w-full max-w-[260px]" style={{ accentColor: '#25d366', height: '36px' }}>
                <source src={mediaProxyUrl(session, msg.id)} type={msg.mimeType ?? 'audio/ogg'} />
                <source src={mediaProxyUrl(session, msg.id)} />
              </audio>
            ) : (
              <div className="flex items-center gap-2 text-white/50">
                <MicIcon className="w-4 h-4" />
                <span className="text-[11px]">Áudio</span>
              </div>
            )}
          </div>
        )}

        {/* Vídeo */}
        {msg.messageType === 'video' && (
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-0">
            <Video className="w-5 h-5 text-white/60 shrink-0" />
            <span className="text-[11px] text-white/70 truncate flex-1">
              {msg.fileName || 'Vídeo'}
            </span>
            {msg.id && (
              <a href={mediaProxyUrl(session, msg.id)} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <ExternalLink className="w-3.5 h-3.5 text-white/40 hover:text-white/80" />
              </a>
            )}
          </div>
        )}

        {/* Documento */}
        {msg.messageType === 'document' && (
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-white/70" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium truncate text-[#e9edef]">
                {msg.fileName || msg.body || 'Documento'}
              </p>
              {msg.mimeType && (
                <p className="text-[9px] text-white/40 uppercase">
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
                className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Download className="w-4 h-4 text-white/60" />
              </a>
            )}
          </div>
        )}

        {/* Sticker */}
        {msg.messageType === 'sticker' && (
          msg.id ? (
            <img src={mediaProxyUrl(session, msg.id)} alt="Sticker" className="w-28 h-28 object-contain p-2 block" />
          ) : (
            <div className="flex items-center gap-2 px-3 pt-2 pb-0 text-white/50">
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

        {/* Rodapé: hora + status */}
        <div className="absolute bottom-0.5 right-1.5 flex items-center gap-1 select-none">
          <span className="text-[8px] text-white/30 font-medium">{fmtTime(msg.timestamp)}</span>
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
    <span className="bg-[#202c33]/80 text-[#8696a0] text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
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
      'w-full flex gap-2.5 p-2.5 hover:bg-[#202c33] transition-colors relative border-b border-[#202c33]/40 text-left',
      active && 'bg-[#2a3942]',
    )}
  >
    <Avatar name={contact.name} picture={contact.picture} session={session} phone={contact.phone} />
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-center">
        <p className="text-[12px] font-bold text-[#e9edef] truncate pr-2 leading-none">
          {contact.name}
        </p>
        {contact.hasChat && (
          <span className="text-[8px] text-emerald-400 font-black shrink-0 uppercase tracking-tight">chat</span>
        )}
      </div>
      <p className="text-[10px] text-[#8696a0] mt-1 font-mono leading-none">
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
  useEffect(() => {
    if (!selectedConv || !selectedSessionName) { setMessages([]); return; }
    setMsgLoading(true);

    const isMeta = selectedSessionName === META_SESSION_NAME;
    const url = isMeta
      ? `/api/meta/messages?phone=${encodeURIComponent(selectedConv.phone)}`
      : `/api/evolution/messages?session=${encodeURIComponent(selectedSessionName)}&phone=${encodeURIComponent(selectedConv.phone)}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.messages)) setMessages(data.messages as WhatsAppMessage[]);
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));

    if ((selectedConv.unreadCount ?? 0) > 0) {
      if (!isMeta) patchConversation(selectedConv.id, { unreadCount: 0 });
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, unreadCount: 0 } : c));
    }
  }, [selectedConv?.id, selectedSessionName]);

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
    <div className="flex h-full w-full bg-[#0b141a] text-[#e9edef] overflow-hidden">

      {/* ── Column 1: Conversation list ──────────────────────────────────── */}
      <div className={cn(
        'flex flex-col border-r border-[#202c33] shrink-0',
        'w-full md:w-[260px] lg:w-[300px]',
        isMobile && showChat ? 'hidden' : 'flex',
      )}>
        {/* Header */}
        <div className="p-2.5 bg-[#202c33] flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">Conversas</h2>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                socketConnected ? 'bg-emerald-400' : 'bg-red-400'
              )} title={socketConnected ? 'Conectado' : 'Desconectado'} />
            </div>
            <button
              onClick={handleSync}
              disabled={syncing || !selectedSessionName}
              title="Sincronizar"
              className="p-1 text-[#aebac1] hover:bg-[#374248] rounded-full transition-colors disabled:opacity-30"
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
                    ? 'bg-[#CFA764] text-[#0a0a0a] border-[#CFA764]'
                    : 'bg-[#111b21] text-[#8696a0] border-transparent hover:bg-[#2a3942]'
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
                      ? 'bg-gold-deep text-brand-dark border-gold-deep'
                      : 'bg-[#111b21] text-[#8696a0] border-transparent hover:bg-[#2a3942]'
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
              className="w-full bg-[#111b21] border-none rounded-lg px-8 py-1.5 text-[11px] text-[#d1d7db] focus:ring-1 focus:ring-gold-deep/50 outline-none placeholder:text-[#8696a0]"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8696a0]" />
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
                    ? 'bg-gold-deep text-brand-dark border-gold-deep shadow-sm'
                    : 'bg-[#111b21] text-[#8696a0] border-transparent hover:bg-[#202c33]'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {syncResult && <p className="text-[9px] text-emerald-400 px-0.5">{syncResult}</p>}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#111b21]">
          {filter === 'contacts' ? (
            /* ── Aba Contatos ── */
            <>
              {/* Campo para iniciar conversa por número */}
              <div className="p-2 border-b border-[#202c33]/60 bg-[#111b21]">
                <div className="flex gap-1.5">
                  <input
                    type="tel"
                    placeholder="DDI+DDD+número (ex: 5511999...)"
                    value={newPhoneInput}
                    onChange={e => setNewPhoneInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStartByPhone()}
                    className="flex-1 bg-[#202c33] border border-white/5 rounded-lg px-2.5 py-1.5 text-[11px] text-[#d1d7db] outline-none focus:ring-1 focus:ring-gold-deep/50 placeholder:text-[#8696a0] font-mono"
                  />
                  <button
                    onClick={handleStartByPhone}
                    disabled={newPhoneInput.replace(/\D/g, '').length < 8}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-tight disabled:opacity-30 hover:bg-emerald-500 transition-colors shrink-0"
                  >
                    Iniciar
                  </button>
                </div>
              </div>

              {contactsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
                  <p className="text-[10px] text-[#8696a0]">Carregando contatos...</p>
                </div>
              ) : (() => {
                const q = searchText.toLowerCase();
                const filtered = contacts.filter(c =>
                  !q || c.name.toLowerCase().includes(q) || c.phone.includes(q)
                );
                return filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                    <MessageSquare className="w-8 h-8 text-white/10" />
                    <p className="text-[10px] text-[#8696a0]">
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
                <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                <MessageSquare className="w-8 h-8 text-white/10" />
                <p className="text-[10px] text-[#8696a0]">
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
        'flex-1 flex flex-col relative bg-[#0b141a] h-full min-w-0',
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
              <header className="h-[52px] bg-[#202c33] flex items-center px-3 md:px-4 shrink-0 border-b border-white/5 relative z-10">
                {isMobile && (
                  <button onClick={() => setShowChat(false)} className="p-1 -ml-1 text-[#aebac1] mr-1.5">
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
                    <h3 className="text-[13px] font-bold text-[#e9edef] truncate leading-tight">
                      {selectedConv.contactName || selectedConv.phone}
                    </h3>
                    {convPresence === 'composing' ? (
                      <p className="text-[9px] text-emerald-400 leading-none mt-0.5 animate-pulse">digitando...</p>
                    ) : convPresence === 'recording' ? (
                      <p className="text-[9px] text-emerald-400 leading-none mt-0.5 animate-pulse">gravando áudio...</p>
                    ) : (
                      <p className="text-[9px] text-[#8696a0] font-mono leading-none mt-0.5">
                        {selectedConv.phone}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowPanel(p => !p)}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors flex items-center gap-1.5',
                    showPanel ? 'bg-gold-deep/10 text-gold-deep' : 'text-[#aebac1] hover:bg-[#374248]'
                  )}
                  title="Painel de contato"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-[8.5px] font-black uppercase tracking-widest">CRM</span>
                </button>
              </header>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-5 flex flex-col gap-0.5"
                style={{
                  backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`,
                  backgroundRepeat: 'repeat',
                  backgroundColor: '#0b141a',
                  backgroundBlendMode: 'overlay',
                  opacity: 0.95,
                }}
              >
                {msgLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
                    <p className="text-[10px] text-[#8696a0]">Carregando mensagens...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <MessageSquare className="w-8 h-8 text-white/10" />
                    <p className="text-[10px] text-[#8696a0]">
                      Nenhuma mensagem nesta sessão
                    </p>
                    <p className="text-[9px] text-[#8696a0]/60 max-w-[200px]">
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
              <footer className="bg-[#202c33] flex flex-col shrink-0 border-t border-white/5 relative z-20 p-1.5 md:p-2">
                {/* Emoji picker */}
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute bottom-full left-12 mb-1 z-50 shadow-2xl rounded-xl overflow-hidden">
                    <React.Suspense fallback={<div className="w-[300px] h-[350px] bg-[#1f2c33] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-white/30" /></div>}>
                      <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        theme={'dark' as any}
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
                    className="p-2 text-[#aebac1] hover:bg-[#374248] rounded-full transition-all disabled:opacity-40"
                  >
                    {uploadingFile
                      ? <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                      : <Plus className="w-5 h-5" />
                    }
                  </button>

                  <div className="flex-1 flex items-center bg-[#2a3942] rounded-[15px] px-2.5 min-h-[36px] border border-white/5 shadow-inner">
                    <button
                      onClick={() => setShowEmojiPicker(p => !p)}
                      className={cn(
                        'p-1 transition-colors',
                        showEmojiPicker ? 'text-gold-deep' : 'text-[#8696a0] hover:text-[#d1d7db]'
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
                      className="flex-1 bg-transparent border-none outline-none text-[13px] px-2.5 text-[#d1d7db] placeholder:text-[#8696a0] py-1"
                    />
                    {inputText.trim() === '' && (
                      <button className="p-1 text-[#8696a0] hover:text-[#d1d7db] transition-colors">
                        <Mic className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending || !selectedSessionName}
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all shrink-0 active:scale-95',
                      inputText.trim() ? 'bg-emerald-500 text-[#111b21]' : 'bg-white/5 text-white/20'
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
              className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-[#111b21]"
            >
              <div className="w-32 h-32 bg-[#202c33] rounded-full flex items-center justify-center mb-8 border border-white/5">
                <MessageSquare className="w-12 h-12 text-gold-deep/20" />
              </div>
              <h2 className="text-3xl font-bold text-[#e9edef] tracking-tight mb-4">Michelin Seguros CRM</h2>
              <p className="text-[#8696a0] max-w-sm mx-auto leading-relaxed text-sm">
                Gerencie suas conversas do WhatsApp pessoal integradas ao CRM. Selecione uma conversa para começar.
              </p>
              <div className="mt-12 flex items-center gap-2 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
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
          'transition-all duration-300 border-l border-[#202c33] shrink-0',
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
