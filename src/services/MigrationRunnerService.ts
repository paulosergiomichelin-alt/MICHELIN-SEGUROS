import { DataService } from './DataService';
import { orderBy, limit, startAfter } from '../lib/queryConstraints';
import { logger } from './LoggerService';

export interface MigrationStats {
  collection: string;
  processed: number;
  updated: number;
  failed: number;
  errors: string[];
}

/**
 * MigrationRunnerService: Gerencia a migração de dados legados para o modelo SaaS.
 * Focado em injetar organizationId em documentos órfãos. Ferramenta interna de
 * manutenção (requer usuário superadmin — só assim o servidor permite gravar um
 * organizationId diferente do próprio, ver _api/data/router.ts orgScopeWhere).
 */
export class MigrationRunnerService {
  private static readonly BATCH_SIZE = 100;

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
      let cursor: unknown = undefined;
      let hasMore = true;

      while (hasMore) {
        const constraints = [
          orderBy('id', 'asc'),
          limit(this.BATCH_SIZE),
          ...(cursor !== undefined ? [startAfter(cursor)] : []),
        ];

        const docs = await DataService.list(collName, constraints) as any[];
        if (docs.length === 0) {
          hasMore = false;
          break;
        }

        for (const data of docs) {
          stats.processed++;

          // Verifica se o documento precisa de migração (não tem organizationId ou está incorreto)
          if (!data.organizationId || data.organizationId === 'default' || data.organizationId === '') {
            if (!dryRun) {
              try {
                await DataService.update(collName, data.id, {
                  organizationId: targetOrgId,
                  migrationInfo: {
                    migratedAt: new Date().toISOString(),
                    previousOrg: data.organizationId || 'none'
                  }
                }, 'sistema');
              } catch (e: any) {
                stats.failed++;
                stats.errors.push(`${data.id}: ${e.message}`);
                continue;
              }
            }
            stats.updated++;
          }
        }

        cursor = docs[docs.length - 1].id;
        if (docs.length < this.BATCH_SIZE) hasMore = false;
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
    // migration_logs só tem colunas id/stats/created_at (SPEC §4.6) — targetOrgId/
    // executedAt vão dentro do próprio jsonb de stats, não como colunas próprias.
    await DataService.create('migration_logs', {
      stats: { ...stats, targetOrgId: orgId, executedAt: new Date().toISOString() },
    });
  }
}
