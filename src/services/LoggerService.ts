
import { db, auth } from '../lib/firebase';
import { collection, serverTimestamp, writeBatch, doc } from 'firebase/firestore';

export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface SystemLog {
  id?: string;
  timestamp: any;
  level: LogLevel;
  category: string;
  message: string;
  userId?: string;
  userEmail?: string;
  action?: string;
  details?: any;
  stackTrace?: string;
  source?: string;
}

import { SecurityService } from './SecurityService';

class LoggerService {
  private collectionName = 'system_logs';
  private logQueue: any[] = [];
  private maxBufferSize = 50; // Refactor: Aumentado para 50 para reduzir IO
  private flushInterval = 120000; // Refactor: 2 minutos para logs não críticos
  private isProcessing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      setInterval(() => this.flush(), this.flushInterval);
      // Flush before unload
      window.addEventListener('beforeunload', () => this.flush(true));
    }
  }

  async log(level: LogLevel, category: string, message: string, data: Partial<SystemLog> = {}) {
    const user = auth.currentUser;
    
    const logEntry: Omit<SystemLog, 'id'> = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      userId: user?.uid || 'anonymous',
      userEmail: user?.email || 'anonymous',
      source: typeof window !== 'undefined' ? window.location.pathname : 'server',
      ...data
    };

    // Console logging logic
    const consoleMethod = level === LogLevel.ERROR || level === LogLevel.CRITICAL ? 'error' : 
                         level === LogLevel.WARNING ? 'warn' : 'log';
    
    if (process.env.NODE_ENV !== 'production' || level !== LogLevel.INFO) {
        console[consoleMethod](`[${category}] ${message}`, data);
    }

    // Task 7: Intelligent Flush Logic
    // Persist only if: Error, Critical, User Action or explicitly requested
    const shouldPersist = level === LogLevel.ERROR || 
                         level === LogLevel.CRITICAL || 
                         !!data.action || 
                         (level === LogLevel.WARNING && this.logQueue.length > 5);

    if (shouldPersist) {
      this.logQueue.push(logEntry);
      
      // Critical = Immediate Flush
      if (level === LogLevel.CRITICAL) {
        this.flush(true);
      } else if (this.logQueue.length >= this.maxBufferSize) {
        this.flush();
      }
    }
  }

  async flush(force = false) {
    if (this.logQueue.length === 0 || (this.isProcessing && !force)) return;

    this.isProcessing = true;
    const logsToSync = [...this.logQueue];
    this.logQueue = [];

    try {
      const batch = writeBatch(db);
      
      for (const log of logsToSync) {
        const logId = SecurityService.generateId(this.collectionName);
        const logRef = doc(collection(db, this.collectionName), logId);
        
        // Clean undefined fields
        const cleanLog: any = {};
        Object.keys(log).forEach(key => {
            if ((log as any)[key] !== undefined) {
                cleanLog[key] = (log as any)[key];
            }
        });

        batch.set(logRef, {
          ...cleanLog,
          timestamp: serverTimestamp()
        });
      }
      
      await batch.commit();
    } catch (e) {
      console.error('Logger failed to flush logs:', e);
      // Fallback: put logs back in queue if not too large
      if (this.logQueue.length < 100) {
          this.logQueue.unshift(...logsToSync);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  info(category: string, message: string, data?: any) {
    this.log(LogLevel.INFO, category, message, { details: data });
  }

  warn(category: string, message: string, data?: any) {
    this.log(LogLevel.WARNING, category, message, { details: data });
  }

  error(category: string, message: string, error?: any) {
    this.log(LogLevel.ERROR, category, message, { 
      details: error?.message || error,
      stackTrace: error?.stack 
    });
  }

  critical(category: string, message: string, error?: any) {
    this.log(LogLevel.CRITICAL, category, message, { 
      details: error?.message || error,
      stackTrace: error?.stack 
    });
  }

  async trackAction(action: string, category: string, details?: any) {
    this.log(LogLevel.INFO, category, `User Action: ${action}`, { action, details });
  }
}

export const logger = new LoggerService();
