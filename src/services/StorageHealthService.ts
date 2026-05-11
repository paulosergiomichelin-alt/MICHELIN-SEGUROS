import { storage, auth } from '../lib/firebase';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { logger } from './LoggerService';

export class StorageHealthService {
  public static async checkHealth(): Promise<{ status: 'ok' | 'error'; message: string }> {
    if (!auth.currentUser) {
      return { status: 'error', message: 'Usuário não autenticado' };
    }

    try {
      await auth.currentUser.getIdToken(true);
    } catch (e) {
      console.warn('[STORAGE_HEALTH] Token refresh failed', e);
    }

    const testPath = `users/${auth.currentUser.uid}/health_check/test_${Date.now()}.txt`;
    const testRef = ref(storage, testPath);
    const content = new Blob(['health_check'], { type: 'text/plain' });

    try {
      console.log('[STORAGE_HEALTH] Iniciando teste de escrita...');
      await uploadBytes(testRef, content);
      console.log('[STORAGE_HEALTH_OK] Escrita bem sucedida');
      
      // Cleanup
      await deleteObject(testRef).catch(err => console.warn('[STORAGE_HEALTH] Falha ao deletar arquivo de teste', err));
      
      return { status: 'ok', message: 'Conexão com Storage está saudável' };
    } catch (error) {
      console.error('[STORAGE_HEALTH_FAILED]', error);
      logger.error('STORAGE', 'Health check failed', error);
      return { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Falha desconhecida ao acessar Firebase Storage' 
      };
    }
  }
}
