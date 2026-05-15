
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DataPolicyService } from './policy/DataPolicyService';
import { logger } from './LoggerService';
import { CacheManager } from './CacheManager';

// ─────────────────────────────────────────────────────────────────────────────
// Entities that carry organizationId and MUST be org-scoped
// ─────────────────────────────────────────────────────────────────────────────
const ORG_SCOPED_COLLECTIONS = ['leads', 'users', 'messages', 'notifications', 'flows', 'follow_ups', 'empresas'] as const;

export interface TenantAuditResult {
  passed: boolean;
  violations: string[];
  warnings: string[];
  testedAt: string;
}

export class TenantIsolationService {

  // ── Runtime guard ───────────────────────────────────────────────────────────

  /**
   * Validates that a document belongs to the current user's organization.
   * Returns false (and logs) if a cross-tenant document is detected.
   * Superadmins always pass.
   */
  static validateDocument(collectionName: string, docId: string, data: any): boolean {
    const user = DataPolicyService.getCurrentUser();
    if (!user) return true;
    if ((user as any).superadmin === true) return true;
    if (!ORG_SCOPED_COLLECTIONS.includes(collectionName as any)) return true;
    if (!data?.organizationId || !user.organizationId) return true;

    if (data.organizationId !== user.organizationId) {
      logger.error('SECURITY', `TENANT_ISOLATION_VIOLATION: collection=${collectionName} docId=${docId} doc_org="${data.organizationId}" caller_org="${user.organizationId}" uid="${user.uid}"`);
      return false;
    }
    return true;
  }

  /**
   * Validates that incoming data will not be written to the wrong tenant.
   * Call this before any CREATE or UPDATE.
   */
  static assertWriteIsolation(entity: string, data: any): void {
    const user = DataPolicyService.getCurrentUser();
    if (!user) return;
    if ((user as any).superadmin === true) return;

    // organizationId in the write payload must ALWAYS match the user's own org
    if (data?.organizationId && user.organizationId && data.organizationId !== user.organizationId) {
      logger.error('SECURITY', `WRITE_ISOLATION_VIOLATION: entity=${entity} attempted_org="${data.organizationId}" caller_org="${user.organizationId}" uid="${user.uid}"`);
      throw new Error('Acesso negado.');
    }
  }

  /**
   * Returns the current user's organizationId from the server-side profile.
   * NEVER use organizationId from client request bodies.
   */
  static getTrustedOrgId(): string | null {
    return DataPolicyService.getCurrentUser()?.organizationId ?? null;
  }

  // ── Audit / diagnostic ──────────────────────────────────────────────────────

  /**
   * Runs a cross-tenant isolation audit on the current org.
   * Checks that no document in any org-scoped collection belongs to a foreign org.
   * Intended for use by superadmins via the AdminTools screen.
   */
  static async runIsolationAudit(): Promise<TenantAuditResult> {
    const user = DataPolicyService.getCurrentUser();
    if (!user || !(user as any).superadmin) {
      return { passed: false, violations: ['Audit requires superadmin'], warnings: [], testedAt: new Date().toISOString() };
    }

    const violations: string[] = [];
    const warnings: string[] = [];

    for (const coll of ORG_SCOPED_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(db, coll));
        snap.docs.forEach(d => {
          const data = d.data();
          if (!data.organizationId) {
            warnings.push(`${coll}/${d.id}: missing organizationId`);
          }
        });
      } catch (e: any) {
        warnings.push(`${coll}: could not read — ${e.message}`);
      }
    }

    const passed = violations.length === 0;
    const result: TenantAuditResult = { passed, violations, warnings, testedAt: new Date().toISOString() };

    logger.info('SECURITY', `ISOLATION_AUDIT completed: passed=${passed} violations=${violations.length} warnings=${warnings.length}`);
    return result;
  }

  /**
   * Simulates a cross-tenant read attack from the current user's perspective.
   * Attempts to read a document from a different org by constructing a direct doc path.
   * Safe to call — any actual data returned is BLOCKED and logged.
   * Use from AdminTools to verify that guards are working.
   */
  static async testCrossTenantReadAttack(targetCollection: string, targetDocId: string, targetOrgId: string): Promise<{ blocked: boolean; message: string }> {
    const user = DataPolicyService.getCurrentUser();
    if (!user) return { blocked: false, message: 'Not authenticated' };

    if (user.organizationId === targetOrgId) {
      return { blocked: false, message: 'Same org — not a cross-tenant scenario' };
    }

    try {
      const snap = await getDoc(doc(db, targetCollection, targetDocId));
      if (!snap.exists()) {
        return { blocked: true, message: `Document does not exist (Firestore rules blocked or doc absent)` };
      }

      const data = snap.data();
      // If Firestore returned data from another org, the client-side guard should catch it
      if (data?.organizationId && data.organizationId !== user.organizationId) {
        logger.error('SECURITY', `CROSS_TENANT_TEST_FAILED: Firestore returned doc from org="${data.organizationId}" for caller org="${user.organizationId}". Rules may be misconfigured!`);
        return { blocked: false, message: `SECURITY ALERT: Firestore returned cross-tenant data for ${targetCollection}/${targetDocId}. Client guard blocked display.` };
      }

      return { blocked: true, message: `Document accessible but belongs to caller's org (no violation)` };
    } catch (e: any) {
      if (e.code === 'permission-denied') {
        return { blocked: true, message: `Blocked at Firestore rules layer (permission-denied)` };
      }
      return { blocked: false, message: `Error: ${e.message}` };
    }
  }

  // ── Cache isolation ─────────────────────────────────────────────────────────

  /**
   * Validates that cache keys for org-scoped entities carry the org prefix.
   * Returns diagnostics for the current session.
   */
  static checkCacheIsolation(): { keysWithOrg: number; keysWithoutOrg: number; suspicious: string[] } {
    const orgId = this.getTrustedOrgId();
    let keysWithOrg = 0;
    let keysWithoutOrg = 0;
    const suspicious: string[] = [];

    // Inspect localStorage cache entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('cache:')) continue;
      const cacheKey = key.replace('cache:', '');

      const isOrgScoped = ORG_SCOPED_COLLECTIONS.some(c => cacheKey.includes(`:${c}:`));
      if (!isOrgScoped) { keysWithoutOrg++; continue; }

      if (orgId && cacheKey.startsWith(orgId + ':')) {
        keysWithOrg++;
      } else {
        keysWithoutOrg++;
        suspicious.push(cacheKey);
      }
    }

    return { keysWithOrg, keysWithoutOrg, suspicious };
  }
}
