import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  ChevronLeft, 
  Cog, 
  Menu, 
  X, 
  MessageSquare, 
  CheckCircle2, 
  FileText,
  ShieldAlert,
  Bot,
  Zap,
  ZapOff,
  Mic,
  Headphones,
  RefreshCcw,
  Eye,
  Download,
  AlertTriangle,
  MoreVertical,
  Paperclip,
  Image as ImageIcon,
  Video,
  User as UserIcon,
  MapPin,
  FileDown,
  Send,
  Smile,
  Circle,
  Plus,
  Loader2,
  Phone,
  VideoIcon,
  Flame,
  Check,
  CheckCheck,
  Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { Lead, Message, Permissions, UserProfile } from '../../types';
import { cn, maskPhone } from '../../lib/utils';
import { ChatSettings } from './ChatSettings';
import { useLeads } from '../../contexts/LeadRealtimeContext';
import { useChat } from '../../contexts/ChatContext';
import { useViewport, useChatPreferences } from '../../hooks/useAppContexts';
import { DataService } from '../../services/DataService';
import { StorageService } from '../../services/StorageService';
import { LeadCRMPanel } from './LeadCRMPanel';
import { auth } from '../../lib/firebase';
import { SecurityService } from '../../services/SecurityService';

export const ChatView = React.memo(({
  visualConfig,
  permissions,
  agentConfig,
  setActiveTab
}: any) => {
  const { leads, selectedLeadId, setSelectedLeadId, selectedLead } = useLeads();
  const { messages, loading: messagesLoading, sendMessage, isAILoading } = useChat();
  const viewport = useViewport();
  const { preferences } = useChatPreferences();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'ai' | 'human'>('all');
  const [isCRMPanelOpen, setIsCRMPanelOpen] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    DataService.get('user', auth.currentUser?.uid || '').then(setCurrentUser);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom('auto');
    const timeout = setTimeout(() => scrollToBottom(), 100);
    return () => clearTimeout(timeout);
  }, [selectedLeadId, messages, scrollToBottom]);

  const filteredLeads = useMemo(() => {
    let result = leads;
    
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.name.toLowerCase().includes(q) || 
        l.phone.includes(q)
      );
    }

    // Filter
    if (filter === 'unread') {
      result = result.filter(l => (l as any).unreadCount > 0);
    } else if (filter === 'ai') {
      result = result.filter(l => l.iaActive);
    } else if (filter === 'human') {
      result = result.filter(l => !l.iaActive);
    }

    return result;
  }, [leads, searchQuery, filter]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedLead) return;
    
    const text = newMessage;
    setNewMessage('');
    
    try {
      await sendMessage(text, selectedLead);
    } catch (err) {
      console.error('Send message failed:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedLead) return;

    setIsUploading(true);
    setIsAttachmentMenuOpen(false);
    
    try {
      for (const file of Array.from(files)) {
        const { url, path } = await StorageService.uploadFile(file, selectedLead.id, file.name, (p) => {
          setUploadProgress(p.percentage);
        });

        const type = file.type.startsWith('image/') ? 'image' : 
                     file.type.startsWith('video/') ? 'video' : 
                     file.type.startsWith('audio/') ? 'audio' : 'file';

        const msg: Message = {
          id: SecurityService.generateId('messages'),
          leadId: selectedLead.id,
          sender: 'user',
          text: '',
          timestamp: new Date().toISOString(),
          organizationId: selectedLead.organizationId,
          attachments: [{
            url,
            path,
            type,
            name: file.name,
            mimeType: file.type
          }]
        };

        await DataService.create('messages', msg, 'USUARIO');
        
        await DataService.update('leads', selectedLead.id, {
          lastInteraction: msg.timestamp,
          lastMessageText: `Anexo: ${file.name}`,
          lastMessageSender: 'user',
          updatedAt: msg.timestamp
        });
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="whatsapp-shell flex h-full w-full bg-[#0b141a] text-[#e9edef] overflow-hidden">
      {/* COLUMN 1: Conversations List (320px) */}
      <div className={cn(
        "flex flex-col border-r border-[#202c33] shrink-0 transition-all duration-300",
        viewport.isMobile && selectedLeadId ? "w-0 overflow-hidden" : "w-full md:w-[260px] lg:w-[300px]"
      )}>
        {/* Header List */}
        <div className="p-2.5 bg-[#202c33] flex flex-col gap-2.5">
           <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white tracking-tight">Conversas</h2>
              <div className="flex items-center gap-0.5">
                 <button className="p-1 text-[#aebac1] hover:bg-[#374248] rounded-full transition-colors">
                    <RefreshCcw className="w-3.5 h-3.5" />
                 </button>
                 <button className="p-1 text-[#aebac1] hover:bg-[#374248] rounded-full transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                 </button>
              </div>
           </div>
           
           <div className="relative">
              <input 
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#111b21] border-none rounded-lg px-8 py-1.5 text-[11px] text-[#d1d7db] focus:ring-1 focus:ring-gold-deep/50 outline-none placeholder:text-[#8696a0]"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8696a0]" />
           </div>

           <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'unread', label: 'Lidas' },
                { id: 'ia', label: 'IA' },
                { id: 'human', label: 'Humanos' }
              ].map(item => (
                <button 
                  key={item.id}
                  onClick={() => setFilter(item.id as any)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-tight transition-all shrink-0 border",
                    filter === item.id 
                      ? "bg-gold-deep text-brand-dark border-gold-deep shadow-sm" 
                      : "bg-[#111b21] text-[#8696a0] border-transparent hover:bg-[#202c33]"
                  )}
                >
                  {item.label}
                </button>
              ))}
           </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#111b21]">
           {filteredLeads.map((lead: Lead) => (
             <button 
               key={lead.id}
               onClick={() => setSelectedLeadId(lead.id)}
               className={cn(
                 "w-full flex gap-2.5 p-2.5 hover:bg-[#202c33] transition-colors relative border-b border-[#202c33]/30",
                 selectedLeadId === lead.id && "bg-[#2a3942]"
               )}
             >
               <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gold-deep/10 flex items-center justify-center font-bold text-sm text-gold-deep">
                    {lead.name.charAt(0)}
                  </div>
                  {lead.iaActive && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-[#111b21]">
                       <Bot className="w-2 h-2 text-white" />
                    </div>
                  )}
               </div>
               
               <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="text-[12px] font-bold text-[#e9edef] truncate pr-2 leading-none">{lead.name}</p>
                    <span className="text-[8.5px] text-[#8696a0] shrink-0 font-medium whitespace-nowrap">
                      {lead.lastInteraction ? format(new Date(lead.lastInteraction), 'HH:mm') : ''}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className={cn(
                      "text-[11px] truncate pr-3 leading-tight",
                      (lead as any).unreadCount > 0 ? "text-[#e9edef] font-bold" : "text-[#8696a0]"
                    )}>
                      {lead.lastMessageText || 'Nova conversa'}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                       {lead.temperature === 'quente' && <Flame className="w-2.5 h-2.5 text-red-500" />}
                       {(lead as any).unreadCount > 0 && (
                         <span className="bg-emerald-500 text-[#111b21] w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8.5px] font-black">
                           {(lead as any).unreadCount}
                         </span>
                       )}
                    </div>
                  </div>
               </div>
             </button>
           ))}
        </div>
      </div>

      {/* COLUMN 2: Main Chat area (Flex-1) */}
      <div className={cn(
        "flex-1 flex flex-col relative bg-[#0b141a] transition-all duration-300 h-full",
        viewport.isMobile && isCRMPanelOpen && !!selectedLeadId ? "hidden md:flex" : "flex"
      )}>
         <AnimatePresence mode="wait">
            {selectedLead ? (
              <motion.div 
                key={selectedLead.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col h-full w-full overflow-hidden"
              >
                {/* Chat Header */}
                <header className="h-[48px] bg-[#202c33] flex items-center px-3 md:px-4 shrink-0 border-b border-white/5 relative z-10">
                   {viewport.isMobile && (
                     <button onClick={() => setSelectedLeadId(null)} className="p-1 -ml-1 text-[#aebac1] mr-1.5">
                        <ChevronLeft className="w-5 h-5" />
                     </button>
                   )}
                   
                   <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gold-deep/10 flex items-center justify-center text-xs font-bold text-gold-deep shrink-0">
                        {selectedLead.name.charAt(0)}
                      </div>
                      <div className="flex flex-col min-w-0">
                         <h3 className="text-[13px] font-bold text-[#e9edef] truncate leading-tight">{selectedLead.name}</h3>
                         <p className="text-[9px] text-emerald-500 font-medium flex items-center gap-1 leading-none mt-0.5">
                            <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                            Online
                         </p>
                      </div>
                   </div>

                   <div className="flex items-center gap-1 md:gap-2">
                      <button 
                        onClick={() => setIsCRMPanelOpen(!isCRMPanelOpen)}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors flex items-center gap-1.5",
                          isCRMPanelOpen ? "bg-gold-deep/10 text-gold-deep" : "text-[#aebac1] hover:bg-[#374248]"
                        )}
                      >
                         <FileText className="w-3.5 h-3.5" />
                         <span className="hidden lg:inline text-[8.5px] font-black uppercase tracking-widest">CRM</span>
                      </button>
                   </div>
                </header>

                {/* Messages Area */}
                <div 
                  className="flex-1 overflow-y-auto custom-scrollbar relative p-3 md:p-5 flex flex-col gap-0.5"
                  style={{ 
                    backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`, 
                    backgroundRepeat: 'repeat',
                    backgroundColor: '#0b141a',
                    backgroundBlendMode: 'overlay',
                    opacity: 0.95
                  }}
                >
                   {messages.map((msg, idx) => {
                     const isSelf = msg.sender === 'user' || msg.sender === 'ai';
                     const isFirstInGroup = idx === 0 || messages[idx-1].sender !== msg.sender;

                     return (
                       <div 
                         key={msg.id}
                         className={cn(
                           "flex",
                           isSelf ? "justify-end" : "justify-start",
                           isFirstInGroup ? "mt-1" : "mt-0"
                         )}
                       >
                         <div className={cn(
                           "max-w-[85%] md:max-w-[70%] lg:max-w-[60%] px-2 py-1 rounded-xl shadow-sm relative group transition-all",
                           isSelf 
                             ? "bg-[#005c4b] text-[#e9edef] rounded-tr-none hover:bg-[#006e5a]" 
                             : "bg-[#202c33] text-[#e9edef] rounded-tl-none hover:bg-[#2a3942]",
                            msg.attachments && msg.attachments.length > 0 && "p-1"
                         )}>
                            {msg.attachments?.map((att, i) => (
                              <div key={i} className="mb-1 rounded-lg overflow-hidden bg-black/20">
                                 {att.type === 'image' ? (
                                   <div className="relative group cursor-pointer max-w-sm">
                                      <img src={att.url} alt={att.name} className="w-full h-auto max-h-[220px] object-cover" />
                                   </div>
                                 ) : att.type === 'audio' ? (
                                   <div className="flex items-center gap-2 p-1.5 min-w-[160px]">
                                      <button className="w-7 h-7 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center shrink-0">
                                         <Mic className="w-3.5 h-3.5" />
                                      </button>
                                      <div className="flex-1 h-5 flex items-center gap-[1px] overflow-hidden opacity-30">
                                         {[...Array(15)].map((_, j) => (
                                            <div key={j} className="bg-white/40 w-[1.5px] rounded-full" style={{ height: `${20 + Math.random() * 80}%` }} />
                                         ))}
                                      </div>
                                   </div>
                                 ) : (
                                   <div className="flex items-center gap-2 p-1.5 hover:bg-white/5 transition-colors cursor-pointer">
                                      <div className="w-7 h-7 bg-black/30 rounded-lg flex items-center justify-center text-gold-deep border border-white/5">
                                         <FileText className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                         <p className="text-[10px] font-bold truncate pr-3">{att.name}</p>
                                      </div>
                                      <Download className="w-3 h-3 text-white/20" />
                                   </div>
                                 )}
                              </div>
                            ))}

                            <div className="flex flex-col">
                               {msg.text && (
                                 <p className="text-[12px] md:text-[13px] leading-relaxed whitespace-pre-wrap pb-3">
                                   {msg.text}
                                 </p>
                               )}
                               <div className="absolute bottom-0.5 right-1.5 flex items-center gap-1 select-none">
                                  {msg.sender === 'ai' && (
                                    <span className="text-[7px] font-black text-emerald-300/40 uppercase tracking-tighter">IA</span>
                                  )}
                                  <span className="text-[8px] text-white/30 font-medium">
                                    {format(new Date(msg.timestamp), 'HH:mm')}
                                  </span>
                                  {isSelf && (
                                    <div className="flex items-center text-[#53bdeb] scale-[0.6] origin-right">
                                       <CheckCheck className="w-3.5 h-3.5" />
                                    </div>
                                  )}
                               </div>
                            </div>
                         </div>
                       </div>
                     );
                   })}
                   <div ref={messagesEndRef} />

                   {/* Uploading Status Overlay */}
                   <AnimatePresence>
                      {isUploading && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="sticky bottom-4 mx-auto bg-[#202c33]/90 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl flex items-center gap-4 shadow-2xl z-20"
                        >
                           <Loader2 className="w-5 h-5 text-gold-deep animate-spin" />
                           <div className="flex flex-col shrink-0">
                              <p className="text-[10px] font-black uppercase tracking-widest text-[#e9edef]">Enviando arquivo...</p>
                              <div className="w-32 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                                 <div className="h-full bg-gold-deep transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                              </div>
                           </div>
                           <span className="text-[10px] font-bold text-gold-deep">{Math.round(uploadProgress)}%</span>
                        </motion.div>
                      )}
                   </AnimatePresence>
                </div>

                {/* Input Area */}
                <footer className={cn(
                  "bg-[#202c33] p-1.5 md:p-2 flex flex-col gap-1 shrink-0 border-t border-white/5 relative z-20",
                  viewport.isMobile && "pb-6"
                )}>
                   <div className="flex items-center gap-2 md:gap-3 relative">
                      <div className="flex items-center gap-1">
                         <button 
                           onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                           className={cn(
                             "p-2 rounded-full transition-all relative",
                             isAttachmentMenuOpen ? "bg-[#374248] text-white scale-110" : "text-[#aebac1] hover:bg-[#374248]"
                           )}
                         >
                            <Plus className={cn("w-5 h-5 transition-transform duration-300", isAttachmentMenuOpen && "rotate-45")} />
                         </button>

                         {/* Attachment Menu Popover */}
                         <AnimatePresence>
                            {isAttachmentMenuOpen && (
                              <motion.div 
                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                className="absolute bottom-[calc(100%+16px)] left-0 bg-[#233138] border border-white/5 rounded-3xl p-3 shadow-2xl flex flex-col gap-1 w-52 overflow-hidden"
                              >
                                 {[
                                   { id: 'all', icon: FileText, label: 'Documento', color: 'bg-[#7f66ff]' },
                                   { id: 'image', icon: ImageIcon, label: 'Fotos e Vídeos', color: 'bg-[#007bfc]' },
                                   { id: 'user', icon: UserIcon, label: 'Contato', color: 'bg-[#00a7f3]' },
                                   { id: 'map', icon: MapPin, label: 'Localização', color: 'bg-[#00a5f4]' },
                                   { id: 'quote', icon: FileDown, label: 'Cotação PDF', color: 'bg-[#00ca4e]' }
                                 ].map(item => (
                                   <button 
                                     key={item.id}
                                     onClick={() => fileInputRef.current?.click()}
                                     className="w-full flex items-center gap-4 px-3 py-3 hover:bg-[#111b21] rounded-2xl transition-all group"
                                   >
                                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-lg transition-transform group-hover:scale-110", item.color)}>
                                         <item.icon className="w-5 h-5" />
                                      </div>
                                      <span className="text-[11px] font-bold text-[#d1d7db] uppercase tracking-widest">{item.label}</span>
                                   </button>
                                 ))}
                              </motion.div>
                            )}
                         </AnimatePresence>
                      </div>

                      <div className="flex-1 flex items-center bg-[#2a3942] rounded-[15px] px-2.5 min-h-[36px] border border-white/5 shadow-inner">
                         <button className="p-1 text-[#8696a0] hover:text-[#d1d7db] transition-colors">
                            <Smile className="w-4 h-4" />
                         </button>
                         <input 
                           type="text"
                           placeholder="Mensagem..."
                           value={newMessage}
                           onChange={(e) => setNewMessage(e.target.value)}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter' && !e.shiftKey) {
                               e.preventDefault();
                               handleSendMessage();
                             }
                           }}
                           className="flex-1 bg-transparent border-none outline-none text-[13px] px-2.5 text-[#d1d7db] placeholder:text-[#8696a0] py-1"
                         />
                         
                         {newMessage.trim() === '' && (
                           <div className="flex items-center gap-3 text-[#8696a0]">
                              <button className="hover:text-[#d1d7db] transition-colors"><Mic className="w-5 h-5" /></button>
                           </div>
                         )}
                      </div>

                      <button 
                         onClick={handleSendMessage}
                         disabled={!newMessage.trim()}
                         className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all shrink-0 active:scale-95 disabled:opacity-50",
                            newMessage.trim() ? "bg-emerald-500 text-[#111b21]" : "bg-white/5 text-white/20"
                         )}
                      >
                         <Send className="w-4 h-4" />
                      </button>
                      
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        multiple 
                        className="hidden" 
                      />
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
                    Envie e receba mensagens agora mesmo integradas ao seu funil comercial. Selecione uma conversa para começar.
                  </p>
                  <div className="mt-12 flex items-center gap-2 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                     <Lock className="w-3 h-3" />
                     Criptografia de ponta a ponta
                  </div>
              </motion.div>
            )}
         </AnimatePresence>
      </div>

      {/* COLUMN 3: Lead CRM Panel (360px) */}
      <div className={cn(
        "transition-all duration-300",
        viewport.isMobile 
          ? (isCRMPanelOpen && !!selectedLeadId ? "fixed inset-0 z-[100] bg-brand-dark" : "w-0 overflow-hidden")
          : (isCRMPanelOpen && !!selectedLeadId ? "w-[310px]" : "w-0 overflow-hidden")
      )}>
        <LeadCRMPanel 
          leadId={selectedLeadId || ''} 
          permissions={permissions}
          isOpen={isCRMPanelOpen && !!selectedLeadId}
          onClose={() => setIsCRMPanelOpen(false)}
        />
      </div>
    </div>
  );
});

ChatView.displayName = 'ChatView';
