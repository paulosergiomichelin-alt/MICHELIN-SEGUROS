
import { 
  doc, 
  runTransaction, 
  serverTimestamp, 
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { logger } from './LoggerService';
import { SecurityService } from './SecurityService';

export interface Lock {
  resourceId: string;
  type: string;
  ownerId: string;
  organizationId: string;
  instanceId: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

/**
 * LockService: Gerencia travas distribuídas no Firestore para evitar concorrência SaaS.
 * Design robusto com isolamento de tenant e proteção contra DoS.
 */
export class LockService {
  private static instance: LockService;
  private constructor() {}

  public static getInstance(): LockService {
    if (!this.instance) this.instance = new LockService();
    return this.instance;
  }

  private static readonly LOCKS_COLLECTION = 'processing_locks';
  private static readonly DEFAULT_LOCK_DURATION_MS = 30000; // REDUCED: 30 seconds for better responsiveness
  private static readonly INSTANCE_ID = SecurityService.uuid(); // ID único desta instância do navegador

  public async acquireLock(
    resourceId: string, 
    type: string, 
    organizationId: string,
    durationMs: number = LockService.DEFAULT_LOCK_DURATION_MS
  ): Promise<boolean> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId || !organizationId) {
      console.warn('[LockService] Tentativa de lock sem ownerId ou organizationId');
      return false;
    }

    const lockKey = `${organizationId}:${type}:${resourceId}`;
    const lockRef = doc(db, LockService.LOCKS_COLLECTION, lockKey);

    try {
      return await runTransaction(db, async (transaction) => {
        const lockDoc = await transaction.get(lockRef);
        const now = Date.now();

        if (lockDoc.exists()) {
          const data = lockDoc.data() as Lock;
          const expiresAtMs = data.expiresAt.toMillis();

          // Se o lock ainda é válido e não pertence a este usuário/instância
          if (now < expiresAtMs && (data.ownerId !== ownerId || data.instanceId !== LockService.INSTANCE_ID)) {
            return false; 
          }
        }

        // Adquire novo lock ou renova o atual
        transaction.set(lockRef, {
          resourceId,
          type,
          ownerId,
          organizationId,
          instanceId: LockService.INSTANCE_ID,
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(now + durationMs)
        });

        return true;
      });
    } catch (e) {
      logger.error('LOCK_SERVICE', `Falha ao adquirir lock ${lockKey}`, e);
      return false;
    }
  }

  public async releaseLock(resourceId: string, type: string, organizationId: string): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId || !organizationId) return;

    const lockKey = `${organizationId}:${type}:${resourceId}`;
    const lockRef = doc(db, LockService.LOCKS_COLLECTION, lockKey);
    
    try {
      await runTransaction(db, async (transaction) => {
        const lockDoc = await transaction.get(lockRef);
        if (lockDoc.exists()) {
          const data = lockDoc.data() as Lock;
          if (data.ownerId === ownerId && data.organizationId === organizationId) {
            transaction.delete(lockRef);
          }
        }
      });
    } catch (e) {
      logger.error('LOCK_SERVICE', `Falha ao liberar lock ${lockKey}`, e);
    }
  }

  public async forceRelease(resourceId: string, type: string, organizationId: string): Promise<void> {
    const lockKey = `${organizationId}:${type}:${resourceId}`;
    await deleteDoc(doc(db, LockService.LOCKS_COLLECTION, lockKey));
  }
}
