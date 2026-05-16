
import { DataService } from './DataService';
import { AuditLog } from '../types';
import { DeviceInfoService } from './DeviceInfoService';

class AuditLogger {
  async log(userId: string, userName: string, action: string, category: AuditLog['category'], options: Partial<AuditLog> = {}) {
    try {
      const di = DeviceInfoService.getCached();
      await DataService.create('audit_log', {
        userId,
        userName,
        action,
        category,
        entity: options.entity || 'system',
        status: options.status || 'success',
        result: options.result || 'success',
        details: options.details,
        metadata: options.metadata,
        ip: options.ip || di?.ip || '0.0.0.0',
        userAgent: di?.userAgent || navigator.userAgent,
        deviceType: di?.deviceType,
        browser: di?.browser,
        os: di?.os,
        location: di?.location,
        context: typeof window !== 'undefined' ? window.location.pathname : undefined,
        origin: options.origin || 'USUARIO',
        ...options
      }, options.origin || 'USUARIO');
    } catch (error) {
      console.error('Failed to save audit log:', error);
    }
  }

  async getLogs(filters?: { startDate?: Date; endDate?: Date; userId?: string }) {
    try {
      return await DataService.list('audit_log');
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  }
}

export const auditLogger = new AuditLogger();
