import React from 'react';
import {
  FileText,
  TrendingUp,
  CheckCircle2,
  X,
  ChevronRight,
  Lock,
  Sparkles,
  Bot,
  ExternalLink
} from 'lucide-react';
import { Lead, Permissions, VisualIdentityConfig } from '../../types';
import { cn, maskCPF, maskPhone } from '../../lib/utils';
import { StatusBadge } from '../../components/StatusBadge';
import { SensitiveContent } from '../../components/SensitiveContent';
import { FollowUpManagement } from './FollowUpManagement';
import { buildAggerQuoteUrl } from '../../lib/agger-quote';

interface LeadDetailsSidebarProps {
  selectedLeadForChat: Lead;
  permissions: Permissions;
  rightWidth: number;
  startResizingRight: (e: React.MouseEvent) => void;
  isResizingRight: boolean;
  setActivePdf: (pdf: { url: string; title: string } | null) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const LeadDetailsSidebar = React.memo(({
  selectedLeadForChat,
  permissions,
  rightWidth,
  startResizingRight,
  isResizingRight,
  setActivePdf,
  isOpen,
  onClose
}: LeadDetailsSidebarProps) => {
  const openExternal = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-brand-black/60 backdrop-blur-sm z-[50] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Resizer Right */}
      <div 
        onMouseDown={startResizingRight}
        className={cn(
          "hidden lg:block w-1.5 hover:bg-gold-deep/40 cursor-col-resize absolute top-0 bottom-0 z-30 transition-colors group",
          isResizingRight && "bg-gold-deep/50"
        )}
        style={{ right: `calc(${rightWidth}px - 3px)` }}
      >
        <div className="absolute inset-y-0 left-1/2 w-[1px] bg-slate-200 group-hover:bg-gold-deep/40" />
      </div>

      {/* Lead Details Sidebar (Right) */}
      <div 
        className={cn(
          "bg-brand-dark border-l border-white/5 overflow-y-auto shrink-0 font-sans shadow-2xl z-[60] lg:z-10 transition-all duration-300 lead-details-panel",
          "fixed inset-y-0 right-0 w-full md:w-[400px] lg:relative lg:block",
          isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0 lg:w-[var(--right-width-px)]",
          !isOpen && "hidden lg:block"
        )}
        style={{ '--right-width-px': `${rightWidth}px` } as any}
      >
        <div className="p-5 md:p-6 pb-24 md:pb-20">
          <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
            <h3 className="text-xs font-black text-gold-deep flex items-center gap-2 uppercase tracking-[0.2em]">
               <FileText className="w-4 h-4" />
               Ficha do Lead
               {selectedLeadForChat.isTest && (
                 <span className="ml-2 px-1.5 py-0.5 bg-amber-500 text-brand-dark text-[8px] font-black uppercase rounded tracking-tighter">Teste</span>
               )}
            </h3>
            <button onClick={onClose} className="lg:hidden p-2 text-white/30 hover:text-gold-deep transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>


          <div className="mb-6">
             <FollowUpManagement
               leadId={selectedLeadForChat.id}
               leadName={selectedLeadForChat.name}
             />
          </div>

          <div className="mb-6">
             <button
               type="button"
               onClick={() => {
                 const url = buildAggerQuoteUrl(selectedLeadForChat);
                 window.open(url, '_blank', 'noopener,noreferrer');
               }}
               className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gold-deep text-brand-dark font-black text-[11px] uppercase tracking-[0.18em] hover:bg-gold-light transition-colors shadow-lg shadow-gold-deep/20"
             >
               <ExternalLink className="w-4 h-4" />
               Cotar no Agger
             </button>
             <p className="mt-2 text-[9px] font-medium text-white/30 uppercase tracking-widest text-center">
               Abre o Aggilizador e preenche os dados deste lead
             </p>
          </div>

          <div className="flex flex-col chat-dynamic-spacing">
             {/* Intelligence & Scoring */}
             <div className="p-4 bg-gold-deep/5 border border-gold-deep/20 rounded-2xl mb-2">
               <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-full bg-gold-deep/10 flex items-center justify-center border border-gold-deep/20">
                     <Sparkles className="w-4 h-4 text-gold-deep" />
                   </div>
                   <div>
                     <p className="text-[10px] font-black text-gold-deep uppercase tracking-widest leading-none">Inteligência Michelin</p>
                     <p className="text-[8px] text-white/30 font-bold uppercase tracking-tight mt-0.5">Análise de Comportamento</p>
                   </div>
                 </div>
                 <div className={cn(
                   "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.1em] shadow-sm",
                   selectedLeadForChat.temperature === 'quente' ? "bg-red-500 text-white" :
                   selectedLeadForChat.temperature === 'morno' ? "bg-gold-deep text-brand-dark" :
                   "bg-blue-500 text-white"
                 )}>
                   {selectedLeadForChat.temperature || 'Frio'}
                 </div>
               </div>
               
               <div className="space-y-2">
                 <div className="flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/10">
                   <span className="text-[10px] font-bold text-white/40 uppercase">Score de Engagement</span>
                   <span className="text-sm font-black text-white">{selectedLeadForChat.score ?? 0}/10</span>
                 </div>
                 
                 {selectedLeadForChat.profileType && (
                   <div className="flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/10">
                     <span className="text-[10px] font-bold text-white/40 uppercase">Perfil Comportamental</span>
                     <span className={cn(
                       "text-[10px] font-black uppercase tracking-tight px-2 py-0.5 rounded-lg",
                       selectedLeadForChat.profileType === 'direto' ? "bg-red-500/20 text-red-500 border border-red-500/30" :
                       selectedLeadForChat.profileType === 'indeciso' ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" :
                       "bg-blue-500/20 text-blue-500 border border-blue-500/30"
                     )}>
                       {selectedLeadForChat.profileType === 'direto' ? '⚡ Direto' :
                        selectedLeadForChat.profileType === 'indeciso' ? '🤔 Indeciso' :
                        '🛡️ Desconfiado'}
                     </span>
                   </div>
                 )}

                 {selectedLeadForChat.classificationReason && (
                   <div className="p-2.5 bg-black/20 rounded-xl border border-white/5">
                     <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">Motivo da Análise</p>
                     <p className="text-[10px] font-medium text-white/70 leading-relaxed italic">
                       "{selectedLeadForChat.classificationReason}"
                     </p>
                   </div>
                 )}
               </div>
             </div>


             {/* Status */}
             <div>
               {/* Context Summary */}
              {selectedLeadForChat.contextSummary && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl mb-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-1 opacity-20 group-hover:opacity-40 transition-opacity">
                    <Sparkles className="w-8 h-8 text-indigo-500" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Bot className="w-3 h-3 text-indigo-600" />
                    </div>
                    <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest leading-none">Resumo do Contexto</p>
                  </div>
                  <p className="text-[11px] font-medium text-indigo-900 leading-relaxed">
                    {selectedLeadForChat.contextSummary}
                  </p>
                </div>
              )}

