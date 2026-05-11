import React from 'react';
import { 
  Users, 
  MessageSquare, 
  FileText, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  ArrowUpRight, 
  ArrowDownRight, 
  BarChart3, 
  Filter, 
  Sparkles, 
  AlertCircle 
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  FunnelChart, 
  Funnel, 
  LabelList 
} from 'recharts';
import { motion } from 'motion/react';
import { Lead, VisualIdentityConfig } from '../../types';
import { cn } from '../../lib/utils';
import { PreloadService } from '../../services/PreloadService';

import { useLeads } from '../../contexts/LeadRealtimeContext';

export const DashboardView = React.memo(({ 
  setActiveTab,
  visualConfig 
}: { 
  setActiveTab: (tab: any) => void;
  visualConfig: VisualIdentityConfig;
}) => {
  const { leads } = useLeads();
  const [dashboardFilter, setDashboardFilter] = React.useState({ period: 'mês', seller: 'all', origin: 'all' });
  
  const stats = React.useMemo(() => {
    const inService = leads.filter(l => l.status === 'Novo Lead' || l.status === 'Em Atendimento').length;
    const proposals = leads.filter(l => l.status === 'Em Cotação' || l.status === 'Proposta Enviada' || l.status === 'Negociação').length;
    const closedLeads = leads.filter(l => l.status === 'Fechado').length;

    // Funnel Data
    const funnelData = [
      { name: 'Leads', value: leads.length },
      { name: 'Atendimento', value: inService },
      { name: 'Propostas', value: proposals },
      { name: 'Fechados', value: closedLeads }
    ];

    // Conversion by Origin
    const origins = Array.from(new Set(leads.map(l => l.origin || 'Direto')));
    const conversionData = origins.map(origin => {
      const originLeads = leads.filter(l => (l.origin || 'Direto') === origin);
      const wins = originLeads.filter(l => l.status === 'Fechado').length;
      return {
        name: origin,
        value: originLeads.length,
        rate: originLeads.length > 0 ? (wins / originLeads.length) * 100 : 0
      };
    }).sort((a, b) => b.rate - a.rate);

    // Performance by Seller
    const sellers = Array.from(new Set(leads.map(l => l.ownerName || 'Não Atribuído')));
    const sellerData = sellers.map(name => {
      const sellerLeads = leads.filter(l => (l.ownerName || 'Não Atribuído') === name);
      const wins = sellerLeads.filter(l => l.status === 'Fechado').length;
      return {
        name,
        value: sellerLeads.length,
        wins,
        rate: sellerLeads.length > 0 ? (wins / sellerLeads.length) * 100 : 0
      };
    }).sort((a, b) => b.wins - a.wins);

    // Evolution Data (Last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const evolutionData = last7Days.map(date => {
      const count = leads.filter(l => {
        try {
          const leadDate = new Date(l.createdAt).toISOString().split('T')[0];
          return leadDate === date;
        } catch (e) {
          return false;
        }
      }).length;
      return {
        day: date.split('-')[2],
        leads: count
      };
    });

    return {
      inService,
      proposals,
      closedLeads,
      funnelData,
      conversionData,
      sellerData,
      evolutionData
    };
  }, [leads]);

  React.useEffect(() => {
    PreloadService.preloadInitialData();
  }, []);

  // Use unique IDs for recharts to avoid "Target ID already exists" if multiple instances exist
  const funnelId = React.useId();
  const barChartId = React.useId();

  return (
    <div className="space-y-4 max-w-[99%] mx-auto pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base md:text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
             <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-gold-deep" />
             Dashboard Executivo
          </h2>
          <p className="text-[0.6rem] font-black uppercase text-gold-deep/60 tracking-[0.15em] mt-0.5 ml-7 md:ml-8">Performance Comercial {visualConfig.companyName}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white p-0.5 rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
          {['hoje', 'semana', 'mês', 'trimestre'].map((period) => (
            <button
              key={period}
              onClick={() => setDashboardFilter({ ...dashboardFilter, period })}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                dashboardFilter.period === period 
                  ? "bg-brand-dark text-gold-deep shadow-md shadow-gold-deep/10" 
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              )}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Leads no Funil', value: leads.length, icon: Users, color: 'text-slate-900', bg: 'bg-white', trend: '+12.5%', isUp: true, detail: 'Base Total' },
          { label: 'Em Atendimento', value: stats.inService || 0, icon: MessageSquare, color: 'text-blue-600', bg: 'bg-white', trend: '+8.2%', isUp: true, detail: 'Conversas Ativas' },
          { label: 'Propostas Enviadas', value: stats.proposals || 0, icon: FileText, color: 'text-amber-600', bg: 'bg-white', trend: '+15.4%', isUp: true, detail: 'Em Negociação' },
          { label: 'Fechados no Período', value: stats.closedLeads || 0, icon: CheckCircle2, color: 'text-gold-deep', bg: 'bg-brand-dark', trend: '+1.5%', isUp: true, detail: 'Vendas Convertidas', inverted: true },
        ].map((card, i) => (
          <motion.div 
            key={card.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border overflow-hidden relative group transition-all duration-300",
              card.bg,
              card.inverted ? 'border-gold-deep/20 text-white shadow-lg shadow-gold-deep/5' : 'border-slate-100 hover:border-gold-deep/30'
            )}
          >
            <div className={cn(
              "absolute -right-3 -top-3 w-16 h-16 rounded-full blur-xl group-hover:scale-110 transition-transform",
              card.inverted ? 'bg-gold-deep/10' : 'bg-slate-50'
            )} />
            <div className="relative flex justify-between items-start mb-3 md:mb-4">
              <div className={cn("p-2.5 md:p-3 rounded-xl", card.inverted ? 'bg-gold-deep/20 text-gold-deep' : 'bg-slate-50 text-slate-400 group-hover:text-gold-deep transition-colors group-hover:bg-gold-deep/10')}>
                <card.icon className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[0.6rem] font-black", card.isUp ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10')}>
                {card.isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {card.trend}
              </div>
            </div>
            <p className={cn("text-2xl md:text-3xl font-display font-bold tracking-tighter mb-1.5", card.inverted ? 'text-white' : card.color)}>{card.value}</p>
            <p className={cn("text-[0.6rem] font-bold uppercase tracking-widest leading-tight", card.inverted ? 'text-gold-deep/60' : 'text-slate-400')}>{card.label}</p>
            <div className={cn("mt-3 md:mt-4 pt-3 border-t", card.inverted ? 'border-white/10' : 'border-slate-50')}>
               <span className={cn("text-[0.55rem] font-black uppercase tracking-widest", card.inverted ? 'text-slate-400' : 'text-slate-300')}>{card.detail}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-white p-5 md:p-7 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-8">
            <div>
               <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">Conversão por Estágio</h3>
               <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.15em] mt-0.5">Fluxo de passagens no funil de vendas</p>
            </div>
            <div className="flex gap-1.5 p-1 bg-slate-50 rounded-lg">
               <button className="px-3 py-1 bg-white shadow-sm rounded text-[8px] font-black uppercase tracking-widest text-slate-700">Funil</button>
               <button className="px-3 py-1 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Taxas %</button>
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart id={funnelId}>
                <Tooltip 
                  contentStyle={{ borderRadius: '14px', border: 'none', background: '#0A0A0A', color: '#fff', boxShadow: '0 15px 35px rgba(0,0,0,0.3)' }}
                  itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                />
                <Funnel
                  data={stats.funnelData.map((d: any, i: number) => ({
                    ...d,
                    fill: i === 0 ? '#94a3b8' : i === 1 ? '#64748b' : i === 2 ? '#CFA764' : i === 3 ? '#B8860B' : '#10b981'
                  }))}
                  dataKey="value"
                  isAnimationActive
                >
                  <LabelList position="right" fill="#64748b" stroke="none" dataKey="name" fontSize={9} />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-5">
           <div className="bg-brand-dark p-5 rounded-3xl shadow-xl shadow-gold-deep/5 border border-gold-deep/20 relative overflow-hidden group">
              <div className="absolute -right-3 -top-3 w-20 h-20 bg-gold-deep/10 rounded-full blur-xl group-hover:bg-gold-deep/20 transition-all" />
              <h3 className="text-[10px] font-black text-gold-deep uppercase tracking-widest flex items-center gap-2 mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Insights Inteligentes
              </h3>
              <div className="space-y-3">
                 {[
                   { 
                     text: `Você tem ${leads.filter(l => l.status === 'Novo Lead').length} leads aguardando primeiro contato.`, 
                     action: 'Iniciar',
                     alert: leads.filter(l => l.status === 'Novo Lead').length > 5,
                     tab: 'leads'
                   },
                   { 
                     text: `A origem "${stats.conversionData[0]?.name || '---'}" está com a melhor taxa (${(stats.conversionData[0]?.rate || 0).toFixed(1)}%).`, 
                     action: 'Ver Mais'
                   }
                 ].map((insight, idx) => (
                    <div key={idx} className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:border-gold-deep/30 transition-all cursor-pointer" onClick={() => insight.tab && setActiveTab(insight.tab as any)}>
                       <p className="text-[10px] text-slate-300 leading-relaxed">{insight.text}</p>
                       <div className="flex items-center justify-between mt-2 px-1">
                         <span className={cn(
                           "text-[7px] font-black uppercase tracking-widest flex items-center gap-1",
                           insight.alert ? "text-red-400" : "text-emerald-400"
                         )}>
                           {insight.alert ? <AlertCircle className="w-2 h-2" /> : <TrendingUp className="w-2 h-2" />}
                           {insight.alert ? 'Alerta' : 'Sugestão'}
                         </span>
                         <button className="text-[7px] font-black text-gold-deep uppercase tracking-[0.15em] hover:translate-x-0.5 transition-transform flex items-center gap-1">
                           {insight.action} <ArrowRight className="w-2 h-2" />
                         </button>
                       </div>
                    </div>
                 ))}
              </div>
           </div>

           <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 flex-1">
              <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest mb-4">Performance por Origem</h3>
              <div className="space-y-3">
                 {stats.conversionData.slice(0, 4).map((origin: any) => (
                   <div key={origin.name} className="space-y-1.5">
                      <div className="flex justify-between items-end">
                         <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter truncate">{origin.name}</span>
                         <span className="text-[9px] font-black text-slate-900">{origin.rate.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                         <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${origin.rate}%` }}
                            className="h-full bg-gold-deep rounded-full shadow-[0_0_6px_rgba(207,167,100,0.3)]" 
                         />
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">Evolução de Geração de Leads</h3>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase font-bold tracking-widest">Últimos 7 dias</p>
          </div>
        </div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart id={barChartId} data={stats.evolutionData || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" fontSize={9} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip 
                 contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}
                 cursor={{ fill: 'rgba(207,167,100,0.05)' }}
              />
              <Bar dataKey="leads" fill="#CFA764" radius={[4, 4, 0, 0]} barSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});
DashboardView.displayName = 'DashboardView';
