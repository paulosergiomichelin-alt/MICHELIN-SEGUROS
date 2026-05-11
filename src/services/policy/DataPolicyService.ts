
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

    // 1. STRICT TENANT ISOLATION
    if (entityData?.organizationId && entityData.organizationId !== organizationId) {
      logger.error('SECURITY', `TENANT_VIOLATION: User ${uid} (Org: ${organizationId}) tried to access resource from Org: ${entityData.organizationId}`);
      throw new Error("Acesso negado: violação de isolamento de organização.");
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
    const finalConstraints = [...constraints];
    
    const canReadAllLeads = permissions?.canReadAllLeads === true;
    const canManageUsers = permissions?.canManageUsers === true;
    const isPowerful = (collectionName === 'leads' && canReadAllLeads) || (collectionName === 'users' && canManageUsers);
    
    const effectiveOrgId = organizationId || 'default';
    
    if (!isPowerful) {
      finalConstraints.push(where('organizationId', '==', effectiveOrgId));
    }

    if (role === 'admin' || role === 'gestor') {
      return finalConstraints;
    }

    if (collectionName === 'leads') {
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
