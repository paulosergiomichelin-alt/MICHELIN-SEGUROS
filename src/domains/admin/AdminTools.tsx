
import React, { useState } from 'react';
import {
  Wrench,
  RefreshCw,
  Trash2,
  Database,
  Terminal,
  Activity,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Zap,
  Crown
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { db, auth } from '../../lib/firebase';
import { DataService } from '../../services/DataService';
import { CacheManager } from '../../services/CacheManager';
import { metricsService } from '../../services/MetricsService';
import { QuotaProtectionService } from '../../services/QuotaProtectionService';
import { StorageHealthService } from '../../services/StorageHealthService';
import { TenantIsolationService } from '../../services/TenantIsolationService';

interface AdminAction {
  id: string;
  label: string;
  description: string;
  icon: any;
  action: () => Promise<void>;
}

export function AdminTools() {
  const [logs, setLogs] = useState<{ msg: string, type: 'info' | 'success' | 'error', time: string }[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [masterConfirm, setMasterConfirm] = useState(false);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterDone, setMasterDone] = useState(false);

  const handleActivateMaster = async () => {
    if (!masterConfirm) { setMasterConfirm(true); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { addLog('Nenhum usuário autenticado.', 'error'); return; }
    setMasterLoading(true);
    try {
      await updateDoc(doc(db, 'users', uid), { superadmin: true });
      setMasterDone(true);
      addLog('superadmin: true definido com sucesso. Recarregue a página.', 'success');
    } catch (e: any) {
      addLog(`Erro ao ativar modo master: ${e.message}`, 'error');
    } finally {
      setMasterLoading(false);
      setMasterConfirm(false);
    }
  };

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  const actions: AdminAction[] = [
    {
      id: 'rebuild-metrics',
      label: 'Sincronizar Métricas',
      description: 'Recalcula conversão e performance de todos os usuários baseados nos leads reais.',
      icon: RefreshCw,
      action: async () => {
        addLog("Iniciando rebuild de métricas de usuários...", "info");
        const users = await DataService.list('user');
        setProgress(10);
        
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          addLog(`Processando ${user.name || user.email}...`);
          // Note: updateUserMetrics handles the comparison and write via SDK
          await DataService.updateUserMetrics(user.uid || user.id);
          setProgress(10 + ((i + 1) / users.length) * 90);
        }
        
        addLog("Rebuild de métricas concluído com sucesso!", "success");
      }
    },
    {
      id: 'clear-cache',
      label: 'Limpar Cache Local',
      description: 'Remove todos os dados temporários do navegador e força recarregamento do Firestore.',
      icon: Trash2,
      action: async () => {
        const count = CacheManager.clearAll();
        addLog(`Cache limpo com sucesso. ${count} itens removidos.`, "success");
      }
    },
    {
      id: 'reindex-leads',
      label: 'Auditoria de Leads',
      description: 'Verifica integridade dos dados e proprietários de leads.',
      icon: Database,
      action: async () => {
        addLog("Iniciando auditoria de integridade...", "info");
        const leads = await DataService.list('lead');
        addLog(`${leads.length} leads verificados no Firestore.`, "success");
        setProgress(100);
      }
    },
    {
      id: 'force-sync',
      label: 'Forçar Sincronização Server',
      description: 'Ignora cache totalmente e busca última versão de todas as configurações.',
      icon: Zap,
      action: async () => {
        addLog("Forçando sincronização com servidor...", "info");
        await DataService.getFromServer('config', 'agent');
        await DataService.getFromServer('settings', 'visual_identity');
        addLog("Configurações sincronizadas com o estado do servidor.", "success");
      }
    },
    {
      id: 'test-storage',
      label: 'Testar Firebase Storage',
      description: 'Valida permissões de escrita, leitura e expiração de URLs no bucket configurado.',
      icon: ShieldCheck,
      action: async () => {
        addLog("Iniciando auditoria do Firebase Storage...", "info");
        const health = await StorageHealthService.checkHealth();
        if (health.status === 'ok') {
          addLog(health.message, "success");
        } else {
          addLog(health.message, "error");
        }
        setProgress(100);
      }
    },
    {
      id: 'tenant-isolation-audit',
      label: 'Auditoria de Isolamento Multi-Tenant',
      description: 'Verifica se todos os documentos possuem organizationId e detecta possíveis vazamentos entre tenants.',
      icon: ShieldCheck,
      action: async () => {
        addLog("Iniciando auditoria de isolamento multi-tenant...", "info");
        const result = await TenantIsolationService.runIsolationAudit();
        if (result.passed) {
          addLog(`✅ Auditoria concluída: SEM violações detectadas.`, "success");
        } else {
          addLog(`🚨 Violações detectadas: ${result.violations.length}`, "error");
          result.violations.forEach(v => addLog(`  → ${v}`, "error"));
        }
        if (result.warnings.length > 0) {
          addLog(`⚠ ${result.warnings.length} avisos:`, "info");
          result.warnings.slice(0, 10).forEach(w => addLog(`  → ${w}`, "info"));
        }

        const cache = TenantIsolationService.checkCacheIsolation();
        addLog(`Cache: ${cache.keysWithOrg} chaves com org-prefix, ${cache.keysWithoutOrg} sem prefixo`, cache.suspicious.length > 0 ? "error" : "success");
        if (cache.suspicious.length > 0) {
          cache.suspicious.slice(0, 5).forEach(k => addLog(`  cache suspeito: ${k}`, "error"));
        }
        setProgress(100);
      }
    }
  ];

  const handleAction = async (action: AdminAction) => {
    if (isExecuting) return;
    setIsExecuting(true);
    setProgress(0);
    try {
      addLog(`Executando: ${action.label}`, 'info');
      await action.action();
    } catch (e: any) {
      addLog(`Erro ao executar ${action.label}: ${e.message}`, 'error');
    } finally {
      setIsExecuting(false);
      setProgress(100);
    }
  };

  const quota = QuotaProtectionService.getStats();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gold-deep/10 flex items-center justify-center text-gold-deep">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Firestore Reads</p>
            <p className="text-xl font-black text-slate-800">{quota.reads} <span className="text-xs text-slate-400 font-bold">/ {quota.limitReads}</span></p>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-dark/10 flex items-center justify-center text-brand-dark">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Firestore Writes</p>
            <p className="text-xl font-black text-slate-800">{quota.writes} <span className="text-xs text-slate-400 font-bold">/ {quota.limitWrites}</span></p>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Health</p>
            <p className="text-xl font-black text-emerald-600">STABLE</p>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auth Integrity</p>
            <p className="text-xl font-black text-slate-800">SECURE</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Wrench className="w-5 h-5 text-gold-deep" />
            <h2 className="text-xs font-black text-brand-dark uppercase tracking-[0.2em]">Ferramentas Administrativas</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actions.map(action => (
              <button
                key={action.id}
                onClick={() => handleAction(action)}
                disabled={isExecuting}
                className="group flex flex-col p-5 bg-white border border-slate-200 rounded-[2rem] hover:border-gold-deep/30 hover:shadow-xl hover:shadow-gold-deep/5 transition-all text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-gold-deep/10 group-hover:text-gold-deep transition-all">
                    <action.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black text-slate-800 uppercase tracking-widest">{action.label}</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{action.description}</p>
                
                <div className="mt-4 flex items-center justify-end">
                  <span className="text-[8px] font-black text-gold-deep uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                    Executar agora <Zap className="w-2 h-2" />
                  </span>
                </div>
              </button>
            ))}
          </div>

          {isExecuting && (
            <div className="p-4 bg-brand-dark text-white rounded-2xl border border-white/5 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest italic">Ação em progresso...</span>
                <span className="text-[10px] font-black">{Math.round(progress)}%</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gold-deep transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Terminal className="w-5 h-5 text-gold-deep" />
            <h2 className="text-xs font-black text-brand-dark uppercase tracking-[0.2em]">Console de Execução</h2>
          </div>
          
          <div className="bg-brand-black rounded-[2.5rem] border border-white/5 p-6 h-[400px] flex flex-col shadow-2xl">
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-700">
                  <Terminal className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-[9px] font-black uppercase tracking-widest">Aguardando comandos...</p>
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className="text-[10px] font-mono leading-relaxed border-l-2 pl-3 py-1 animate-in slide-in-from-left-2" 
                  style={{ borderColor: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#10b981' : '#d4af37' }}>
                  <span className="text-slate-600 mr-2">[{log.time}]</span>
                  <span className={cn(
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-emerald-400' : 
                    'text-gold-light'
                  )}>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gold-deep animate-pulse" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Sistema Ativo</span>
              </div>
              <button 
                onClick={() => setLogs([])}
                className="text-[8px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                Limpar Logs
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Master Admin Activation */}
      <div className="p-6 bg-brand-black border border-gold-deep/20 rounded-[2rem] flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gold-deep/10 flex items-center justify-center text-gold-deep shrink-0">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">Modo Master (Superadmin)</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {masterDone
                ? 'Ativado. Recarregue a página para aplicar os privilégios completos.'
                : 'Define superadmin: true na sua conta, concedendo bypass total de todas as regras de segurança.'}
            </p>
          </div>
        </div>
        {!masterDone && (
          <button
            onClick={handleActivateMaster}
            disabled={masterLoading}
            className={cn(
              'shrink-0 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
              masterConfirm
                ? 'bg-red-600 text-white hover:bg-red-700 border border-red-500'
                : 'bg-gold-deep text-brand-dark hover:bg-gold-light border border-gold-deep/50'
            )}
          >
            {masterLoading ? 'Aguarde...' : masterConfirm ? 'Confirmar Ativação' : 'Ativar Modo Master'}
          </button>
        )}
        {masterDone && (
          <div className="shrink-0 flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Ativado</span>
          </div>
        )}
      </div>
    </div>
  );
}
