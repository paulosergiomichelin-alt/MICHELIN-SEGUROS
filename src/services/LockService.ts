import { auth } from '../lib/firebase';
import { dataApiClient } from '../lib/dataApiClient';
import { logger } from './LoggerService';
import { SecurityService } from './SecurityService';

/**
 * LockService: Gerencia travas distribuídas via Postgres (processing_locks) para evitar
 * concorrência SaaS. Design robusto com isolamento de tenant e proteção contra DoS.
 */
export class LockService {
  private static instance: LockService;
  private constructor() {}

  public static getInstance(): LockService {
    if (!this.instance) this.instance = new LockService();
    return this.instance;
  }

  private static readonly DEFAULT_LOCK_DURATION_MS = 30000; // 30 segundos
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

    try {
      const { acquired } = await dataApiClient.create('_locks/acquire' as any, {
        id: lockKey, ownerId, instanceId: LockService.INSTANCE_ID, ttlMs: durationMs,
      });
      return acquired;
    } catch (e) {
      logger.error('LOCK_SERVICE', `Falha ao adquirir lock ${lockKey}`, e);
      return false;
    }
  }

  public async releaseLock(resourceId: string, type: string, organizationId: string): Promise<void> {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId || !organizationId) return;

    const lockKey = `${organizationId}:${type}:${resourceId}`;

    try {
      await dataApiClient.create('_locks/release' as any, { id: lockKey, ownerId });
    } catch (e) {
      logger.error('LOCK_SERVICE', `Falha ao liberar lock ${lockKey}`, e);
    }
  }

  public async forceRelease(resourceId: string, type: string, organizationId: string): Promise<void> {
    const lockKey = `${organizationId}:${type}:${resourceId}`;
    await dataApiClient.remove('processing_locks', lockKey);
  }
}
