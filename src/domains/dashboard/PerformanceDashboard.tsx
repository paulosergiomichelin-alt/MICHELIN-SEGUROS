import React, { useState, useEffect } from 'react';
import { metricsService } from '../../services/MetricsService';
import { CacheManager } from '../../services/CacheManager';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Zap, Database, Cpu, Trash2, BarChart3, RefreshCw } from 'lucide-react';

export const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [stats, setStats] = useState({
    cacheHits: 0,
    cacheMisses: 0,
    dbWrites: 0,
    dbReads: 0,
    latency: 0
  });

  const refresh = () => {
    setMetrics(metricsService.getRecent(20));
    setStats(metricsService.getStats());
  };

  useEffect(() => {
    // Initial fetch deferred to avoid synchronous setState inside effect warning
    const initialRefresh = setTimeout(refresh, 0);
    
    const interval = setInterval(refresh, 5000);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(interval);
    };
  }, []);

  const clearCache = () => {
    CacheManager.clearAll();
    refresh();
  };

  const hitRate = stats.cacheHits + stats.cacheMisses > 0 
    ? ((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(1) 
    : '0';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-800">Performance & Optimization</h2>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={refresh}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button 
            onClick={clearCache}
            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-500"
            title="Limpar Cache"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Cache Hit Rate</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{hitRate}%</div>
            <div className="text-[10px] text-blue-600/70 mt-1">{stats.cacheHits} hits / {stats.cacheMisses} misses</div>
          </div>

          <div className="p-4 bg-green-50 rounded-xl border border-green-100">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Database className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">DB Operations</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.dbReads + stats.dbWrites}</div>
            <div className="text-[10px] text-green-600/70 mt-1">{stats.dbReads} reads / {stats.dbWrites} writes</div>
          </div>

          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <Cpu className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Avg Latency</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.latency.toFixed(0)}<span className="text-sm font-normal text-gray-500 ml-1">ms</span></div>
            <div className="text-[10px] text-purple-600/70 mt-1">AI & Processing</div>
          </div>

          <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Queue Load</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">Normal</div>
            <div className="text-[10px] text-orange-600/70 mt-1">Resilience active</div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Recent Performance Events
          </h3>
          <div className="bg-gray-900 rounded-lg p-3 font-mono text-[11px] h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
            <AnimatePresence initial={false}>
              {metrics.length === 0 ? (
                <div className="text-gray-500 italic">Aguardando eventos...</div>
              ) : (
                metrics.map((m, i) => (
                  <motion.div 
                    key={m.timestamp + i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mb-1 flex gap-2"
                  >
                    <span className="text-gray-500">[{new Date(m.timestamp).toLocaleTimeString()}]</span>
                    <span className={m.name.includes('error') ? 'text-red-400' : 'text-green-400'}>{m.name.padEnd(25)}</span>
                    <span className="text-blue-300">{m.value.toString().padStart(6)}</span>
                    <span className="text-gray-400">{JSON.stringify(m.tags || {})}</span>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
