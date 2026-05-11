
import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  X, 
  Check, 
  AlertCircle, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Trash2,
  ExternalLink,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppNotification, NotificationType, NotificationPriority } from '../types';
import { DataService } from '../services/DataService';
import { where, orderBy, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface NotificationBellProps {
  userId: string;
  onNavigateToLead: (leadId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ userId, onNavigateToLead }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const unsubscribe = DataService.subscribeCollection('notification', 
      [where('user_id', '==', userId), orderBy('created_at', 'desc'), limit(20)], 
      (notifs) => {
        setNotifications(notifs as AppNotification[]);
        setUnreadCount(notifs.filter(n => !n.read).length);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const markAsRead = async (id: string) => {
    try {
      await DataService.update('notification', id, { read: true });
    } catch (e) {
      console.error("Error marking notification as read", e);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    try {
      const tasks = unread.map(n => DataService.update('notification', n.id, { read: true }));
      await Promise.all(tasks);
    } catch (e) {
      console.error("Error marking all as read", e);
    }
  };

  const removeNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await DataService.delete('notification', id);
    } catch (e) {
      console.error("Error deleting notification", e);
    }
  };

  const getPriorityColor = (priority: NotificationPriority) => {
    switch (priority) {
      case 'critica': return 'bg-red-500';
      case 'alta': return 'bg-amber-500';
      case 'media': return 'bg-blue-500';
      case 'baixa': return 'bg-slate-400';
      default: return 'bg-slate-400';
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'lead_pronto_cotacao': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'lead_quente': return <TrendingUp className="w-4 h-4 text-orange-500" />;
      case 'lead_parado': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'acao_necessaria': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'oportunidade_venda': return <Bot className="w-4 h-4 text-indigo-500" />;
      default: return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const renderMessageWithLinks = (notif: AppNotification) => {
    if (!notif.lead_id || !notif.leadName) return notif.message;

    const parts = notif.message.split(notif.leadName);
    if (parts.length < 2) return notif.message;

    return (
      <>
        {parts[0]}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToLead(notif.lead_id!);
            setIsOpen(false);
            markAsRead(notif.id);
          }}
          className="text-gold-deep font-black hover:underline inline-flex items-center gap-0.5"
        >
          {notif.leadName}
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
        {parts.slice(1).join(notif.leadName)}
      </>
    );
  };

  return (
    <div className="relative">
      <button 
        id="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-95"
      >
        <Bell className="w-5 h-5" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full ring-2 ring-white"
            >
              {unreadCount > 9 ? '+9' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50"
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-[360px] max-h-[500px] bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800">Notificações</h3>
                  {unreadCount > 0 && (
                     <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-black">
                        {unreadCount} Novas
                     </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors group relative"
                      title="Marcar todas como lidas"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 hover:bg-slate-200 text-slate-400 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {notifications.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
                      <Bell className="w-6 h-6 text-slate-200" />
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nenhuma notificação</p>
                    <p className="text-[10px] text-slate-300 mt-1">Tudo limpo por aqui!</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id}
                      onClick={() => markAsRead(notif.id)}
                      className={cn(
                        "group relative p-4 rounded-2xl transition-all cursor-pointer border border-transparent hover:border-slate-100",
                        notif.read ? "bg-white opacity-70" : "bg-slate-50/80 hover:bg-white shadow-sm"
                      )}
                    >
                      <div className="flex gap-4">
                        <div className="relative">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                            notif.read ? "bg-slate-100" : "bg-white"
                          )}>
                            {getNotificationIcon(notif.type)}
                          </div>
                          {!notif.read && (
                            <span className={cn(
                              "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-50",
                              getPriorityColor(notif.priority)
                            )} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pr-6">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className={cn(
                              "text-[10px] font-black uppercase tracking-widest truncate",
                              notif.read ? "text-slate-400" : "text-slate-700"
                            )}>
                              {notif.title}
                            </h4>
                            <span className="text-[9px] text-slate-300 font-bold">
                              {format(new Date(notif.created_at), "HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <p className={cn(
                            "text-[11px] leading-relaxed",
                            notif.read ? "text-slate-400 font-medium" : "text-slate-600 font-bold"
                          )}>
                            {renderMessageWithLinks(notif)}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                             <span className="text-[8px] font-black uppercase tracking-tighter text-slate-300">
                                Via {notif.created_by} • {format(new Date(notif.created_at), "dd/MM", { locale: ptBR })}
                             </span>
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={(e) => removeNotification(notif.id, e)}
                        className="absolute top-4 right-4 p-1.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {notifications.length > 0 && (
                <div className="px-6 py-3 bg-slate-50/30 border-t border-slate-50 text-center">
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                     Últimas 20 notificações
                   </p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
