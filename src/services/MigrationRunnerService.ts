import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  query, 
  where, 
  limit, 
  startAfter, 
  QueryDocumentSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logger } from './LoggerService';
import { SecurityService } from './SecurityService';

export interface MigrationStats {
  collection: string;
  processed: number;
  updated: number;
  failed: number;
  errors: string[];
}

/**
 * MigrationRunnerService: Gerencia a migração de dados legados para o modelo SaaS.
 * Focado em injetar organizationId em documentos órfãos.
 */
export class MigrationRunnerService {
  private static readonly BATCH_SIZE = 100;
  private static readonly MIGRATION_LOGS = 'migration_logs';

  /**
   * Executa a migração para uma coleção específica.
   */
  public static async migrateCollection(
    collName: string, 
    targetOrgId: string, 
    dryRun: boolean = true
  ): Promise<MigrationStats> {
    const stats: MigrationStats = {
      collection: collName,
      processed: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    logger.info('MIGRATION', `Iniciando migração de ${collName} para Org: ${targetOrgId} (DryRun: ${dryRun})`);

    try {
      let lastVisible: QueryDocumentSnapshot | null = null;
      let hasMore = true;

      while (hasMore) {
        let q: any; // Using any for simplicity in this helper, but ideally Query
        if (lastVisible) {
          q = query(collection(db, collName), limit(this.BATCH_SIZE), startAfter(lastVisible));
        } else {
          q = query(collection(db, collName), limit(this.BATCH_SIZE));
        }

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        const batch = dryRun ? null : writeBatch(db);
        let batchCount = 0;

        for (const docSnap of snapshot.docs) {
          stats.processed++;
          const data = docSnap.data() as any;

          // Verifica se o documento precisa de migração (não tem organizationId ou está incorreto)
          if (!data.organizationId || data.organizationId === 'default' || data.organizationId === '') {
            if (!dryRun && batch) {
              batch.update(docSnap.ref, { 
                organizationId: targetOrgId,
                migrationInfo: {
                  migratedAt: new Date().toISOString(),
                  previousOrg: data.organizationId || 'none'
                }
              });
              batchCount++;
            }
            stats.updated++;
          }
        }

        if (!dryRun && batch && batchCount > 0) {
          await batch.commit();
          logger.info('MIGRATION', `Batch de ${batchCount} documentos commitado em ${collName}`);
        }

        lastVisible = snapshot.docs[snapshot.docs.length - 1] as any;
        if (snapshot.docs.length < this.BATCH_SIZE) hasMore = false;
      }

      if (!dryRun) {
        await this.logMigration(stats, targetOrgId);
      }

      return stats;
    } catch (error: any) {
      stats.failed++;
      stats.errors.push(error.message);
      logger.error('MIGRATION', `Erro crítico na migração de ${collName}`, error);
      return stats;
    }
  }

  private static async logMigration(stats: MigrationStats, orgId: string) {
    const logId = SecurityService.generateId(this.MIGRATION_LOGS);
    const logRef = doc(db, this.MIGRATION_LOGS, logId);
    
    await writeBatch(db)
      .set(logRef, {
        ...stats,
        targetOrgId: orgId,
        executedAt: Timestamp.now(),
        id: logId
      })
      .commit();
  }
}