              <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Status do Processo</label>
               <div className="mt-2">
                  <StatusBadge status={selectedLeadForChat.status} />
               </div>
             </div>

             {/* Personal Info */}
             <div className="flex flex-col chat-dynamic-spacing">
               <p className="text-[10px] font-black text-gold-deep uppercase tracking-widest border-b border-gold-deep/20 pb-1">Informações Pessoais</p>
               <div>
                  <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Nome Completo</p>
                  <p className="text-sm font-black text-white">{selectedLeadForChat.name}</p>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <p className="text-[10px] font-bold text-white/30 uppercase mb-1">CPF</p>
                     <div className="text-sm font-black text-white">
                       <SensitiveContent 
                         value={selectedLeadForChat.cpf} 
                         maskFn={maskCPF} 
                         canView={permissions.canReadAllLeads} 
                       />
                     </div>
                  </div>
                  <div>
                     <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Nascimento</p>
                     <p className="text-sm font-black text-white">{selectedLeadForChat.birthDate}</p>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Telefone</p>
                     <div className="text-sm font-black text-white">
                       <SensitiveContent 
                         value={selectedLeadForChat.phone} 
                         maskFn={maskPhone} 
                         canView={permissions.canReadAllLeads} 
                       />
                     </div>
                     {selectedLeadForChat.phone2 && (
                       <div className="text-sm font-black text-white/60 border-t border-white/5 mt-1 pt-1">
                          <SensitiveContent 
                            value={selectedLeadForChat.phone2} 
                            maskFn={maskPhone} 
                            canView={permissions.canReadAllLeads} 
                          />
                       </div>
                     )}
                  </div>
                  <div>
                     <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Estado Civil</p>
                     <p className="text-sm font-black text-white">{selectedLeadForChat.civilStatus}</p>
                  </div>
               </div>
             </div>

