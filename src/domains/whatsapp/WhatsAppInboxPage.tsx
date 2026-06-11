import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Send, Paperclip, MoreVertical, Phone, MessageSquare,
  Loader2, WifiOff, Smartphone, ChevronLeft, PanelRight, PanelRightClose, X,
  CheckCheck, Check, Clock, Image, FileText, Mic,
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { orderBy, limit, where } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { WhatsAppConversation, WhatsAppMessage, WhatsAppSession } from '../../types';
import { DataService } from '../../services/DataService';
import { useWhatsApp } from '../../contexts/WhatsAppContext';
import { EvolutionService } from '../../services/EvolutionService';
import { ContactSidePanel } from './ContactSidePanel';
import { useNavigate } from 'react-router-dom';

function fmtMsgTime(iso?: string) {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Ontem';
    return format(d, 'dd/MM', { locale: ptBR });
  } catch { return ''; }
}

function fmtMsgFull(iso?: string) {
  if (!iso) return '';
  try { return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return ''; }
}

const TYPE_ICON: Record<string, React.ElementType> = {
  image: Image, document: FileText, audio: Mic, video: Image,
};

// ─── Conversation list item ───────────────────────────────────────────────────

const ConvItem: React.FC<{
  conv: WhatsAppConversation;
  active: boolean;
  onClick: () => void;
}> = ({ conv, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-start gap-3 px-4 py-3 transition-all text-left border-b border-white/5',
      active ? 'bg-brand-dark/60' : 'hover:bg-white/5'
    )}
  >
    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-[12px] font-bold text-white/40">
      {(conv.contactName || conv.phone).charAt(0).toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-white truncate">{conv.contactName || conv.phone}</span>
        <span className="text-[9px] text-white/30 shrink-0">{fmtMsgTime(conv.lastMessageAt)}</span>
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        {conv.lastMessageDirection === 'outbound' && <CheckCheck className="w-3 h-3 text-white/20 shrink-0" />}
        <p className="text-[10px] text-white/40 truncate">{conv.lastMessage || '...'}</p>
      </div>
      {(conv.clienteId || conv.leadId) && (
        <span className={cn('text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded mt-1 inline-block',
          conv.clienteId ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'
        )}>
          {conv.clienteId ? 'Cliente' : 'Lead'}
        </span>
      )}
    </div>
    {(conv.unreadCount ?? 0) > 0 && (
      <span className="shrink-0 bg-emerald-500 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center">
        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
      </span>
    )}
  </button>
);

// ─── Message bubble ───────────────────────────────────────────────────────────

