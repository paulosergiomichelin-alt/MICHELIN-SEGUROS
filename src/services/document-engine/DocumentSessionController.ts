/**
 * DocumentSessionController.ts
 * Manages the singleton document processing session state to ensure reliability
 * across renders and hydration events.
 */

export enum DocumentPipelineState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  VALIDATING = 'validating',
  CONFIRMED = 'confirmed',
  UPLOADING = 'uploading',
  PERSISTING = 'persisting',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface DocumentSession {
  sessionId: string;
  type: string;
  leadId: string;
  state: DocumentPipelineState;
  startTime: number;
  lastUpdate: number;
  data: any;
  file?: File;
  fileUrl?: string;
  error?: string;
  debug?: {
    chars?: number;
    score?: number;
    time?: number;
    resolution?: string;
    isVisual?: boolean;
    scale?: number;
  };
}

export class DocumentSessionController {
  private static instance: DocumentSessionController;
  private currentSession: DocumentSession | null = null;
  private listeners: ((session: DocumentSession | null) => void)[] = [];
  private abortController: AbortController | null = null;
  private isLocked: boolean = false;

  private constructor() {}

  public static getInstance(): DocumentSessionController {
    if (!DocumentSessionController.instance) {
      DocumentSessionController.instance = new DocumentSessionController();
    }
    return DocumentSessionController.instance;
  }

  public startSession(type: string, leadId: string, file: File): { session: DocumentSession, signal: AbortSignal } {
    if (this.isLocked || (this.currentSession && this.isActive())) {
      throw new Error('PIPELINE_BUSY');
    }

    this.isLocked = true;
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();

    const session: DocumentSession = {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      leadId,
      state: DocumentPipelineState.PROCESSING,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      data: null,
      file,
      fileUrl: URL.createObjectURL(file)
    };
    
    this.currentSession = session;
    console.log(`[SESSION_LOCK_ACQUIRED] Session: ${session.sessionId} | Type: ${type}`);
    this.notify();
    return { session, signal: this.abortController.signal };
  }

  public updateState(state: DocumentPipelineState, data?: any, error?: string, fileUrl?: string) {
    if (!this.currentSession) return;
    
    this.currentSession = {
      ...this.currentSession,
      state,
      data: data !== undefined ? data : this.currentSession.data,
      error: error !== undefined ? error : this.currentSession.error,
      fileUrl: fileUrl || this.currentSession.fileUrl,
      lastUpdate: Date.now()
    };
    
    if (state === DocumentPipelineState.COMPLETED || state === DocumentPipelineState.FAILED) {
      this.isLocked = false;
    }

    console.log(`[PIPELINE_STATE_CHANGED] Session: ${this.currentSession.sessionId} | State: ${state}`);
    this.notify();
  }
  
  public abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.updateState(DocumentPipelineState.FAILED, null, 'USER_ABORTED');
      this.isLocked = false;
    }
  }

  public updateDebug(debug: Partial<DocumentSession['debug']>) {
    if (!this.currentSession) return;
    this.currentSession = {
      ...this.currentSession,
      debug: {
        ...(this.currentSession.debug || {}),
        ...debug as any
      }
    };
    this.notify();
  }

  public getSession(): DocumentSession | null {
    return this.currentSession;
  }

  public isActive(): boolean {
    return !!this.currentSession && 
           this.currentSession.state !== DocumentPipelineState.IDLE && 
           this.currentSession.state !== DocumentPipelineState.COMPLETED &&
           this.currentSession.state !== DocumentPipelineState.FAILED;
  }

  public release() {
    if (this.currentSession) {
      console.log(`[SESSION_LOCK_RELEASED] Session: ${this.currentSession.sessionId}`);
    }
    this.currentSession = null;
    this.isLocked = false;
    this.notify();
  }

  public subscribe(listener: (session: DocumentSession | null) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.currentSession));
  }
}
