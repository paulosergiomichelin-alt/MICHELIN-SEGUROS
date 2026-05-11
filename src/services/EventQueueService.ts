
import { SecurityService } from './SecurityService';

type Task = () => Promise<void>;

interface QueueItem {
  task: Task;
  type: 'DOCUMENT' | 'MESSAGE' | 'LEAD_UPDATE';
  status: 'PENDING' | 'PROCESSING' | 'DONE';
  id: string;
}

class EventQueueService {
  private queues: Map<string, { items: QueueItem[]; processing: boolean }> = new Map();

  async enqueue(leadId: string, task: Task, type: 'DOCUMENT' | 'MESSAGE' | 'LEAD_UPDATE' = 'MESSAGE') {
    if (!this.queues.has(leadId)) {
      this.queues.set(leadId, { items: [], processing: false });
    }

    const queue = this.queues.get(leadId)!;
    const item: QueueItem = {
      task,
      type,
      status: 'PENDING',
      id: SecurityService.uuid()
    };
    
    if (type === 'DOCUMENT') {
      queue.items.unshift(item); // Prioridade absoluta
    } else {
      queue.items.push(item);
    }

    this.processQueue(leadId);
  }

  private async processQueue(leadId: string) {
    const queue = this.queues.get(leadId);
    if (!queue || queue.processing || queue.items.length === 0) return;

    queue.processing = true;

    while (queue.items.length > 0) {
      // 7. BLOQUEAR DUPLA EXECUÇÃO (EVENT QUEUE LOCK)
      const nextItemIndex = queue.items.findIndex(i => i.type === 'DOCUMENT' && i.status === 'PENDING');
      const itemIndex = nextItemIndex !== -1 ? nextItemIndex : queue.items.findIndex(i => i.status === 'PENDING');
      
      if (itemIndex === -1) break;

      const item = queue.items[itemIndex];
      if (item.status !== 'PENDING') {
        queue.items.splice(itemIndex, 1);
        continue;
      }

      // REGRA CRÍTICA: Não processar MESSAGE enquanto houver DOCUMENT PENDING ou PROCESSING
      if (item.type === 'MESSAGE' && queue.items.some(i => i.type === 'DOCUMENT' && i.status !== 'DONE')) {
        console.log(`[EVENT_QUEUE] Bloqueando MESSAGE para lead ${leadId} pois há DOCUMENT pendente.`);
        break; // Para o loop e espera o próximo processQueue
      }

      item.status = 'PROCESSING';
      console.log(`[EVENT_QUEUE] [${item.type}] status: PROCESSING for lead ${leadId}`);

      // Implementation 6: Monitoramento de Stuck Tasks
      const watchdog = setTimeout(() => {
        if (item.status === 'PROCESSING' && item.type === 'DOCUMENT') {
          console.error(`[EVENT_QUEUE] [FAILSAFE] DOCUMENT task ${item.id} stuck for lead ${leadId}. Re-evaluating.`);
          // This allows subsequent messages to eventually error out or proceed if the hung task is handled
        }
      }, 90000); // 90s watchdog (increased from 10s)

      try {
        await item.task();
        item.status = 'DONE';
        console.log(`[EVENT_QUEUE] [${item.type}] status: DONE for lead ${leadId}`);
      } catch (error) {
        console.error(`[EVENT_QUEUE] Error processing ${item.type} for lead ${leadId}:`, error);
        item.status = 'DONE'; // Marca como done para não travar a fila perpetuamente
      } finally {
        clearTimeout(watchdog);
      }
      
      // Remove itens DONE da fila para não crescer indefinidamente
      queue.items = queue.items.filter(i => i.status !== 'DONE');
    }

    queue.processing = false;
  }

  isProcessing(leadId: string): boolean {
    return this.queues.get(leadId)?.processing || false;
  }
}

export const eventQueueService = new EventQueueService();
