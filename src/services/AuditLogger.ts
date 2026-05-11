import { DataService } from './DataService';
import { AuditLog } from '../types';

class AuditLogger {
  private collectionName = 'audit_logs';

  async log(userId: string, userName: string, action: string, category: AuditLog['category'], options: Partial<AuditLog> = {}) {
    try {
      await DataService.create('audit_log', {
        userId,
        userName,
        action,
        category,
        entity: options.entity || 'system',
        status: options.status || 'success',
        details: options.details,
        metadata: options.metadata,
        ip: options.ip || '0.0.0.0',
        origin: options.origin || 'USUARIO',
        ...options
      }, options.origin || 'USUARIO');
    } catch (error) {
      console.error('Failed to save audit log via DataService:', error);
    }
  }

  async getLogs(filters?: { startDate?: Date; endDate?: Date; userId?: string }) {
    try {
      // For now, simpler list using DataService
      const constraints: any[] = [];
      if (filters?.userId) {
        // DataService.list takes QueryConstraint[]
        // But for simplicity, we use the existing pattern in DataService.list
      }
      
      // Redirecting directly to DataService.list for audit_logs
      return await DataService.list('audit_log');
    } catch (error) {
      console.error('Failed to fetch audit logs via DataService:', error);
      return [];
    }
  }
}

export const auditLogger = new AuditLogger();