             {/* Lead Source */}
             <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-4">
               <p className="text-[10px] font-black text-white/40 uppercase mb-3 tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-gold-deep" /> Aquisição
               </p>
               <div className="space-y-2">
                 <div>
                    <p className="text-[9px] font-bold text-white/30 uppercase leading-none">Origem</p>
                    <p className="mt-1.5 text-xs font-black text-white uppercase tracking-tight">{selectedLeadForChat.origin}</p>
                 </div>
                 {selectedLeadForChat.originDetails && (
                   <div className="pt-2 border-t border-white/5">
                      <p className="text-[9px] font-bold text-white/30 uppercase leading-none">Detalhes</p>
                      <p className="mt-1.5 text-[10px] font-medium text-white/50 line-clamp-2 italic">"{selectedLeadForChat.originDetails}"</p>
                   </div>
                 )}
               </div>
             </div>

             {/* Vehicle Info */}
             <div className="p-4 bg-gold-deep/5 border border-gold-deep/20 rounded-xl shadow-lg shadow-black/20">
                <p className="text-[10px] font-black text-gold-deep uppercase mb-3 tracking-widest">Veículo</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-brand-dark/40 p-2.5 rounded-xl border border-white/5">
                     <span className="text-[9px] font-black text-white/30 uppercase tracking-tighter">Placa</span>
                     <span className="text-sm font-black text-white tracking-[0.2em] font-mono">{selectedLeadForChat.plate}</span>
                  </div>
                  <div className="space-y-1 px-1">
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Chassis</span>
                     <p className="text-xs font-mono text-slate-600 break-all leading-tight">{selectedLeadForChat.chassis}</p>
                  </div>
                  <div className="flex justify-between items-center border-t border-gold-deep/5 pt-2 px-1">
                     <span className="text-[9px] font-bold text-slate-400 uppercase">Alienação Fiduciária</span>
                     <span className="text-[10px] font-bold text-slate-600">{selectedLeadForChat.fiduciaryAlienation ? 'Sim' : 'Não'}</span>
                  </div>
                </div>
             </div>

             {/* Overnight & Residence */}
             <div className="flex flex-col chat-dynamic-spacing">
                <p className="text-[10px] font-black text-gold-deep uppercase tracking-widest border-b border-gold-deep/20 pb-1">Pernoite e Residência</p>
                <div className="space-y-3">
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <p className="text-[10px] font-bold text-white/30 uppercase mb-1">CEP Pernoite</p>
                         <p className="text-sm font-black text-white">{selectedLeadForChat.zipCodeOvernight}</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Nº</p>
                         <p className="text-sm font-black text-white">{selectedLeadForChat.numberOvernight || '-'}</p>
                      </div>
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Endereço Pernoite</p>
                      <p className="text-sm font-black text-white/80">{selectedLeadForChat.addressOvernight || 'Não informado'}</p>
                   </div>
                   
                   <div className="pt-2">
                      <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Residência diferente do pernoite?</p>
                      <p className="text-sm font-black text-white/80">{selectedLeadForChat.isDifferentResidenceZip ? 'Sim' : 'Não'}</p>
                   </div>

                   {selectedLeadForChat.isDifferentResidenceZip && (
                     <div className="p-3 bg-white/5 rounded-xl space-y-3 border border-white/5">
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <p className="text-[10px] font-bold text-white/30 uppercase mb-1">CEP Residência</p>
                              <p className="text-sm font-black text-white">{selectedLeadForChat.zipCodeResidence}</p>
                           </div>
                           <div>
                              <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Nº</p>
                              <p className="text-sm font-black text-white">{selectedLeadForChat.numberResidence || '-'}</p>
                           </div>
                        </div>
                        <div>
                           <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Endereço Residência</p>
                           <p className="text-sm font-black text-white/80">{selectedLeadForChat.addressResidence || 'Não informado'}</p>
                        </div>
                     </div>
                   )}
                </div>
             </div>

