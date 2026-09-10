import { auth } from '../lib/firebase';
import { SecurityService } from './SecurityService';
import { DataService } from './DataService';

export interface MetricEntry {
  id?: string;
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: string;
}

class MetricsService {
  private buffer: MetricEntry[] = [];
  private flushInterval = 30000; // 30s
  private maxBufferSize = 25;    // Volume-based flush
  private isFlushing = false;
  private maxRetries = 3;

  constructor() {
    setInterval(() => this.flush(), this.flushInterval);
    if (typeof window !== 'undefined') {
       (window as any).metricsService = this;
    }
  }

  public track(name: string, value: number, tags?: Record<string, string>) {
    const entry: MetricEntry = {
      name,
      value,
      tags,
      timestamp: new Date().toISOString(),
    };
    
    this.buffer.push(entry);
    
    // Intelligent Flush logic
    const isCritical = name.includes('error') || name.includes('critical');
    if (this.buffer.length >= this.maxBufferSize || isCritical) {
      this.flush();
    }
    
    this.checkAlerts(entry);
  }

  private checkAlerts(entry: MetricEntry) {
    if (entry.name === 'ws_fallback' && entry.value === 1) {
      this.triggerAlert('Alta incidência de Fallback Polling detectada.');
    }
    if (entry.name === 'ai_error' && entry.value === 1) {
      this.triggerAlert('Falha na resposta da IA detectada.');
    }
  }

  private async triggerAlert(message: string) {
    if (!auth.currentUser) return;
    
    try {
      await DataService.create('notification', {
        id: SecurityService.generateId('notifications'),
        user_id: 'system',
        title: '🚨 Alerta de Saúde do Sistema',
        message,
        type: 'acao_necessaria',
        priority: 'alta',
        read: false,
        created_at: new Date().toISOString(),
        created_by: 'sistema'
      });
    } catch (e) {
      console.warn('[METRICS_ALERT_FAIL]', e);
    }
  }

  private async flush(retryCount = 0) {
    if (this.buffer.length === 0 || this.isFlushing) return;
    
    const user = auth.currentUser;
    if (!user) return;

    this.isFlushing = true;
    const batchData = [...this.buffer];

    const today = new Date().toISOString().split('T')[0];
    const userMetricsId = `${user.uid}_${today}`;

    // Aggregate values in memory before batching
    const aggregations: Record<string, number> = {};
    batchData.forEach(m => {
      aggregations[m.name] = (aggregations[m.name] || 0) + m.value;
    });

    try {
      // metrics_users/metrics_daily guardam um jsonb `data` de granularidade diária —
      // sem dot-notation de increment como no Firestore, lê o valor atual, soma em
      // memória e regrava por completo (aceitável: métrica por usuário/dia, baixa
      // concorrência simultânea no mesmo dia).
      const [existingUserMetrics, existingDailyMetrics] = await Promise.all([
        DataService.get('metrics_users', userMetricsId),
        DataService.get('metrics_daily', today),
      ]);

      const mergeValues = (existing: any) => {
        const values = { ...(existing?.data?.values ?? {}) };
        Object.entries(aggregations).forEach(([name, value]) => {
          values[name] = (values[name] || 0) + value;
        });
        return { values, updatedAt: new Date().toISOString(), userId: user.uid };
      };

      await DataService.save('metrics_users', userMetricsId, {
        id: userMetricsId, userId: user.uid, day: today, data: mergeValues(existingUserMetrics),
      });
      await DataService.save('metrics_daily', today, {
        day: today, data: mergeValues(existingDailyMetrics),
      });

      // Keep raw logs in separate collection for audit but with auto-id (bigserial —
      // sem PK de negócio, cada evento vai direto via create/insert simples, não via
      // _batch, para deixar o Postgres gerar o id automaticamente).
      await Promise.all(batchData.map((m) => DataService.create('metrics_raw', { event: { ...m, userId: user.uid } })));

      this.buffer = this.buffer.filter(m => !batchData.includes(m));
      console.log(`[METRICS_BATCH_SUCCESS] ${batchData.length} distributed metrics persisted.`);
    } catch (err) {
      if (retryCount < this.maxRetries) {
        setTimeout(() => {
          this.isFlushing = false;
          this.flush(retryCount + 1);
        }, 5000);
        return;
      }
    } finally {
      this.isFlushing = false;
    }
  }

  public startTimer() {
    const start = performance.now();
    return {
      stop: (name: string, tags?: Record<string, string>) => {
        const duration = performance.now() - start;
        this.track(name, Math.round(duration), tags);
        return duration;
      }
    };
  }

  public getRecent(count: number = 20): MetricEntry[] {
    return [...this.buffer].reverse().slice(0, count);
  }

  public getStats() {
    const stats: any = {
      cache_hit: 0,
      cache_miss: 0,
      db_reads_actual: 0,
      db_writes_actual: 0,
      latency_sum: 0,
      latency_count: 0
    };

    this.buffer.forEach(m => {
      if (typeof stats[m.name] === 'number') {
        stats[m.name] += m.value;
      }
      if (m.name.includes('latency') || m.name.includes('time')) {
        stats.latency_sum += m.value;
        stats.latency_count++;
      }
    });

    return {
      cacheHits: stats.cache_hit,
      cacheMisses: stats.cache_miss,
      dbReads: stats.db_reads_actual,
      dbWrites: stats.db_writes_actual,
      latency: stats.latency_count > 0 ? stats.latency_sum / stats.latency_count : 0
    };
  }
}

export const metricsService = new MetricsService();
