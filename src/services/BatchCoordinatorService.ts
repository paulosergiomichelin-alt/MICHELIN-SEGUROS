import { dataApiClient } from '../lib/dataApiClient';
import { logger } from './LoggerService';

export interface BatchOperation {
  type: 'set' | 'update' | 'delete';
  collection: string;
  id: string;
  data?: any;
}

/**
 * BatchCoordinatorService: Consolida múltiplas operações no Postgres em uma única
 * transação atômica (POST /api/data/_batch). Reduz round-trips e previne estados
 * inconsistentes.
 */
export class BatchCoordinatorService {
  private static readonly MAX_BATCH_SIZE = 500;

  /**
   * Executa um conjunto de operações de forma atômica.
   */
  public static async execute(operations: BatchOperation[], source: string = 'SYSTEM'): Promise<void> {
    if (operations.length === 0) return;

    if (operations.length > this.MAX_BATCH_SIZE) {
      // Split into chunks if exceeds 500
      for (let i = 0; i < operations.length; i += this.MAX_BATCH_SIZE) {
        await this.execute(operations.slice(i, i + this.MAX_BATCH_SIZE), source);
      }
      return;
    }

    const payload = operations.map((op) => ({
      type: op.type,
      entity: op.collection,
      id: op.id,
      data: op.type === 'delete' ? undefined : { ...op.data, updatedAt: new Date().toISOString() },
    }));

    try {
      await dataApiClient.create('_batch' as any, { operations: payload });
      logger.info('BATCH', `Commit de ${operations.length} operações realizado com sucesso. Fonte: ${source}`);
    } catch (error) {
      logger.error('BATCH', `Falha no commit do batch (${operations.length} ops)`, error);
      throw error;
    }
  }
}
