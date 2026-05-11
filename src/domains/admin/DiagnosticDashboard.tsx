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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-orange-600" />
            Centro de Diagnóstico e Observabilidade
          </h1>
          <p className="text-gray-500 mt-1">Monitore falhas de orquestração e integridade multi-tenant.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleMigrateLegacy}
            className="px-4 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Database className="w-4 h-4" />
            Migrar Dados Legados (Default Org)
          </button>
          <button 
            onClick={loadDLQ}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Falhas Críticas (DLQ)', value: dlqItems.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Saúde da IA', value: '98.2%', icon: Cpu, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Latência Firestore', value: '45ms', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Organizações Ativas', value: 1, icon: User, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.bg} p-4 rounded-xl border border-white/50 shadow-sm`}>
            <div className="flex justify-between items-start">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{stat.value}</div>
            <div className="text-sm text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* DLQ Area */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
            Dead Letter Queue (DLQ)
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Filtrar erros..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 font-medium text-gray-600">Timestamp</th>
                <th className="px-4 py-3 font-medium text-gray-600">Serviço</th>
                <th className="px-4 py-3 font-medium text-gray-600">Organização</th>
                <th className="px-4 py-3 font-medium text-gray-600">Mensagem de Erro</th>
                <th className="px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    Nenhuma falha crítica detectada no período.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap">
                      {format(new Date(item.timestamp), 'dd MMM, HH:mm', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">
                        {item.service}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{item.organizationId}</td>
                    <td className="px-4 py-4">
                      <div className="text-red-700 font-medium truncate max-w-sm" title={item.error}>
                        {item.error}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button className="text-orange-600 hover:text-orange-700 font-medium">Reprocessar</button>
                        <button className="text-gray-400 hover:text-red-600">
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
  );
};
