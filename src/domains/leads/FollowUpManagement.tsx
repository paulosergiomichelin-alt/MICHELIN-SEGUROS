
import React, { useState, useEffect, useCallback } from 'react';
import { where, orderBy, limit } from '../../lib/queryConstraints';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { FollowUp, FollowUpStatus } from '../../types';
import { DataService } from '../../services/DataService';
import { 
  Clock, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Bot, 
  User, 
  MessageSquare, 
  AlertCircle,
  ChevronRight,
  History
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

interface FollowUpManagementProps {
  leadId: string;
  leadName: string;
}

export const FollowUpManagement: React.FC<FollowUpManagementProps> = ({ leadId, leadName }) => {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  
  // New Follow-up state
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newTime, setNewTime] = useState('09:00');
  const [newContext, setNewContext] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFollowUps = useCallback(async () => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const data = await DataService.list('follow_up', [
        where('leadId', '==', leadId),
        orderBy('scheduledAt', 'desc'),
        limit(10)
      ]);
      setFollowUps(data as FollowUp[]);
    } catch (error: any) {
      if (error.message.toLowerCase().includes('quota exceeded')) {
        console.error('Follow-ups quota exceeded');
      }
      handleFirestoreError(error, OperationType.LIST, `follow_ups for ${leadId}`);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (isMounted) {
        await fetchFollowUps();
      }
    };
    load();
    return () => { isMounted = false; };
  }, [fetchFollowUps]);

  const handleCreateManual = async () => {
    if (!newDate || !newTime || !newContext) return;
    
    setSaving(true);
    try {
      const scheduledAt = `${newDate}T${newTime}:00`;
      const now = new Date().toISOString();

      await DataService.create('follow_up', {
        leadId,
        scheduledAt,
        status: 'pending',
        origin: 'manual',
        contextSummary: newContext,
        createdAt: now,
        updatedAt: now
      });
      
      setShowAdd(false);
      setNewContext('');
      fetchFollowUps();
    } catch (error) {
      console.error('Error creating manual follow-up:', error);
    } finally {
      setSaving(false);
    }
  };

  const cancelFollowUp = async (id: string) => {
    try {
      await DataService.update('follow_up', id, {
        status: 'cancelled',
        updatedAt: new Date().toISOString()
      });
      fetchFollowUps();
    } catch (error) {
      console.error('Error cancelling follow-up:', error);
    }
  };

  const getStatusStyle = (status: FollowUpStatus, scheduledAt: string) => {
    const isOverdue = status === 'pending' && isAfter(new Date(), parseISO(scheduledAt));
    
    switch (status) {
      case 'executed': return 'bg-[#E4F5EA] text-[#1F8A4C] border-[#1F8A4C]/20';
      case 'cancelled': return 'bg-slate-100 text-slate-400 border-slate-200';
      case 'pending':
        return isOverdue
          ? 'bg-[#FFF3DC] text-[#B8860B] border-[#B8860B]/20 animate-pulse'
          : 'bg-gold-deep/10 text-gold-deep border-gold-deep/20';
      default: return 'bg-slate-100 text-slate-400';
    }
  };

  const getStatusIcon = (status: FollowUpStatus, scheduledAt: string) => {
    const isOverdue = status === 'pending' && isAfter(new Date(), parseISO(scheduledAt));
    
    switch (status) {
      case 'executed': return <CheckCircle2 className="w-3 h-3" />;
      case 'cancelled': return <XCircle className="w-3 h-3" />;
      case 'pending': return isOverdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <History className="w-3 h-3" /> Agenda de Retornos
        </h3>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="p-1.5 bg-gold-deep/10 text-gold-deep rounded-lg hover:bg-gold-deep/20 transition-all shadow-sm border border-gold-deep/20"
        >
          <Plus className={cn("w-3.5 h-3.5 transition-transform", showAdd && "rotate-45")} />
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Data</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 outline-none focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 bg-white text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Hora</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 outline-none focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 bg-white text-slate-800"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Motivo / Contexto</label>
                <textarea
                  placeholder="Ex: Cliente parou para reunião, quer retomar cotação às 14h."
                  value={newContext}
                  onChange={e => setNewContext(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 outline-none focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 bg-white text-slate-800 min-h-[60px] resize-none placeholder:text-slate-300"
                />
              </div>
              <button 
                disabled={saving}
                onClick={handleCreateManual}
                className="w-full py-2 bg-[#1B4D8F] text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#153E73] transition-all flex items-center justify-center gap-2"
              >
                {saving ? 'Agendando...' : 'Agendar Follow-up'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {followUps.length === 0 && !loading && (
          <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest italic">Nenhum agendamento ativo</p>
          </div>
        )}

        {followUps.map((fu) => (
          <div key={fu.id} className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all relative group overflow-hidden">
            <div className="flex items-start justify-between gap-3 relative z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider",
                    getStatusStyle(fu.status, fu.scheduledAt)
                  )}>
                    {getStatusIcon(fu.status, fu.scheduledAt)}
                    {fu.status === 'pending' && isAfter(new Date(), parseISO(fu.scheduledAt)) ? 'Atrasado' : 
                     fu.status === 'pending' ? 'Pendente' : 
                     fu.status === 'executed' ? 'Realizado' : 'Cancelado'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(parseISO(fu.scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>

                <p className="text-[11px] text-slate-800 leading-relaxed line-clamp-2">
                  <span className="font-black text-gold-deep mr-1 uppercase text-[9px]">
                    {fu.origin === 'ai' ? <Bot className="w-3 h-3 inline mr-0.5" /> : <User className="w-3 h-3 inline mr-0.5" />}
                    {fu.origin}:
                  </span>
                  {fu.contextSummary}
                </p>
              </div>

              {fu.status === 'pending' && (
                <button 
                  onClick={() => cancelFollowUp(fu.id)}
                  className="p-1.5 text-slate-300 hover:text-[#C0392B] hover:bg-[#FDE4E4] rounded-lg transition-all"
                  title="Cancelar Agendamento"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Background Decor */}
            <div className={cn(
              "absolute -right-2 -bottom-2 opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform duration-500",
              fu.origin === 'ai' ? "text-indigo-500" : "text-gold-deep"
            )}>
              {fu.origin === 'ai' ? <Bot className="w-16 h-16" /> : <User className="w-16 h-16" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