const MsgBubble: React.FC<{ msg: WhatsAppMessage }> = ({ msg }) => {
  const isOut = msg.direction === 'outbound';
  const TypeIcon = msg.messageType !== 'text' ? (TYPE_ICON[msg.messageType] ?? FileText) : null;

  return (
    <div className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[70%] px-3.5 py-2.5 rounded-2xl space-y-1',
        isOut ? 'bg-emerald-600/80 rounded-br-sm' : 'bg-white/10 rounded-bl-sm'
      )}>
        {TypeIcon && (
          <div className="flex items-center gap-1.5 text-white/60">
            <TypeIcon className="w-3.5 h-3.5" />
            <span className="text-[9px] uppercase font-bold">{msg.messageType}</span>
          </div>
        )}
        {msg.body && <p className="text-[12px] text-white leading-relaxed whitespace-pre-wrap">{msg.body}</p>}
        {msg.transcription && (
          <p className="text-[10px] text-white/60 italic border-t border-white/10 pt-1">
            🎤 {msg.transcription}
          </p>
        )}
        <div className={cn('flex items-center gap-1', isOut ? 'justify-end' : 'justify-start')}>
          <span className="text-[9px] text-white/40">{fmtMsgTime(msg.timestamp)}</span>
          {isOut && (
            msg.status === 'read' ? <CheckCheck className="w-3 h-3 text-blue-400" /> :
            msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-white/40" /> :
            <Check className="w-3 h-3 text-white/30" />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Date separator ───────────────────────────────────────────────────────────

const DateSep: React.FC<{ date: string }> = ({ date }) => (
  <div className="flex items-center gap-3 my-4">
    <div className="flex-1 h-px bg-white/5" />
    <span className="text-[9px] text-white/30 font-bold uppercase tracking-widest px-3">{date}</span>
    <div className="flex-1 h-px bg-white/5" />
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export const WhatsAppInboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { sessions, activeSessions, loading: sessionsLoading, selectedSessionName, setSelectedSessionName } = useWhatsApp();

  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState<WhatsAppConversation | null>(null);
  const [searchText, setSearchText] = useState('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [convLeadUpdates, setConvLeadUpdates] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to conversations for selected session
  useEffect(() => {
    if (!selectedSessionName) { setConversations([]); return; }
    setConvLoading(true);
    const unsub = DataService.subscribeCollection(
      'whatsapp_conversations',
      [where('sessionId', '==', selectedSessionName), orderBy('updatedAt', 'desc'), limit(100)],
      (data: any[]) => {
        setConversations(data as WhatsAppConversation[]);
        setConvLoading(false);
      },
      false,
      () => setConvLoading(false),
    );
    return unsub;
  }, [selectedSessionName]);

  // Subscribe to messages for selected conversation
  useEffect(() => {
    if (!selectedConv) { setMessages([]); return; }
    setMsgLoading(true);
    const unsub = DataService.subscribeCollection(
      'whatsapp_messages',
      [where('conversationId', '==', selectedConv.id), orderBy('timestamp', 'asc'), limit(200)],
      (data: any[]) => {
        setMessages(data as WhatsAppMessage[]);
        setMsgLoading(false);
      },
      false,
      () => setMsgLoading(false),
    );
    // Mark as read (reset unread count)
    if ((selectedConv.unreadCount ?? 0) > 0) {
      DataService.update('whatsapp_conversation', selectedConv.id, { unreadCount: 0 }).catch(() => {});
    }
    return unsub;
  }, [selectedConv?.id]);

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
      await EvolutionService.sendMessage(selectedSessionName, selectedConv.phone, text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Filtered conversations
  const filteredConvs = conversations.filter(c => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (c.contactName || '').toLowerCase().includes(q) || c.phone.includes(q);
  });

  // Group messages by date for date separators
  const groupedMessages = messages.reduce<{ date: string; msgs: WhatsAppMessage[] }[]>((acc, msg) => {
    let dateLabel = '';
    try {
      const d = parseISO(msg.timestamp);
      dateLabel = isToday(d) ? 'Hoje' : isYesterday(d) ? 'Ontem' : format(d, "dd 'de' MMMM", { locale: ptBR });
    } catch { dateLabel = '—'; }
    const last = acc[acc.length - 1];
    if (last && last.date === dateLabel) { last.msgs.push(msg); }
    else acc.push({ date: dateLabel, msgs: [msg] });
    return acc;
  }, []);

  const activeSession = sessions.find(s => s.sessionName === selectedSessionName);
  const hasActiveSession = activeSessions.length > 0;

  // No active sessions — show empty state
  if (!sessionsLoading && !hasActiveSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 bg-brand-dark">
        <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <WifiOff className="w-10 h-10 text-white/20" />
        </div>
        <div className="text-center">
          <p className="text-white/40 font-bold text-sm">Nenhum WhatsApp conectado</p>
          <p className="text-white/20 text-xs mt-1">Conecte seu WhatsApp para começar a receber mensagens</p>
        </div>
        <button
          onClick={() => navigate('/whatsapp/sessoes')}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
        >
          <Smartphone className="w-4 h-4" /> Conectar WhatsApp
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-brand-dark overflow-hidden">

      {/* ── Left: Conversation list ──────────────────────────────────────── */}
      <div className={cn(
        'flex flex-col bg-brand-black/60 border-r border-white/5 shrink-0',
        'w-72 md:w-80',
        isMobile && showChat ? 'hidden' : 'flex',
      )}>
        {/* Session selector */}
        {sessions.length > 1 && (
          <div className="shrink-0 px-3 py-2 border-b border-white/5 overflow-x-auto flex gap-2">
            {activeSessions.map(s => (
              <button
                key={s.sessionName}
                onClick={() => setSelectedSessionName(s.sessionName)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 transition-all',
                  selectedSessionName === s.sessionName
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:text-white'
                )}
              >
                <Smartphone className="w-2.5 h-2.5" />
                {s.profileName || s.phoneNumber || s.sessionName}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="shrink-0 px-3 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
            <input
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/5 rounded-lg text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
              placeholder="Buscar conversa..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {convLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
              <MessageSquare className="w-8 h-8 text-white/10" />
              <p className="text-[10px] text-white/20">
                {conversations.length === 0
                  ? 'Aguardando mensagens...'
                  : 'Nenhuma conversa encontrada'}
              </p>
            </div>
          ) : (
            filteredConvs.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                active={selectedConv?.id === conv.id}
                onClick={() => handleSelectConv(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Center: Chat area ────────────────────────────────────────────── */}
      <div className={cn(
        'flex flex-col flex-1 min-w-0',
        isMobile && !showChat ? 'hidden' : 'flex',
      )}>
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-[11px] text-white/30">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="shrink-0 bg-brand-black/60 border-b border-white/5 px-4 py-3 flex items-center gap-3">
              {isMobile && (
                <button onClick={() => setShowChat(false)} className="p-1.5 text-white/40 hover:text-white transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white/40 shrink-0">
                {(selectedConv.contactName || selectedConv.phone).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-white truncate">{selectedConv.contactName || selectedConv.phone}</p>
                <p className="text-[9px] text-white/30 font-mono">{selectedConv.phone}</p>
              </div>
              <button onClick={() => setShowPanel(p => !p)} className="p-1.5 text-white/30 hover:text-white transition-colors" title="Painel de contato">
                {showPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-2 bg-brand-dark/50">
              {msgLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <MessageSquare className="w-8 h-8 text-white/10" />
                  <p className="text-[10px] text-white/20">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                groupedMessages.map(group => (
                  <React.Fragment key={group.date}>
                    <DateSep date={group.date} />
                    {group.msgs.map(msg => <MsgBubble key={msg.id} msg={msg} />)}
                  </React.Fragment>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 bg-brand-black/60 border-t border-white/5 px-4 py-3 flex items-end gap-3">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite uma mensagem... (Enter para enviar)"
                rows={1}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20 transition-colors max-h-32 custom-scrollbar"
                style={{ minHeight: '42px' }}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || sending || !selectedSessionName}
                className="flex items-center justify-center w-10 h-10 bg-emerald-500 rounded-xl text-white hover:bg-emerald-400 transition-all disabled:opacity-40 shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Right: Contact side panel ─────────────────────────────────────── */}
      {showPanel && selectedConv && !isMobile && (
        <div className="w-72 shrink-0 border-l border-white/5 bg-brand-black/40 overflow-hidden">
          <ContactSidePanel
            phone={selectedConv.phone}
            leadId={selectedConv.leadId}
            clienteId={selectedConv.clienteId}
            contactName={selectedConv.contactName}
            onLeadCreated={(leadId) => {
              DataService.update('whatsapp_conversation', selectedConv.id, { leadId, updatedAt: new Date().toISOString() }).catch(() => {});
              setSelectedConv(prev => prev ? { ...prev, leadId } : prev);
            }}
          />
        </div>
      )}
    </div>
  );
};
