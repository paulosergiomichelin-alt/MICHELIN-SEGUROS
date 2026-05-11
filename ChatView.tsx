import React, { useMemo, useEffect, useRef } from 'react';
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
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { Lead, Message, ChatPreferences, Permissions } from '../types';
import { cn } from '../lib/utils';
import { ChatSettings } from './ChatSettings';
import { useDebounce } from '../hooks/useDebounce';
import { agentService } from '../services/agentService';

export const ChatView = React.memo(({
  leads,
  messages,
  selectedLeadId,
  setSelectedLeadId,
  searchChat,
  setSearchChat,
  isMsgSearchOpen,
  setIsMsgSearchOpen,
  msgSearchQuery,
  setMsgSearchQuery,
  isChatSettingsOpen,
  setIsChatSettingsOpen,
  chatContainerRef,
  preferences,
  liveLeftWidth,
  liveRightWidth,
  startResizingLeft,
  isResizingLeft,
  selectedLeadForChat,
  activeLeadSearch,
  setActiveLeadSearch,
  activeTab,
  setActiveTab,
  onUpdateLead,
  permissions,
  isDetailsOpen,
  setIsDetailsOpen,
  isSidebarOpen,
  setIsSidebarOpen,
  refreshLeads,
  isTestMode,
  onClearTestMessages,
  connectionState,
  setActivePdf
}: any) => {
  const debouncedSearch = useDebounce(searchChat, 300);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasOpenRouter = useMemo(() => {
    // Reference dependencies to satisfy linter while ensuring reactivity to potential settings changes
    const _trigger = [messages.length, selectedLeadId];
    const key = (agentService as any).getResolvedOpenRouterKey?.() || '';
    return key.length > 0;
  }, [messages, selectedLeadId]);

  const leadMessages = useMemo(() => 
    messages.filter((m: Message) => m.leadId === selectedLeadId),
  [messages, selectedLeadId]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  };

  useEffect(() => {
    scrollToBottom();
    // Extra insurance for dynamic content
    const timeoutId = setTimeout(scrollToBottom, 150);
    return () => clearTimeout(timeoutId);
  }, [leadMessages]);

  const filteredChatLeads = useMemo(() => {
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const query = normalize(debouncedSearch);
    if (!query) return leads;
    return leads.filter((lead: Lead) => 
      normalize(lead.name).includes(query) || 
      normalize(lead.phone).includes(query) ||
      (lead.phone2 && normalize(lead.phone2).includes(query))
    );
  }, [leads, debouncedSearch]);

  return (
    <div 
      ref={chatContainerRef}
      className="flex h-full relative overflow-hidden chat-interface-container"
      style={{ 
        '--chat-font-size-px': `${preferences.fontSize}px`,
        '--chat-spacing-px': `${preferences.messageSpacing}px`,
        '--left-width-px': `${liveLeftWidth}px`,
        '--right-width-px': `${liveRightWidth}px`,
      } as any}
    >
      {/* Lead Selector Sidebar */}
      <div 
        className={cn(
          "bg-white border-r border-slate-200 flex flex-col shrink-0 transition-transform duration-300 absolute md:relative inset-0 z-20 md:z-auto h-full",
          selectedLeadId ? "-translate-x-full md:translate-x-0" : "translate-x-0"
        )}
        style={{ width: 'var(--left-width-px)', maxWidth: '500px', minWidth: '250px' } as any}
      >
        <div className="p-4 bg-slate-50 border-b border-slate-200">
           <div className="flex items-center gap-2 mb-3">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
               <input 
                type="text" 
                placeholder="Buscar conversa..." 
                value={searchChat}
                onChange={(e) => setSearchChat(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold-deep/20 text-slate-900 font-medium"
              />
             </div>
             <button 
               onClick={refreshLeads}
               className="p-2 text-slate-400 hover:text-gold-deep bg-white border border-slate-200 rounded-xl transition-all"
               title="Sincronizar Leads"
             >
               <RefreshCcw className="w-5 h-5 hover:rotate-180 transition-transform duration-500" />
             </button>
           </div>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col chat-dynamic-spacing pt-2">
          {filteredChatLeads.length === 0 ? (
            <div className="p-8 text-center text-slate-400 uppercase text-[10px] font-bold tracking-widest">
              Nenhum contato encontrado
            </div>
          ) : (
            filteredChatLeads.map((lead: Lead) => (
              <button 
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                className={cn(
                  "w-full flex gap-4 hover:bg-slate-50 transition-colors border-b border-slate-50 lead-item",
                  selectedLeadId === lead.id ? "bg-gold-light/5 hover:bg-gold-light/5 border-l-4 border-l-gold-deep" : "border-l-4 border-l-transparent"
                )}
                style={{ padding: `calc(var(--chat-spacing-px) * 0.8) var(--chat-spacing-px)` }}
              >
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0 text-gold-deep font-bold border border-slate-200">
                  {lead.name.charAt(0)}
                </div>
                <div className="flex-1 text-left min-w-0">
                   <div className="flex justify-between items-start">
                     <p className="font-bold text-slate-900 text-sm flex items-center gap-2 lead-name">
                       {lead.name}
                     </p>
                   </div>
                   <p className={cn(
                     "text-xs mt-1 truncate",
                     lead.lastMessageSender === 'lead' ? "font-bold text-slate-700" : "text-slate-500"
                   )}>
                     {lead.lastMessageSender === 'ai' && <span className="text-emerald-600 font-black text-[8px] mr-1 badge-stable">IA:</span>}
                     {lead.lastMessageText || "Inicie uma conversa..."}
                   </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Resizer Left */}
      <div 
        onMouseDown={startResizingLeft}
        className={cn(
          "hidden md:block w-1.5 hover:bg-gold-deep/40 cursor-col-resize absolute top-0 bottom-0 z-30 transition-colors group",
          isResizingLeft && "bg-gold-deep/50"
        )}
        style={{ left: `calc(var(--left-width-px) - 3px)` }}
      >
        <div className="absolute inset-y-0 left-1/2 w-[1px] bg-slate-200 group-hover:bg-gold-deep/40" />
      </div>

      {/* Chat View Content */}
      <div className={cn(
        "flex-1 flex flex-col bg-[#F0F2F5] relative transition-transform duration-300 h-full shadow-inner overflow-hidden",
        selectedLeadId ? "translate-x-0" : "translate-x-full md:translate-x-0"
      )}>
        {selectedLeadForChat ? (
          <div className="flex flex-col h-full bg-[#f0f2f5] chat-container">
            {/* Header estilo WhatsApp */}
            {connectionState !== 'OPEN' && connectionState !== undefined && (
              <div className={cn(
                "w-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white flex items-center justify-center gap-2 relative z-50",
                connectionState === 'RECONNECTING' ? "bg-amber-500 animate-pulse" : "bg-red-500"
              )}>
                {connectionState === 'RECONNECTING' ? 'Reconectando ao servidor...' : 'Sem conexão com servidor - Fallback Polling Ativo'}
              </div>
            )}
            <div className="h-[60px] bg-[#f0f2f5] border-b border-slate-200 flex items-center px-4 md:px-6 shrink-0 relative z-10 transition-all chat-header">
              {!isMsgSearchOpen ? (
                <>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                       {!hasOpenRouter && (
                         <div className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase tracking-tighter rounded-full border border-amber-200 flex items-center gap-1 shrink-0 animate-pulse">
                           <AlertTriangle className="w-2 h-2" />
                           Key Missing
                         </div>
                       )}
                       <div className="header-left flex-1">
                          <button 
                            onClick={() => setSelectedLeadId(null)}
                            className="md:hidden p-2 -ml-2 text-slate-400 hover:text-gold-deep shrink-0"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <div className="w-9 h-9 md:w-10 md:h-10 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500 border border-slate-300 shrink-0 relative overflow-hidden group">
                            {selectedLeadForChat.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0 ml-3">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <p className="header-title font-semibold text-slate-900 text-sm md:text-base leading-tight">
                                {selectedLeadForChat.name}
                              </p>
                              {isTestMode && (
                                <span className="badge-stable bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter animate-pulse">Simulação</span>
                              )}
                            </div>
                            <p className="text-xs md:text-sm text-emerald-600 font-medium whitespace-nowrap truncate">
                              Online no WhatsApp
                            </p>
                          </div>
                        </div>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1 md:gap-2">
                     {/* Clear Test Button */}
                     {isTestMode && (
                       <button
                         onClick={() => onClearTestMessages && onClearTestMessages()}
                         className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 group shrink-0"
                         title="Limpar mensagens da simulação"
                       >
                         <RefreshCcw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                         <span className="hidden sm:inline">Limpar Teste</span>
                       </button>
                     )}

                     {/* IA Toggle - Simplified version */}
                     <button
                       onClick={() => onUpdateLead({ ...selectedLeadForChat, iaActive: !selectedLeadForChat.iaActive })}
                       className={cn(
                         "flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all border shrink-0",
                         selectedLeadForChat.iaActive !== false
                           ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                           : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                       )}
                       title={selectedLeadForChat.iaActive !== false ? "Desativar IA" : "Ativar IA"}
                     >
                       {selectedLeadForChat.iaActive !== false ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
                       <span className="hidden xs:inline-block">{selectedLeadForChat.iaActive !== false ? "IA Ativa" : "IA Inativa"}</span>
                     </button>

                     <button 
                       onClick={() => setIsDetailsOpen(true)}
                       className={cn(
                         "p-2 text-gold-deep hover:bg-gold-light/10 rounded-full transition-all lg:hidden",
                         isDetailsOpen && "bg-gold-light/20"
                       )}
                       title="Ver ficha do lead"
                     >
                       <FileText className="w-5 h-5" />
                     </button>

                     <button 
                      onClick={() => setIsMsgSearchOpen(true)}
                      className="p-2 text-slate-500 hover:bg-slate-200 rounded-full transition-all"
                    >
                      <Search className="w-5 h-5" />
                    </button>
                     <button 
                      onClick={() => setIsChatSettingsOpen(!isChatSettingsOpen)}
                      className={cn(
                         "p-2 text-slate-500 hover:bg-slate-200 rounded-full transition-all",
                         isChatSettingsOpen && "bg-slate-200"
                       )}
                     >
                       <Cog className="w-5 h-5" />
                     </button>
                  </div>
                  
                  <ChatSettings 
                    isOpen={isChatSettingsOpen} 
                    onClose={() => setIsChatSettingsOpen(false)} 
                  />
                </>
              ) : (
                <div className="flex-1 flex items-center gap-3">
                  <button 
                    onClick={() => { setIsMsgSearchOpen(false); setMsgSearchQuery(''); }}
                    className="p-2 text-slate-500 hover:text-slate-800"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <div className="flex-1 relative">
                    <input 
                      autoFocus
                      type="text"
                      placeholder="Pesquisar mensagens..."
                      value={msgSearchQuery}
                      onChange={(e) => setMsgSearchQuery(e.target.value)}
                      className="w-full bg-[#f0f2f5] border border-transparent rounded-lg px-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:bg-white font-normal"
                    />
                    {msgSearchQuery && (
                      <button 
                        onClick={() => setMsgSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Container de Mensagens com Padrao WhatsApp */}
            <div 
              className="flex-1 overflow-y-auto px-2 md:px-16 py-6 space-y-1 scroll-smooth bg-[#E5DDD5] relative messages-area"
              style={{ backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`, backgroundRepeat: 'repeat' }}
            >
              {isTestMode && (
                <div className="flex justify-center mb-6 sticky top-0 z-10">
                  <div className="bg-amber-500/90 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg flex items-center gap-2 border border-amber-400">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    MODO SIMULAÇÃO ATIVO
                  </div>
                </div>
              )}
              {leadMessages.map((msg: Message, idx: number) => {
                const isVeryRecent = idx > leadMessages.length - 5;
                return (
                  <div 
                    key={msg.id}
                    className={cn(
                      "max-w-[88%] md:max-w-[70%] px-2 py-1 md:px-3 md:py-2 rounded-xl shadow-sm relative group mb-1.5 transition-opacity duration-300",
                      // Messages with attachments (documents) go to the left/white per user request
                      (msg.attachments && msg.attachments.length > 0)
                        ? "mr-auto bg-white text-slate-800 rounded-tl-none border border-slate-100"
                        : (msg.sender === 'user' || msg.sender === 'ai')
                          ? "ml-auto bg-[#DCF8C6] text-slate-800 rounded-tr-none border border-[#c6e8ae]" 
                          : "mr-auto bg-white text-slate-800 rounded-tl-none border border-slate-100"
                    )}
                  >
                    <div className="flex flex-col min-w-[80px]">
                    {/* Render Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-col gap-2 mb-2">
                        {msg.attachments.map((att, i) => (
                          <div key={i} className="rounded-lg overflow-hidden">
                            {att.type === 'audio' ? (
                              <div className="flex items-center gap-3 p-3 bg-black/5 rounded-xl border border-black/5">
                                <div className="w-10 h-10 bg-gold-deep/10 text-gold-deep rounded-full flex items-center justify-center shrink-0">
                                  <Mic className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[#111b21]/60">Áudio</span>
                                    {att.transcription && (
                                      <span className="text-[7px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded uppercase tracking-tighter">Transcrito</span>
                                    )}
                                  </div>
                                  <div className="flex items-end gap-[2px] h-3 mt-1.5 opacity-40">
                                     {[...Array(15)].map((_, j) => (
                                       <div key={j} className="w-[2px] bg-slate-600 rounded-full" style={{ height: `${20 + (Math.sin(j * 0.8) + 1) * 40}%` }} />
                                     ))}
                                  </div>
                                </div>
                              </div>
                            ) : att.type === 'image' ? (
                              <div 
                                className="relative group cursor-pointer" 
                                onClick={() => setActivePdf({ url: att.url, title: att.name || 'Imagem' })}
                              >
                                <img src={att.url} alt={att.name || 'Imagem'} className="w-full max-h-60 object-cover rounded-lg border border-black/5" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Eye className="w-6 h-6 text-white" />
                                </div>
                              </div>
                            ) : (
                              <div 
                                className="flex items-center gap-3 p-3 bg-white/50 rounded-xl border border-black/5 cursor-pointer hover:bg-white/80 transition-all"
                                onClick={() => setActivePdf({ url: att.url, title: att.name || 'Documento' })}
                              >
                                <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center shrink-0">
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">{att.name || 'Documento'}</p>
                                  <p className="text-[10px] text-slate-400 uppercase font-black">{att.mimeType?.split('/')[1] || 'FILE'}</p>
                                </div>
                                <Download className="w-4 h-4 text-slate-300" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pr-10 md:pr-12 text-sm md:text-base leading-[1.4] whitespace-pre-wrap break-word-custom text-[#111b21] font-normal">
                      {msg.text}
                    </div>
                    <div className="absolute bottom-1.5 right-2 flex items-center gap-1 leading-none">
                      {msg.sender === 'ai' && (
                        <span className="text-[0.65rem] font-black text-emerald-700/60 mr-1 uppercase tracking-tighter">IA</span>
                      )}
                      <span className="text-xs text-[#667781] mr-0.5">
                        {format(new Date(msg.timestamp), 'HH:mm')}
                      </span>
                      {(msg.sender === 'ai' || msg.sender === 'user') && (
                        <div className="flex text-[#53bdeb] scale-90">
                          <svg viewBox="0 0 16 15" width="16" height="15" fill="currentColor"><path d="M15.01 3.316l-.478-.372a.365.365 0 00-.51.063L8.666 9.88a.32.32 0 01-.484.032l-.358-.325a.319.319 0 00-.484.032l-.378.48a.418.418 0 00.036.54l1.32 1.267a.32.32 0 00.484-.034l6.272-8.048a.366.366 0 00-.064-.512zm-4.1 0l-.478-.372a.365.365 0 00-.51.063L4.566 9.88a.32.32 0 01-.484.032L1.892 7.77a.366.366 0 00-.516.005l-.423.433a.364.364 0 00.006.514l3.255 3.185a.32.32 0 00.484-.033l6.272-8.048a.365.365 0 00-.063-.51z" /></svg>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
             <div className="w-24 h-24 bg-brand-dark/5 rounded-full flex items-center justify-center mb-6 border border-gold-deep/10 shadow-inner">
                <MessageSquare className="w-10 h-10 text-gold-deep/30" />
             </div>
             <h3 className="text-xl font-bold text-slate-800 tracking-tight">Central de Atendimento</h3>
             <p className="text-sm text-slate-500 max-w-sm mt-2 leading-relaxed">
               Selecione um lead na lateral esquerda para iniciar ou gerenciar uma conversa via WhatsApp.
             </p>
             <button 
               onClick={() => setActiveTab('leads')}
               className="mt-8 px-8 py-3 bg-brand-dark text-gold-deep border border-gold-deep/20 rounded-2xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
             >
               Ver Todos os Leads
             </button>
          </div>
        )}
      </div>
    </div>
  );
});
ChatView.displayName = 'ChatView';
