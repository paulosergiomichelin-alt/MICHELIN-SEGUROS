import { writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logger } from './LoggerService';

export interface BatchOperation {
  type: 'set' | 'update' | 'delete';
  collection: string;
  id: string;
  data?: any;
}

/**
 * BatchCoordinatorService: Consolida múltiplas operações no Firestore em um único commit atômico.
 * Reduz custos e previne estados inconsistentes.
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

    const batch = writeBatch(db);
    
    for (const op of operations) {
      const ref = doc(db, op.collection, op.id);
      
      switch (op.type) {
        case 'set':
          batch.set(ref, { ...op.data, updatedAt: new Date().toISOString() });
          break;
        case 'update':
          batch.update(ref, { ...op.data, updatedAt: new Date().toISOString() });
          break;
        case 'delete':
          batch.delete(ref);
          break;
      }
    }

    try {
      await batch.commit();
      logger.info('BATCH', `Commit de ${operations.length} operações realizado com sucesso. Fonte: ${source}`);
    } catch (error) {
      logger.error('BATCH', `Falha no commit do batch (${operations.length} ops)`, error);
      throw error;
    }
  }
}
