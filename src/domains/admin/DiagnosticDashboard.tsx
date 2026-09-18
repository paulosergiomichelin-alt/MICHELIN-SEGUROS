import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  AlertTriangle, 
  RefreshCcw, 
  Trash2, 
  Database, 
  Clock, 
  Cpu, 
  User, 
  ChevronRight, 
  ShieldAlert,
  Search
} from 'lucide-react';
import { DataService } from '../../services/DataService';
import { DeadLetterQueue, DLQEntry } from '../../services/DeadLetterQueue';
import { MigrationRunnerService } from '../../services/MigrationRunnerService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PageHeader } from '../../components/ui';

export const DiagnosticDashboard: React.FC = () => {
  const [dlqItems, setDlqItems] = useState<DLQEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [migrationStatus, setMigrationStatus] = useState<any>(null);

  const loadDLQ = async () => {
    setLoading(true);
    try {
      const items = await DeadLetterQueue.list('default');
      setDlqItems(items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadDLQ();
    };
    init();
  }, []);

  const handleMigrateLegacy = async () => {
    if (!window.confirm("Deseja iniciar a migração de documentos sem organizationId? Isso afetará todos os registros legados.")) return;
    
    setLoading(true);
    try {
      const collections = ['leads', 'messages', 'follow_up', 'system_metrics'];
      const stats = [];
      for (const coll of collections) {
        const res = await MigrationRunnerService.migrateCollection(coll, 'default', false);
        stats.push(res);
      }
      setMigrationStatus(stats);
      alert("Migração concluída! Verifique os logs de auditoria.");
    } catch (err) {
      alert("Erro na migração. Verifique o console.");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = dlqItems.filter(item => 
    item.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.error.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.organizationId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <PageHeader
          icon={ShieldAlert}
          title="Centro de Diagnóstico e Observabilidade"
          subtitle="Monitore falhas de orquestração e integridade multi-tenant."
        />
        <div className="flex gap-3">
          <button
            onClick={handleMigrateLegacy}
            className="px-4 py-2 bg-[#FFF3DC] text-[#B8860B] border border-[#B8860B]/20 rounded-lg hover:bg-[#FFF3DC]/70 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Database className="w-4 h-4" />
            Migrar Dados Legados (Default Org)
          </button>
          <button
            onClick={loadDLQ}
            className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Falhas Críticas (DLQ)', value: dlqItems.length, icon: AlertTriangle, color: 'text-[#C0392B]', bg: 'bg-[#FDE4E4]' },
          { label: 'Saúde da IA', value: '98.2%', icon: Cpu, color: 'text-[#1F8A4C]', bg: 'bg-[#E4F5EA]' },
          { label: 'Latência Firestore', value: '45ms', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-100' },
          { label: 'Organizações Ativas', value: 1, icon: User, color: 'text-gold-deep', bg: 'bg-gold-deep/10' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.bg} p-4 rounded-xl border border-white/50 shadow-sm`}>
            <div className="flex justify-between items-start">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-800">{stat.value}</div>
            <div className="text-sm text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* DLQ Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center flex-wrap gap-3">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#B8860B]" />
            Dead Letter Queue (DLQ)
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar erros..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-[#1B4D8F]/15 focus:border-[#1B4D8F]/60 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 font-medium text-slate-500">Timestamp</th>
                <th className="px-4 py-3 font-medium text-slate-500">Serviço</th>
                <th className="px-4 py-3 font-medium text-slate-500">Organização</th>
                <th className="px-4 py-3 font-medium text-slate-500">Mensagem de Erro</th>
                <th className="px-4 py-3 font-medium text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    Nenhuma falha crítica detectada no período.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 text-slate-500 whitespace-nowrap">
                      {format(new Date(item.timestamp), 'dd MMM, HH:mm', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-mono">
                        {item.service}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{item.organizationId}</td>
                    <td className="px-4 py-4">
                      <div className="text-[#C0392B] font-medium truncate max-w-sm" title={item.error}>
                        {item.error}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button className="text-[#1B4D8F] hover:text-[#153E73] font-medium">Reprocessar</button>
                        <button className="text-slate-400 hover:text-[#C0392B]">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
};
