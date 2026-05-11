import React, { useEffect, useState } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { realtimeService, ConnectionState } from '../../services/RealtimeService';
import { Activity, Zap, AlertTriangle, Clock, Server, Wifi, Cpu, FileText, Printer, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DataService } from '../../services/DataService';

export const SystemHealth = () => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>(realtimeService.getState());

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    if (metrics.length === 0) return;
    
    const headers = ['Nome', 'Valor', 'Contexto', 'Timestamp'];
    const rows = metrics.map(m => [
      m.name,
      m.value,
      JSON.stringify(m.tags || {}).replace(/"/g, '""'),
      m.timestamp
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `saude_sistema_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const unsubRT = realtimeService.subscribe(setConnection);
    
    const fetchMetrics = async () => {
      try {
        const data = await DataService.list('system_metrics', [
          orderBy('timestamp', 'desc'),
          limit(50)
        ]);
        setMetrics(data);
        setLoading(false);
      } catch (error: any) {
        if (error.code === 'resource-exhausted') {
          DataService.notifyQuotaExceeded();
        }
        console.error("Health Fetch Error:", error);
        setLoading(false);
      }
    };

    fetchMetrics();
    
    return () => {
      unsubRT();
    };
  }, []);

  const getMetricValue = (name: string, type: 'avg' | 'count' = 'avg') => {
    const filtered = metrics.filter(m => m.name === name);
    if (filtered.length === 0) return 0;
    if (type === 'count') return filtered.length;
    const sum = filtered.reduce((acc, m) => acc + (m.value || 0), 0);
    return Math.round(sum / filtered.length);
  };

  const getAlerts = () => {
    return metrics.filter(m => m.name === 'ws_fallback' || m.name === 'ai_error' || m.name === 'processing_error');
  };

  return (
    <div id="system-health-dashboard" className="p-6 overflow-auto h-full bg-[#f8fafc]">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header de Status */}
        <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Activity className="text-indigo-600" />
              Saúde do Sistema
            </h1>
            <p className="text-slate-500 text-sm mt-1">Observabilidade em tempo real e performance de IA</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-4 border-r pr-4 border-slate-200 print:hidden">
              <button 
                onClick={handlePrint}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors flex items-center gap-2 text-sm font-medium"
                title="Imprimir Relatório"
              >
                <Printer size={18} />
                <span className="hidden sm:inline">Imprimir</span>
              </button>
              <button 
                onClick={handleExport}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors flex items-center gap-2 text-sm font-medium"
                title="Exportar CSV"
              >
                <Download size={18} />
                <span className="hidden sm:inline">Exportar</span>
              </button>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2",
              connection === ConnectionState.OPEN ? "bg-emerald-50 text-emerald-600" : 
              connection === ConnectionState.RECONNECTING ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
            )}>
              <Wifi size={16} />
              {connection}
            </div>
            <div className="bg-slate-50 px-4 py-2 rounded-full text-sm font-medium text-slate-600">
              Versão 2.5.0
            </div>
          </div>
        </div>

        {/* Grades de Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard 
            id="metric-ai-latency"
            title="Latência IA" 
            value={`${getMetricValue('ai_response_latency')}ms`} 
            subtitle="Média de resposta"
            icon={<Cpu className="text-indigo-500" />}
          />
          <MetricCard 
            id="metric-extraction-latency"
            title="Extração Doc" 
            value={`${getMetricValue('extraction_latency')}ms`} 
            subtitle="Processamento OCR/IA"
            icon={<FileText className="text-sky-500" />}
          />
          <MetricCard 
            id="metric-process-latency"
            title="Pipeline Total" 
            value={`${getMetricValue('total_processing_latency')}ms`} 
            subtitle="End-to-End Latency"
            icon={<Zap className="text-amber-500" />}
          />
          <MetricCard 
            id="metric-ws-retry"
            title="Fallback Rate" 
            value={`${getMetricValue('ws_fallback', 'count')}`} 
            subtitle="Sessões via Polling"
            icon={<AlertTriangle className={cn(getMetricValue('ws_fallback', 'count') > 0 ? "text-red-500" : "text-slate-300")} />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Logs Recentes */}
          <div id="recent-metric-logs" className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="p-4 border-b border-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Eventos de Telemetria</h3>
              <Server size={16} className="text-slate-400" />
            </div>
            <div className="flex-1 overflow-auto max-h-[400px]">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                  <tr>
                    <th className="px-4 py-2">Evento</th>
                    <th className="px-4 py-2">Valor</th>
                    <th className="px-4 py-2">Contexto</th>
                    <th className="px-4 py-2">Tempo</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                        <Activity className="animate-spin inline-block mr-2" size={16} />
                        Carregando telemetria...
                      </td>
                    </tr>
                  ) : metrics.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                        Nenhum evento registrado recentemente.
                      </td>
                    </tr>
                  ) : (
                    metrics.map((m) => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-600">{m.name}</td>
                        <td className="px-4 py-3 font-medium">{m.value}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{JSON.stringify(m.tags || {})}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {new Date(m.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alertas */}
          <div id="active-system-alerts" className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="p-4 border-b border-slate-50">
              <h3 className="font-bold text-slate-800">Alertas Ativos</h3>
            </div>
            <div className="p-4 space-y-3">
              {getAlerts().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Activity size={32} className="mb-2 opacity-20" />
                  <p className="text-sm">Nenhuma instabilidade detectada</p>
                </div>
              ) : (
                getAlerts().map((a) => (
                  <div key={a.id} className="p-3 bg-red-50 border border-red-100 rounded-xl flex gap-3">
                    <AlertTriangle className="text-red-500 shrink-0" size={18} />
                    <div>
                      <p className="text-xs font-bold text-red-700">{a.name.toUpperCase()}</p>
                      <p className="text-[10px] text-red-600">{new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ id, title, value, subtitle, icon }: any) => (
  <div id={id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{title}</span>
      <div className="p-2 bg-slate-50 rounded-lg">
        {icon}
      </div>
    </div>
    <div>
      <div className="text-2xl font-black text-slate-800">{value}</div>
      <div className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-tighter">{subtitle}</div>
    </div>
  </div>
);
