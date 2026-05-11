import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, MessageSquare } from 'lucide-react';
import { Lead, VisualIdentityConfig } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { SensitiveContent } from '../../components/SensitiveContent';
import { maskCPF, maskPhone } from '../../lib/utils';

export const DashboardDetailModal = ({ 
  isOpen, 
  onClose, 
  title, 
  leads, 
  type,
  stats,
  visualConfig
}: { 
  isOpen: boolean;
  onClose: () => void;
  title: string;
  leads: Lead[];
  type: string;
  stats: any;
  visualConfig: VisualIdentityConfig;
}) => {
  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-6 md:p-10 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-slate-900 uppercase tracking-tight">{title}</h2>
            <p className="text-xs md:text-sm text-slate-500 font-medium font-sans">Visualizando {leads.length} registros em {visualConfig.companyName}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-100 shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lead</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contato</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Etapa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800 text-sm">{lead.name}</p>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                      <SensitiveContent 
                        value={lead.cpf || ''} 
                        maskFn={maskCPF} 
                        canView={false} // Default to masked in detail
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                        <div className="text-[11px] font-bold text-slate-600">
                           <SensitiveContent 
                             value={lead.phone} 
                             maskFn={maskPhone} 
                             canView={false}
                           />
                        </div>
                     </div>
                  </td>
                  <td className="px-6 py-4">
                     <StatusBadge status={lead.status as any} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
