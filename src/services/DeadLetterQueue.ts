import { DataService } from './DataService';
import { SecurityService } from './SecurityService';
import { logger } from './LoggerService';

export interface DLQEntry {
  id: string;
  originalEvent: any;
  error: string;
  service: string;
  timestamp: string;
  organizationId: string;
  retries?: number;
}

/**
 * DeadLetterQueue (DLQ): Armazena eventos que falharam permanentemente para auditoria e reprocessamento manual.
 */
export class DeadLetterQueue {
  private static readonly COLLECTION = 'dead_letter_queue';

  public static async push(service: string, event: any, error: any, organizationId: string = 'default') {
    const entry: DLQEntry = {
      id: SecurityService.generateId(this.COLLECTION),
      originalEvent: event,
      error: error instanceof Error ? error.message : String(error),
      service,
      timestamp: new Date().toISOString(),
      organizationId,
      retries: event?.executionCount || 0
    };

    try {
      await DataService.create(this.COLLECTION, entry, 'sistema');
      logger.error('DLQ', `Event pushed to DLQ from ${service}`, { error: entry.error, eventId: event?.id });
    } catch (err) {
      // Fallback extreme
      console.error('[DLQ] CRITICAL FAIL: Could not push to DLQ', err);
    }
  }

  public static async list(organizationId: string) {
    // Implementar listagem se necessário para UI de admin
    return DataService.list(this.COLLECTION);
  }
}
