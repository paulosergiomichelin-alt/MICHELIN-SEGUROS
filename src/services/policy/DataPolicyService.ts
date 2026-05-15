
import { auth } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { logger } from '../LoggerService';
import { where, QueryConstraint } from 'firebase/firestore';

export class DataPolicyService {
  private static currentUserProfile: UserProfile | null = null;

  public static setCurrentUser(profile: UserProfile | null) {
    this.currentUserProfile = profile;
  }

  public static getCurrentUser(): UserProfile | null {
    return this.currentUserProfile;
  }

  public static checkPermissions(action: 'CREATE' | 'UPDATE' | 'DELETE', entity: string, entityData?: any): void {
    if (!this.currentUserProfile) {
      if (['system_log', 'audit_log', 'system_metrics', 'dead_letter_queue', 'migration_logs', 'processing_locks'].includes(entity)) return;

      const firebaseUid = auth.currentUser?.uid;
      // Basic check for self-user creation
      if (action === 'CREATE' && (entity === 'user' || entity === 'users') && entityData?.uid === firebaseUid) {
        return;
      }

      throw new Error("Sessão expirada ou usuário não autenticado.");
    }

    const { role, uid, organizationId } = this.currentUserProfile;
    const isSuperAdmin = (this.currentUserProfile as any).superadmin === true;

    // 1. STRICT TENANT ISOLATION — organizationId ALWAYS comes from server profile, never from client input
    if (!isSuperAdmin && entityData?.organizationId && organizationId && entityData.organizationId !== organizationId) {
      logger.error('SECURITY', `TENANT_VIOLATION: action=${action} entity=${entity} uid=${uid} caller_org=${organizationId} target_org=${entityData.organizationId} ua=${navigator.userAgent.substring(0, 80)}`);
      // Generic error — never reveal what org the target data belongs to
      throw new Error("Acesso negado.");
    }

    // 2. ROLE-BASED ACCESS CONTROL (RBAC)
    if (role === 'admin') return; 

    if (action === 'DELETE' && !this.currentUserProfile.permissions?.canDelete) {
      throw new Error("Ação não permitida para seu perfil.");
    }

    if (entity.startsWith('lead') || entity === 'messages') {
      const isOwner = entityData?.ownerId === uid || entityData?.leadOwnerId === uid;
      if (!isOwner && role !== 'gestor') {
         throw new Error("Acesso negado: você não é proprietário deste recurso.");
      }
    }
  }

  public static applyVisibilityConstraints(entity: string, constraints: QueryConstraint[], collectionName: string): QueryConstraint[] {
    if (!this.currentUserProfile) return constraints;

    const { organizationId, role, uid, permissions } = this.currentUserProfile;
    const isSuperAdmin = (this.currentUserProfile as any).superadmin === true;
    const canReadAllLeads = permissions?.canReadAllLeads === true;
    const finalConstraints = [...constraints];
    const effectiveOrgId = organizationId || 'default';

    // Superadmins bypass org isolation entirely
    if (isSuperAdmin) return finalConstraints;

    // Always apply org isolation — required for Firestore rules to accept collection queries
    finalConstraints.push(where('organizationId', '==', effectiveOrgId));

    if (role === 'admin' || role === 'gestor') {
      return finalConstraints;
    }

    // Non-admin: further restrict by ownership where applicable
    if (collectionName === 'leads' && !canReadAllLeads) {
      finalConstraints.push(where('ownerId', '==', uid));
    } else if (collectionName === 'messages') {
      finalConstraints.push(where('leadOwnerId', '==', uid));
    } else if (collectionName === 'notifications' || collectionName === 'follow_ups') {
      finalConstraints.push(where('userId', '==', uid));
    }

    return finalConstraints;
  }

  public static sanitizeData(data: any, maxSize: number): any {
    if (!data || typeof data !== 'object') return data;
    
    const sanitized: any = Array.isArray(data) ? [] : {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (typeof value === 'function' || value === undefined) return;

      if (typeof value === 'string' && value.length > maxSize) {
        if (value.startsWith('data:')) {
          const mime = value.split(';')[0];
          sanitized[key] = `[LARGE_DATA_REMOVED]__${mime}__size:${value.length}`;
        } else {
          sanitized[key] = value.substring(0, 1000) + '... [TRUNCATED]';
        }
        return;
      }

      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        sanitized[key] = this.sanitizeData(value, maxSize);
      } else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }
}
