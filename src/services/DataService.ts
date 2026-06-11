
import { 
  doc, 
  getDoc, 
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  query,
  collection,
  writeBatch,
  increment,
  onSnapshot,
  where,
  limit,
  orderBy,
  startAfter,
  QueryConstraint,
  QueryDocumentSnapshot,
  getDocsFromCache,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { AuditLog, UserProfile, UserMetrics } from '../types';
import { metricsService } from './MetricsService';
import { CacheManager, TTL_VALUES } from './CacheManager';
import { logger } from './LoggerService';
import { MetricsUpdateEngine } from './MetricsUpdateEngine';
import { SecurityService } from './SecurityService';
import { QueryFingerprintService } from './QueryFingerprintService';
import { QuotaProtectionService } from './QuotaProtectionService';
import { SubscriptionRegistry } from './SubscriptionRegistry';
import { DataPolicyService } from './policy/DataPolicyService';
import { TenantIsolationService } from './TenantIsolationService';

export class DataService {
  private static pendingRequests: Map<string, Promise<any>> = new Map();
  private static ECO_MODE = (import.meta as any).env.VITE_FIRESTORE_ECO_MODE === 'true';
  private static cachedDeviceInfo: { ip?: string; userAgent?: string; deviceType?: string; browser?: string; os?: string; location?: string } | null = null;

  static setDeviceInfo(info: typeof DataService.cachedDeviceInfo): void {
    DataService.cachedDeviceInfo = info;
  }

  // Entities whose documents carry an organizationId and must be org-scoped in cache
  private static readonly ORG_SCOPED_ENTITIES = new Set([
    'leads', 'lead', 'users', 'user', 'messages', 'message',
    'notifications', 'notification', 'flows', 'flow',
    'follow_ups', 'follow_up', 'empresas', 'empresa',
    'clientes', 'cliente',
    'settings', 'config',
  ]);

  // Collections whose document IDs are scoped per-org: {orgId}::{docId}
  private static readonly ORG_SETTINGS_COLLECTIONS = new Set(['settings', 'config']);

  private static readonly COLLECTION_MAP: Record<string, string> = {
    'leads': 'leads',
    'lead': 'leads',
    'users': 'users',
    'user': 'users',
    'settings': 'settings',
    'config': 'config',
    'access_profiles': 'access_profiles',
    'access_profile': 'access_profiles',
    'audit_logs': 'audit_logs',
    'audit_log': 'audit_logs',
    'system_logs': 'system_logs',
    'system_log': 'system_logs',
    'notifications': 'notifications',
    'notification': 'notifications',
    'messages': 'messages',
    'message': 'messages',
    'follow_ups': 'follow_ups',
    'follow_up': 'follow_ups',
    'flows': 'flows',
    'flow': 'flows',
    'learning_memory': 'learning_memory',
    'system_metrics': 'system_metrics',
    'dead_letter_queue': 'dead_letter_queue',
    'migration_logs': 'migration_logs',
    'processing_locks': 'processing_locks',
    'empresas': 'empresas',
    'empresa': 'empresas',
    'clientes': 'clientes',
    'cliente': 'clientes',
    'seguradoras': 'seguradoras',
    'seguradora': 'seguradoras',
  };

  private static _lastOrgId: string | null = null;

  public static setCurrentUser(profile: UserProfile | null) {
    const newOrgId = profile?.organizationId ?? null;
    if (newOrgId !== this._lastOrgId) {
      // Tenant switched (or logout): purge ALL cached data to prevent cross-tenant leakage
      CacheManager.flushAll();
      logger.info('DATA_SERVICE', `TENANT_SWITCH: "${this._lastOrgId}" → "${newOrgId}". Cache flushed.`);
    }
    this._lastOrgId = newOrgId;
    DataPolicyService.setCurrentUser(profile);
  }

  private static checkPermissions(action: 'CREATE' | 'UPDATE' | 'DELETE', entity: string, entityData?: any): void {
    DataPolicyService.checkPermissions(action, entity, entityData);
  }

  private static applyVisibilityConstraints(entity: string, constraints: QueryConstraint[]): QueryConstraint[] {
    const collName = this.getCollectionName(entity);
    return DataPolicyService.applyVisibilityConstraints(entity, constraints, collName);
  }

  private static getCacheKey(entity: string, id: string): string {
    if (this.ORG_SCOPED_ENTITIES.has(entity)) {
      const orgId = DataPolicyService.getCurrentUser()?.organizationId ?? 'no-org';
      return `${orgId}:${entity}:${id}`;
    }
    return `${entity}:${id}`;
  }

  /**
   * For settings/config collections, returns an org-scoped Firestore document ID
   * formatted as "{orgId}::{id}" so each org stores its own settings document.
   * All other entities return the original id unchanged.
   */
  private static resolveDocId(entity: string, id: string): string {
    const collName = this.COLLECTION_MAP[entity] ?? entity;
    if (this.ORG_SETTINGS_COLLECTIONS.has(collName)) {
      const orgId = DataPolicyService.getCurrentUser()?.organizationId;
      if (orgId) return `${orgId}::${id}`;
    }
    return id;
  }

  /** Returns true if the document's org matches the current user's org (or caller is superadmin). */
  private static isSameOrg(data: any): boolean {
    const user = DataPolicyService.getCurrentUser();
    if (!user) return true; // unauthenticated path — Firestore rules enforce it
    if ((user as any).superadmin === true) return true;
    if (!user.organizationId || !data?.organizationId) return true; // field missing — let rules decide
    return data.organizationId === user.organizationId;
  }

  private static getTTL(entity: string): number {
    if (entity === 'leads' || entity === 'lead') return TTL_VALUES.LEAD_ACTIVE;
    if (entity === 'settings') return TTL_VALUES.SETTINGS;
    if (entity === 'config') return TTL_VALUES.CONFIG;
    return TTL_VALUES.DEFAULT;
  }

  private static getCollectionName(entity: string): string {
    const coll = this.COLLECTION_MAP[entity];
    if (!coll) {
      console.error(`[DataService] INVALID_COLLECTION: Entidade "${entity}" não mapeada no COLLECTION_MAP.`);
      throw new Error(`INVALID_COLLECTION: Entidade "${entity}" não mapeada.`);
    }
    return coll;
  }

  private static generateAuditLog(
    action: AuditLog['action'],
    entity: string,
    entityId: string,
    before: any,
    after: any,
    origin: AuditLog['origin'] = 'USUARIO',
    details?: string
  ): AuditLog | null {
    const user = auth.currentUser;
    const logId = SecurityService.generateId('audit_logs');
    
    // Only log changes if it's an update
    const changesBefore = action === 'UPDATE' ? {} as any : before;
    const changesAfter = action === 'UPDATE' ? {} as any : after;

    if (action === 'UPDATE' && before && after) {
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      allKeys.forEach(key => {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          changesBefore[key] = before[key];
          changesAfter[key] = after[key];
        }
      });
      
      if (Object.keys(changesAfter).length === 0) return null;
    }

    const di = DataService.cachedDeviceInfo;
    return {
      id: logId,
      timestamp: new Date().toISOString(),
      userId: user?.uid || (origin === 'ai' ? 'system-ai' : 'anonymous'),
      userName: user?.displayName || (origin === 'ai' ? 'IA Michelin' : 'Anônimo'),
      action,
      category: 'system',
      entity,
      entityId,
      before: action === 'DELETE' ? before : (action === 'UPDATE' ? changesBefore : null),
      after: action === 'CREATE' ? after : (action === 'UPDATE' ? changesAfter : null),
      origin,
      details,
      result: 'success' as const,
      context: typeof window !== 'undefined' ? window.location.pathname : undefined,
      userAgent: di?.userAgent || navigator.userAgent,
      ip: di?.ip || '0.0.0.0',
      deviceType: di?.deviceType as AuditLog['deviceType'],
      browser: di?.browser,
      os: di?.os,
      location: di?.location,
    };
  }

  private static async updateAggregates(entity: string, before: any, after: any, isDelete = false) {
    if (entity !== 'lead') return;

    try {
      const metricsRef = doc(db, 'system_metrics', 'dashboard');
      const updates: any = {};

      if (!before && after) {
        updates[`statusCounts.${after.status || 'Novo Lead'}`] = increment(1);
        updates.totalLeads = increment(1);
      } else if (before && !isDelete && after) {
        if (before.status !== after.status) {
          updates[`statusCounts.${before.status || 'Novo Lead'}`] = increment(-1);
          updates[`statusCounts.${after.status || 'Novo Lead'}`] = increment(1);
        }
      } else if (isDelete && before) {
        updates[`statusCounts.${before.status || 'Novo Lead'}`] = increment(-1);
        updates.totalLeads = increment(-1);
      }

      if (Object.keys(updates).length > 0) {
        const batch = writeBatch(db);
        batch.set(metricsRef, updates, { merge: true });
        await batch.commit();
      }
    } catch (e) {
      console.warn('[DataService] Failed to update aggregates:', e);
    }
  }

  private static activeListeners: Map<string, () => void> = new Map();
  private static QUERY_CACHE_TTL = 60000; // 1 minute default

  private static isQuotaExceeded = false;
  private static quotaExceededCallbacks: Set<(exceeded: boolean) => void> = new Set();

  static getIsQuotaExceeded() {
    return this.isQuotaExceeded;
  }

  static onQuotaExceeded(callback: (exceeded: boolean) => void) {
    this.quotaExceededCallbacks.add(callback);
    return () => {
      this.quotaExceededCallbacks.delete(callback);
    };
  }

  static notifyQuotaExceeded() {
    if (this.isQuotaExceeded) return;
    this.isQuotaExceeded = true;
    console.error('[DataService] FIRESTORE QUOTA EXCEEDED! Switching to offline/cache mode.');
    this.quotaExceededCallbacks.forEach(cb => cb(true));
  }

  private static readonly CRITICAL_COLLECTIONS = ['leads', 'messages', 'users', 'flows', 'chat', 'pipeline'];

  private static isCritical(entity: string): boolean {
    const coll = this.getCollectionName(entity);
    return this.CRITICAL_COLLECTIONS.includes(coll) || this.CRITICAL_COLLECTIONS.includes(entity);
  }

  static subscribe(entity: string, id: string, callback: (data: any) => void, forceRealtime = false, onError?: (err: any) => void): () => void {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      logger.warn('DATA_SERVICE', `SUBSCRIBE rejected: Invalid ID for entity ${entity}`);
      return () => {};
    }
    const cacheKey = this.getCacheKey(entity, id);
    
    // 1. Mandatory Cache Delivery
    const cached = CacheManager.get(cacheKey);
    if (cached) {
      console.log(`[CACHE_HIT] Entrega rápida para: ${cacheKey}`);
      callback(cached);
    }

    // 2. Eco Mode & Realtime Control - WHITELISTED COLLECTIONS BYPASS ECO_MODE
    const isWhitelisted = this.isCritical(entity);
    const allowRealtime = forceRealtime || isWhitelisted;

    if (!allowRealtime && (cached || this.ECO_MODE)) {
      if (this.ECO_MODE) console.log(`[FIRESTORE_ECO_MODE] Realtime bloqueado para entidade secundária: ${entity}`);
      return () => {};
    }

    if (this.isQuotaExceeded || !QuotaProtectionService.canRead()) {
        return () => {};
    }

    const collName = this.getCollectionName(entity);
    const docId = this.resolveDocId(entity, id);
    const key = `doc:${collName}:${docId}`;

    return SubscriptionRegistry.register(key, () => {
      console.log(`[SUBSCRIPTION_START] Document: ${collName}/${docId}`);
      const unsub = onSnapshot(doc(db, collName, docId), async (snap) => {
        let data = snap.exists() ? snap.data() : null;
        console.log(`[SNAPSHOT_RECEIVED] Doc: ${collName}/${docId}, exists: ${snap.exists()}`);

        // Migration fallback: org-scoped doc missing — copy from legacy global doc
        if (!data && docId !== id) {
          try {
            const legacySnap = await getDoc(doc(db, collName, id));
            if (legacySnap.exists()) {
              data = legacySnap.data();
              const migBatch = writeBatch(db);
              migBatch.set(doc(db, collName, docId), data!, { merge: true });
              migBatch.commit().then(() =>
                logger.info('DATA_SERVICE', `SETTINGS_MIGRATED(subscribe): ${collName}/${id} → ${collName}/${docId}`)
              ).catch(() => {});
            }
          } catch { /* noop */ }
        }

        if (data) {
          CacheManager.set(cacheKey, data);
        }
        callback(data);
      }, (err) => {
        if (err.code === 'resource-exhausted') {
          DataService.notifyQuotaExceeded();
        }
        console.error(`[SNAPSHOT_ERROR] ${collName}/${docId}:`, err);
        if (onError) onError(err);
      });
      return unsub;
    });
  }

  static subscribeCollection(entity: string, constraints: QueryConstraint[], callback: (data: any[]) => void, forceRealtime = false, onError?: (err: any) => void): () => void {
    const finalConstraints = this.applyVisibilityConstraints(entity, constraints);
    const collName = this.getCollectionName(entity);
    const registryKey = QueryFingerprintService.getFingerprint(collName, finalConstraints);
    const cacheKey = `list:${registryKey}`;
    
    // 1. Mandatory Cache Check
    let ttl = this.QUERY_CACHE_TTL;
    if (entity === 'users' || entity === 'user') ttl = 300000;
    if (this.ECO_MODE) ttl *= 2; 

    const cached = CacheManager.getWithExpiry(cacheKey, ttl);
    if (cached) {
      console.log(`[CACHE_HIT] Lista em cache: ${entity}`);
      callback(cached);
      if (!forceRealtime && !this.isCritical(entity) && !this.ECO_MODE) return () => {};
    }

    // 2. Eco Mode Bypass for Critical Collections
    const isWhitelisted = this.isCritical(entity);
    if (this.ECO_MODE && !forceRealtime && !isWhitelisted) {
      console.log(`[FIRESTORE_ECO_MODE] Realtime de coleção bloqueado: ${entity}`);
      return () => {};
    }

    if (this.isQuotaExceeded || !QuotaProtectionService.canRead()) return () => {};

    return SubscriptionRegistry.register(registryKey, () => {
      const q = query(collection(db, collName), ...finalConstraints);
      console.log(`[SUBSCRIPTION_START] Collection: ${collName}, fingerprint: ${registryKey}`);
      console.log(`[LEADS_QUERY_FILTERS] Applied to snapshot:`, finalConstraints.length);
      
      const unsub = onSnapshot(q, (snap) => {
        console.log(`[SNAPSHOT_RECEIVED] Collection: ${collName}, size: ${snap.size}, empty: ${snap.empty}`);
        
        let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Cross-tenant guard for realtime listeners
        if (this.ORG_SCOPED_ENTITIES.has(entity)) {
          const before = data.length;
          data = data.filter(item => {
            if (this.isSameOrg(item)) return true;
            logger.error('SECURITY', `CROSS_TENANT_DOC_DROPPED(snapshot): ${collName}/${item.id}`);
            return false;
          });
          if (collName === 'leads') {
            console.log(`[LEADS_AFTER_PERMISSION_FILTER] Raw incoming: ${before} → after guard: ${data.length}`);
          }
        }

        CacheManager.set(cacheKey, data);

        data.forEach(item => {
          if (item?.id) CacheManager.set(this.getCacheKey(entity, item.id), item);
        });

        callback(data);
      }, (err) => {
        if (err.code === 'resource-exhausted') {
          DataService.notifyQuotaExceeded();
        } else if (err.code === 'permission-denied') {
          console.error(`[PERMISSION_DENIED] Acesso negado para coleção: ${collName}. Verifique Firestore Rules.`);
        }
        console.error(`[SNAPSHOT_ERROR] Collection ${collName}:`, err);
        if (onError) onError(err);
      });
      return unsub;
    });
  }

  // --- PUBLIC API ---

  static async getFromServer(entity: string, id: string): Promise<any | null> {
    if (this.isQuotaExceeded) return this.get(entity, id);

    try {
      const collName = this.getCollectionName(entity);
      const docId = this.resolveDocId(entity, id);
      metricsService.track('db_reads_actual', 1, { entity, type: 'server' });
      const snap = await getDocFromServer(doc(db, collName, docId));
      const data = snap.exists() ? snap.data() : null;
      if (data) {
        CacheManager.set(this.getCacheKey(entity, id), data);
      }
      return data;
    } catch (err: any) {
      if (err.code === 'resource-exhausted') {
        DataService.notifyQuotaExceeded();
      }
      return this.get(entity, id); // Fallback to normal get (cache-aware)
    }
  }

  static async listFromServer(entity: string, constraints: QueryConstraint[] = []): Promise<any[]> {
    if (this.isQuotaExceeded) return this.list(entity, constraints);
    
    try {
      const finalConstraints = this.applyVisibilityConstraints(entity, constraints);
      const collName = this.getCollectionName(entity);
      const q = query(collection(db, collName), ...finalConstraints);
      metricsService.track('db_reads_actual', 1, { entity, type: 'list_server' });
      const snap = await getDocsFromServer(q);
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (this.ORG_SCOPED_ENTITIES.has(entity)) {
        results = results.filter(item => {
          if (this.isSameOrg(item)) return true;
          logger.error('SECURITY', `CROSS_TENANT_DOC_DROPPED(server): ${entity}/${item.id}`);
          return false;
        });
      }
      results.forEach(item => {
        if (item.id) CacheManager.set(this.getCacheKey(entity, item.id), item);
      });
      return results;
    } catch (err: any) {
      if (err.code === 'resource-exhausted') {
        DataService.notifyQuotaExceeded();
      }
      return this.list(entity, constraints);
    }
  }

  static async get(entity: string, id: string): Promise<any | null> {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      logger.warn('DATA_SERVICE', `GET rejected: Invalid ID for entity ${entity}`);
      return null;
    }
    const cacheKey = this.getCacheKey(entity, id);

    // 1. Check Cache
    const cached = CacheManager.getSmart(cacheKey, entity);
    if (cached) {
      metricsService.track('db_reads_saved', 1, { entity });
      return cached;
    }

    // 2. Request Coalescing
    if (this.isQuotaExceeded) return null;
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        const collName = this.getCollectionName(entity);
        const docId = this.resolveDocId(entity, id);
        metricsService.track('db_reads_actual', 1, { entity });
        const snap = await getDoc(doc(db, collName, docId));
        let data = snap.exists() ? snap.data() : null;

        // Migration fallback: org-scoped doc missing — copy from legacy global doc
        if (!data && docId !== id) {
          try {
            const legacySnap = await getDoc(doc(db, collName, id));
            if (legacySnap.exists()) {
              data = legacySnap.data();
              const migBatch = writeBatch(db);
              migBatch.set(doc(db, collName, docId), data!, { merge: true });
              migBatch.commit().then(() =>
                logger.info('DATA_SERVICE', `SETTINGS_MIGRATED(get): ${collName}/${id} → ${collName}/${docId}`)
              ).catch(() => {});
            }
          } catch { /* noop */ }
        }

        // Cross-tenant guard: block data that belongs to a different org
        if (data && this.ORG_SCOPED_ENTITIES.has(entity) && !this.isSameOrg(data)) {
          const user = DataPolicyService.getCurrentUser();
          logger.error('SECURITY', `CROSS_TENANT_BLOCKED: ${entity}/${id} org="${data.organizationId}" caller="${user?.organizationId}" uid="${user?.uid}"`);
          return null;
        }

        if (data) {
          CacheManager.set(cacheKey, data);
        }
        return data;
      } catch (err: any) {
        if (err.code === 'resource-exhausted') {
          DataService.notifyQuotaExceeded();
        }
        throw err;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  static async list(entity: string, constraints: QueryConstraint[] = []): Promise<any[]> {
    const finalConstraints = this.applyVisibilityConstraints(entity, constraints);
    const queryKey = `${entity}:${JSON.stringify(finalConstraints)}`;
    const cacheKey = `list:${queryKey}`;
    
    // 1. Mandatory Cache Check
    let ttl = this.QUERY_CACHE_TTL;
    if (entity === 'user') ttl = 300000; // 5 mins for users

    const cached = CacheManager.getWithExpiry(cacheKey, ttl);
    if (cached) {
      metricsService.track('db_reads_saved', 1, { entity, type: 'list_cache' });
      return cached;
    }

    if (this.isQuotaExceeded) {
      // Try to get from Firestore cache if quota is exceeded
      try {
        const collName = this.getCollectionName(entity);
        const q = query(collection(db, collName), ...finalConstraints);
        const snap = await getDocsFromCache(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        return [];
      }
    }

    // 2. Request Coalescing for Queries
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const fetchPromise = (async () => {
      const collName = this.getCollectionName(entity);
      const q = query(collection(db, collName), ...finalConstraints);
      
      try {
        metricsService.track('db_reads_actual', 1, { entity, type: 'list' });
        const snap = await getDocs(q);
        let results: any[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Cross-tenant guard: drop any documents that slipped past Firestore rules
        if (this.ORG_SCOPED_ENTITIES.has(entity)) {
          const before = results.length;
          results = results.filter(item => {
            if (this.isSameOrg(item)) return true;
            const user = DataPolicyService.getCurrentUser();
            logger.error('SECURITY', `CROSS_TENANT_DOC_DROPPED: ${entity}/${item.id} org="${item.organizationId}" caller="${user?.organizationId}"`);
            return false;
          });
          if (results.length < before) {
            logger.error('SECURITY', `CROSS_TENANT_FILTER: dropped ${before - results.length} docs from ${entity} list`);
          }
        }

        // Cache results
        CacheManager.set(cacheKey, results);
        results.forEach(item => {
          if (item.id) CacheManager.set(this.getCacheKey(entity, item.id), item);
        });

        return results;
      } catch (err: any) {
        if (err.code === 'resource-exhausted') {
          DataService.notifyQuotaExceeded();
        }
        throw err;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  static async listPaginated(
    entity: string, 
    constraints: QueryConstraint[], 
    pageSize: number, 
    lastDoc?: QueryDocumentSnapshot
  ): Promise<{ data: any[], lastVisible: QueryDocumentSnapshot | null, hasMore: boolean }> {
    const finalConstraints = this.applyVisibilityConstraints(entity, constraints);
    const collName = this.getCollectionName(entity);
    
    const paginatedConstraints = [...finalConstraints, limit(pageSize)];
    if (lastDoc) {
      paginatedConstraints.push(startAfter(lastDoc));
    }

    const q = query(collection(db, collName), ...paginatedConstraints);
    
    // Cache Check for First Page
    const cacheKey = `list:paginated:${entity}:${JSON.stringify(finalConstraints)}:${pageSize}`;
    if (!lastDoc) {
      const cached = CacheManager.getWithExpiry(cacheKey, entity === 'user' ? 300000 : 60000);
      if (cached) {
        metricsService.track('db_reads_saved', 1, { entity, type: 'list_paginated_cache' });
        return cached;
      }
    }

    try {
      metricsService.track('db_reads_actual', 1, { entity, type: 'list_paginated' });
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      const hasMore = snap.docs.length === pageSize;

      const result = { data, lastVisible, hasMore };

      // Cache only the first page
      if (!lastDoc) {
        CacheManager.set(cacheKey, result);
      }

      data.forEach(item => {
        if (item.id) CacheManager.set(this.getCacheKey(entity, item.id), item);
      });

      return result;
    } catch (err: any) {
      if (err.code === 'resource-exhausted') {
        DataService.notifyQuotaExceeded();
      }
      throw err;
    }
  }

  private static readonly MAX_FIELD_SIZE = 100 * 1024; // 100KB limit for any single field in Firestore

  private static async normalizePayload(entity: string, data: any): Promise<any> {
    const user = auth.currentUser;
    const collName = this.getCollectionName(entity);
    
    const normalized = { 
      ...data, 
      id: data.id || SecurityService.generateId(collName),
      updatedAt: new Date().toISOString(),
      createdAt: data.createdAt || new Date().toISOString()
    };

    if (collName === 'leads') {
      if (!normalized.ownerId) {
        if (!user) throw new Error("OwnerId obrigatório para criação de leads.");
        normalized.ownerId = user.uid;
      }
      normalized.organizationId = normalized.organizationId || DataPolicyService.getCurrentUser()?.organizationId || 'default';
      if (!normalized.status) normalized.status = 'Novo Lead';
    }

    if (collName === 'messages') {
      // Denormalization of leadOwnerId and organizationId
      if (!normalized.leadOwnerId && normalized.leadId) {
        const cachedLead = CacheManager.get(this.getCacheKey('leads', normalized.leadId));
        if (cachedLead?.ownerId) {
          normalized.leadOwnerId = cachedLead.ownerId;
          normalized.organizationId = cachedLead.organizationId || 'default';
        } else {
          const lead = await this.get('leads', normalized.leadId);
          if (lead?.ownerId) {
            normalized.leadOwnerId = lead.ownerId;
            normalized.organizationId = lead.organizationId || 'default';
          }
        }
      }
      // Fallback for organizationId if lead logic didn't catch it
      normalized.organizationId = normalized.organizationId || DataPolicyService.getCurrentUser()?.organizationId || 'default';
    }

    if (collName === 'notifications' || collName === 'follow_ups' || collName === 'users') {
      if (!normalized.userId && user && collName !== 'users') normalized.userId = user.uid;
      // Para usuários, o campo principal é 'uid', mas guardamos 'organizationId' para isolamento
      if (collName === 'users') normalized.uid = normalized.uid || user?.uid;
      
      normalized.organizationId = normalized.organizationId || DataPolicyService.getCurrentUser()?.organizationId || 'default';
    }

    return normalized;
  }

  private static validatePayloadAgainstRules(entity: string, data: any): void {
    if (!data || Object.keys(data).length === 0) {
      throw new Error(`INVALID_DATA: Payload vazio para ${entity}`);
    }

    if (entity === 'user') {
      if (!data.role) throw new Error("INVALID_DATA: Usuário sem role");
      if (!data.permissions) throw new Error("INVALID_DATA: Usuário sem permissions");
      if (typeof data.permissions !== 'object') throw new Error("INVALID_DATA: Permissions deve ser um objeto");
    }

    if (entity === 'leads' || entity === 'lead') {
      if (!data.ownerId) {
        console.error(`[DataService] VALIDATION_ERROR: Entity "${entity}" is missing ownerId. Data keys:`, Object.keys(data));
        throw new Error(`INVALID_DATA: Lead sem ownerId (Entity: ${entity}, Keys: ${Object.keys(data).join(',')})`);
      }
      if (!data.status) throw new Error("INVALID_DATA: Lead sem status");
    }

    if (entity === 'message' || entity === 'follow_up' || entity === 'notification') {
      if (!data.leadId) throw new Error(`INVALID_DATA: ${entity} sem leadId`);
    }
  }

  private static sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') return data;
    
    const sanitized: any = Array.isArray(data) ? [] : {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      
      // Remove functions and undefined
      if (typeof value === 'function' || value === undefined) return;

      // Handle large fields (truncated for safety)
      if (typeof value === 'string' && value.length > this.MAX_FIELD_SIZE) {
        console.warn(`[DataService] Campo "${key}" muito longo (size: ${value.length}). Truncando.`);
        if (value.startsWith('data:')) {
          const mime = value.split(';')[0];
          sanitized[key] = `[LARGE_BASE64_REMOVED]__${mime}__size:${value.length}`;
        } else {
          sanitized[key] = value.substring(0, 1000) + '... [TRUNCATED]';
        }
        return;
      }

      // Recursive sanitization for objects/arrays
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }

  private static async validateWrite(entity: string, docId: string, expectedData: any): Promise<boolean> {
    const collName = this.getCollectionName(entity);
    try {
      // Relaxed validation: Check for existence and critical keys only
      // docId is already the resolved (org-scoped) document ID
      const snap = await getDoc(doc(db, collName, docId));
      if (!snap.exists()) {
        console.error(`[DataService] Validation failed: Document ${collName}/${docId} does not exist after write.`);
        return false;
      }
      
      const actualData = snap.data();
      
      // Critical keys based on entity
      let criticalKeys: string[] = ['id'];
      if (entity === 'lead') criticalKeys = ['id', 'status'];
      if (entity === 'message') criticalKeys = ['id', 'leadId', 'sender'];
      
      const mismatches = criticalKeys.filter(key => {
        const expectedVal = expectedData[key];
        const actualVal = actualData[key];
        
        if (expectedVal === undefined) return false;
        
        return JSON.stringify(expectedVal) !== JSON.stringify(actualVal);
      });

      if (mismatches.length > 0) {
        console.error(`[DataService] CRITICAL field mismatch for ${entity}:${docId} - Keys:`, mismatches);
        return false;
      }
      
      return true;
    } catch (e) {
      console.warn('[DataService] Validation read failed or timed out:', e);
      // If it's a network error during validation, we might still have succeeded the write
      return true; 
    }
  }

  static async create(entity: string, data: any, origin: AuditLog['origin'] = 'USUARIO'): Promise<string> {
    const collName = this.getCollectionName(entity);

    // 1. Normalization
    const rawData = await this.normalizePayload(entity, data);
    const id = rawData.id;
    const docId = this.resolveDocId(entity, id);

    // 2. Sanitization & Validation
    const finalData = this.sanitizeData(rawData);
    this.validatePayloadAgainstRules(entity, finalData);

    // Tenant isolation: organizationId MUST come from server profile, not from client data
    TenantIsolationService.assertWriteIsolation(entity, finalData);

    console.log(`[DataService] WRITE_ATTEMPT: CREATE ${collName}/${docId}`, { origin, fields: Object.keys(finalData) });

    // Permission check
    this.checkPermissions('CREATE', entity, finalData);

    if (this.isQuotaExceeded || !QuotaProtectionService.canWrite()) {
      throw new Error(`[QUOTA_BLOCKED] Escrita negada para ${entity} (Quota ou Proteção)`);
    }

    let retries = 0;
    while (retries < 3) {
      try {
        const batch = writeBatch(db);
        if (entity !== 'system_metrics' && entity !== 'Metric') {
          const log = this.generateAuditLog('CREATE', entity, id, null, finalData, origin);
          if (log) batch.set(doc(db, 'audit_logs', log.id), log);
        }

        batch.set(doc(db, collName, docId), finalData, { merge: true });

        metricsService.track('db_write_attempt', 1, { entity, action: 'create' });
        await batch.commit();

        if (retries > 0) await new Promise(r => setTimeout(r, 200 * retries));

        const confirmed = await this.validateWrite(entity, docId, finalData);
        if (confirmed) {
          logger.info('DATA_SERVICE', `PERSISTENCE_CONFIRMED for ${entity}:${id}`);
          CacheManager.set(this.getCacheKey(entity, id), finalData);
          CacheManager.invalidatePattern(`list:${entity}`);
          this.updateAggregates(entity, null, finalData);

          // Handle User Metrics Trigger
          if (entity === 'lead' && finalData.responsibleAgentId) {
            try {
              const userRef = doc(db, 'users', finalData.responsibleAgentId);
              await updateDoc(userRef, {
                "metrics.totalLeads": increment(1)
              });
              await this.updateUserMetrics(finalData.responsibleAgentId);
            } catch (err) {
              console.error(`[DataService] Error updating lead metrics for ${finalData.responsibleAgentId}:`, err);
            }
          }

          return id;
        }
        
        throw new Error('Persistence validation failed (data mismatch after write)');
      } catch (error: any) {
        if (error.code === 'permission-denied') {
          console.error(`[PERMISSION_DENIED] Falha ao criar ${entity}:${id}. Verifique se o organizationId '${finalData.organizationId}' está correto.`);
          handleFirestoreError(error, OperationType.CREATE, `${collName}/${id}`);
        }

        console.error("[DataService] WRITE_ERROR", {
          code: error.code,
          message: error.message,
          entity,
          id,
          data: finalData
        });

        retries++;
        if (retries >= 3) break;
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }

    throw new Error(`CRITICAL: Failed to persist ${entity}:${id} after 3 attempts.`);
  }

  static async update(entity: string, id: string, updates: any, origin: AuditLog['origin'] = 'USUARIO'): Promise<void> {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error(`UPDATE rejected: Invalid ID for entity ${entity}`);
    }
    if (!updates || Object.keys(updates).length === 0) return;

    const collName = this.getCollectionName(entity);
    const docId = this.resolveDocId(entity, id);
    const cacheKey = this.getCacheKey(entity, id);
    let before = CacheManager.get(cacheKey);

    if (!before) {
      const snap = await getDoc(doc(db, collName, docId));
      if (!snap.exists()) throw new Error(`Entity ${entity} with id ${id} not found`);
      before = snap.data();
    }

    // Permission check
    this.checkPermissions('UPDATE', entity, before);

    // Hardening: Block sensitive field updates for non-admins at code level
    const userProfile = DataPolicyService.getCurrentUser();
    if (userProfile?.role !== 'admin') {
      const sensitiveFields = ['role', 'permissions', 'ownerId', 'createdBy', 'organizationId', 'superadmin'];
      const attemptToChange = sensitiveFields.filter(f => 
        updates[f] !== undefined && updates[f] !== before[f]
      );
      
      if (attemptToChange.length > 0) {
        logger.error('SECURITY', `PRIVILEGE_ESCALATION_ATTEMPT: User ${userProfile?.uid} tried to change ${attemptToChange.join(', ')}`);
        throw new Error(`Ação negada: campos restritos (${attemptToChange.join(', ')})`);
      }
    }

    // 1. Sanitization & Normalization
    const sanitizedUpdates = this.sanitizeData(updates);
    const afterRaw = await this.normalizePayload(entity, { ...before, ...sanitizedUpdates });
    const after = this.sanitizeData(afterRaw);

    // 2. Validation + tenant isolation
    this.validatePayloadAgainstRules(entity, after);
    TenantIsolationService.assertWriteIsolation(entity, after);

    const hasChanges = Object.keys(sanitizedUpdates).some(key => 
      JSON.stringify(before[key]) !== JSON.stringify(sanitizedUpdates[key]) && key !== 'updatedAt' && key !== 'version'
    );

    if (!hasChanges) {
      metricsService.track('db_writes_saved', 1, { entity });
      return;
    }

    if (entity === 'lead') {
      const currentVersion = before.version || 0;
      if (sanitizedUpdates.version !== undefined && sanitizedUpdates.version < currentVersion) {
        console.warn(`[DataService] Version conflict for lead ${id}`);
        return;
      }
      after.version = currentVersion + 1;
    }

    console.log(`[DataService] WRITE_ATTEMPT: UPDATE ${collName}/${docId}`, { origin, keys: Object.keys(sanitizedUpdates) });
    
    if (this.isQuotaExceeded || !QuotaProtectionService.canWrite()) {
      throw new Error(`[QUOTA_BLOCKED] Escrita negada para atualização de ${entity} (Quota ou Proteção)`);
    }

    let retries = 0;
    while (retries < 3) {
      try {
        const batch = writeBatch(db);
        const log = this.generateAuditLog('UPDATE', entity, id, before, after, origin);
        if (log) batch.set(doc(db, 'audit_logs', log.id), log);

        batch.set(doc(db, collName, docId), after, { merge: true });
        
        metricsService.track('db_write_attempt', 1, { entity, action: 'update' });
        await batch.commit();

        if (retries > 0) await new Promise(r => setTimeout(r, 200 * retries));

        const confirmed = await this.validateWrite(entity, docId, after);
        if (confirmed) {
          logger.info('DATA_SERVICE', `PERSISTENCE_CONFIRMED for ${entity}:${id}`);
          CacheManager.set(cacheKey, after);
          CacheManager.invalidatePattern(`list:${entity}`);
          this.updateAggregates(entity, before, after);

          // Handle User Metrics Trigger (Conversion)
          if (entity === 'lead' && before.status !== 'Fechado' && after.status === 'Fechado' && after.responsibleAgentId) {
            try {
              const userRef = doc(db, 'users', after.responsibleAgentId);
              await updateDoc(userRef, {
                "metrics.totalVendas": increment(1)
              });
              await this.updateUserMetrics(after.responsibleAgentId);
            } catch (err) {
              console.error(`[DataService] Error updating sale metrics for ${after.responsibleAgentId}:`, err);
            }
          }

          return;
        }
        
        throw new Error('Persistence validation failed (data mismatch after write)');
      } catch (error: any) {
        if (error.code === 'permission-denied') {
          handleFirestoreError(error, OperationType.UPDATE, `${collName}/${id}`);
        }

        console.error("[DataService] WRITE_ERROR", {
          code: error.code,
          message: error.message,
          entity,
          id,
          updates: sanitizedUpdates
        });

        retries++;
        if (retries >= 3) break;
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }

    throw new Error(`CRITICAL: Failed to persist updates for ${entity}:${id} after 3 attempts.`);
  }

  static async delete(entity: string, id: string, origin: AuditLog['origin'] = 'USUARIO'): Promise<void> {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error(`DELETE rejected: Invalid ID for entity ${entity}`);
    }
    const collName = this.getCollectionName(entity);
    const docId = this.resolveDocId(entity, id);
    const docRef = doc(db, collName, docId);
    const snap = await getDoc(docRef);
    const before = snap.exists() ? snap.data() : null;

    // Permission check
    this.checkPermissions('DELETE', entity, before);

    const batch = writeBatch(db);
    const log = this.generateAuditLog('DELETE', entity, id, before, null, origin);
    if (log) batch.set(doc(db, 'audit_logs', log.id), log);

    batch.delete(docRef);
    CacheManager.invalidate(this.getCacheKey(entity, id));
    CacheManager.invalidatePattern(`list:${entity}`);

    try {
      await batch.commit();
      this.updateAggregates(entity, before, null, true);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `${collName}/${docId}`);
    }
  }

  static async save(entity: string, id: string, data: any, origin: AuditLog['origin'] = 'USUARIO'): Promise<void> {
    // Smart save: Choose Create or Update based on existence in org-scoped location
    const cacheKey = this.getCacheKey(entity, id);
    const docId = this.resolveDocId(entity, id);
    let existing = CacheManager.get(cacheKey);

    if (!existing) {
      const collName = this.getCollectionName(entity);
      const snap = await getDoc(doc(db, collName, docId));
      existing = snap.exists() ? snap.data() : null;
    }

    if (!existing) {
      await this.create(entity, { ...data, id }, origin);
    } else {
      await this.update(entity, id, data, origin);
    }
  }

  // --- USER METRICS ENGINE ---

  static async updateUserMetrics(userId: string): Promise<void> {
    if (!MetricsUpdateEngine.canUpdate(userId)) return;

    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return;
      
      const userData = userSnap.data() as UserProfile;
      const currentMetrics = userData.metrics;
      
      if (!currentMetrics) {
        console.warn(`[DataService] Metrics missing for user ${userId}.`);
        return;
      }

      const leads = currentMetrics.totalLeads || 0;
      const vendas = currentMetrics.totalVendas || 0;
      
      const conversionRate = leads > 0 ? (vendas / leads) * 100 : 0;
      
      let performanceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (conversionRate >= 25) performanceLevel = 'HIGH';
      else if (conversionRate >= 10) performanceLevel = 'MEDIUM';

      const nextMetrics: UserMetrics = {
        ...currentMetrics,
        conversionRate: Number(conversionRate.toFixed(1)),
        performanceLevel,
        lastUpdated: new Date().toISOString()
      };

      // DEDUPLICATION GATE: Prevent loop and unnecessary writes
      if (!MetricsUpdateEngine.isUpdateNeeded(currentMetrics, nextMetrics)) {
        console.log(`[WRITE_BLOCKED_NO_DIFF] Métricas de ${userId} idênticas. Ignorando.`);
        return;
      }

      await updateDoc(userRef, {
        metrics: nextMetrics
      });

      MetricsUpdateEngine.recordUpdate(userId);
      console.log(`[METRICS_BATCH_SUCCESS] Métricas atualizadas para usuário ${userId}`);

      // Update cache
      CacheManager.set(this.getCacheKey('user', userId), { ...userData, metrics: nextMetrics });
    } catch (e) {
      console.error(`[DataService] Error updating user metrics for ${userId}:`, e);
    }
  }

  private static lastActivityUpdate: Record<string, number> = {};

  static async updateUserActivity(userId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastActivityUpdate[userId] || 0;
    
    // THROTTLE: 1 update per minute
    if (now - last < 60000) return;

    try {
      this.lastActivityUpdate[userId] = now;
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        "activity.lastAccess": serverTimestamp(),
        "activity.status": "ONLINE"
      });
      console.log(`[ACTIVITY_UPDATED] Status online para: ${userId}`);
    } catch (e) {
      console.warn(`[DataService] Silent fail updating activity for ${userId}`, e);
    }
  }
}