             {/* Usage Info */}
             <div className="flex flex-col chat-dynamic-spacing">
                <p className="text-[10px] font-black text-gold-deep uppercase tracking-widest border-b border-gold-deep/20 pb-1">Uso do Veículo</p>
                <div className="space-y-2">
                   <div className="flex justify-between items-center text-xs">
                      <span className="text-white/40 font-bold uppercase tracking-tight">Uso p/ trabalho (2+ dias/sem)</span>
                      <span className="font-black text-white">{selectedLeadForChat.serviceUsage ? 'Sim' : 'Não'}</span>
                   </div>
                   <div className="flex justify-between items-center text-xs">
                      <span className="text-white/40 font-bold uppercase tracking-tight">Residente 18-24 anos</span>
                      <span className="font-black text-white">{selectedLeadForChat.youngDriverHousehold ? 'Sim' : 'Não'}</span>
                   </div>
                </div>
             </div>

             {/* Owner info */}
             <div className="space-y-4">
                <p className="text-[10px] font-black text-gold-deep uppercase tracking-widest border-b border-gold-deep/20 pb-1">Proprietário do Veículo</p>
                <div className="space-y-3">
                   <div className="flex justify-between items-center text-xs">
                      <span className="text-white/40 font-bold uppercase tracking-tight">O lead é o proprietário?</span>
                      <span className="font-black text-white">{selectedLeadForChat.isOwnerDriver ? 'Sim' : 'Não'}</span>
                   </div>
                   {!selectedLeadForChat.isOwnerDriver && (
                     <div className="p-3 bg-white/5 rounded-xl space-y-3 border border-white/5">
                        <div>
                           <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Nome do Proprietário</p>
                           <p className="text-sm font-black text-white">{selectedLeadForChat.ownerName}</p>
                        </div>
                        <div>
                           <p className="text-[10px] font-bold text-white/30 uppercase mb-1">CPF/CNPJ</p>
                           <p className="text-sm font-black text-white font-mono">{selectedLeadForChat.ownerCpfCnpj}</p>
                        </div>
                     </div>
                   )}
                </div>
             </div>

              {/* Insurance info */}
             <div>
                <p className="text-[10px] font-black text-gold-deep uppercase mb-3 tracking-widest">Seguro Atual</p>
                <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                  {selectedLeadForChat.hasInsurance ? (
                    <>
                      <CheckCircle2 className="text-emerald-500 w-5 h-5 shadow-sm shadow-emerald-500/20" />
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-tight">Possui Seguro</p>
                        <p className="text-[9px] text-white/40 font-bold uppercase">Expira em: {selectedLeadForChat.insuranceExpiry}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <X className="text-red-500 w-5 h-5 shadow-sm shadow-red-500/20" />
                      <p className="text-[10px] font-black text-white uppercase tracking-tight">Não possui seguro</p>
                    </>
                  )}
                </div>
             </div>

             {/* Documents */}
             <div className="space-y-3 pt-4 border-t border-white/5">
                <p className="text-[10px] font-bold text-white/30 uppercase mb-2 tracking-widest">Documentos Anexados</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: 'CNH', key: 'cnh' },
                    { label: 'CRV', key: 'crv' },
                    { label: 'Apólice', key: 'policy' }
                  ].map((doc) => {
                    const docUrl = (selectedLeadForChat.documents as any)?.[doc.key];
                    const hasDoc = !!docUrl;
                    
                    return (
                      <button 
                        key={doc.label} 
                        disabled={!hasDoc}
                        onClick={() => {
                          if (hasDoc) {
                            if (docUrl.startsWith('data:application/pdf')) {
                              openExternal(docUrl);
                            } else {
                              setActivePdf({ url: docUrl, title: doc.label });
                            }
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between p-3 border rounded-xl transition-all group",
                          hasDoc ? "border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer" : "border-white/5 opacity-40 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-3">
                           <div className={cn(
                             "p-2 rounded-lg transition-colors",
                             hasDoc ? "bg-white/5 group-hover:bg-gold-light/20" : "bg-white/5"
                           )}>
                              <FileText className={cn(
                                "w-4 h-4 transition-colors",
                                hasDoc ? "text-white/30 group-hover:text-gold-deep" : "text-white/20"
                              )} />
                           </div>
                           <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">{doc.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasDoc && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                          <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-gold-deep group-hover:translate-x-1 transition-all" />
                        </div>
                      </button>
                    );
                  })}
                </div>
             </div>
          </div>
        </div>
      </div>
    </>
  );
});

LeadDetailsSidebar.displayName = 'LeadDetailsSidebar';
