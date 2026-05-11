import { logger } from './LoggerService';

/**
 * Utilitário para envolver funções assíncronas e garantir captura de erros
 */
export async function safeAsyncWrapper<T>(
  promise: Promise<T>, 
  context: string, 
  fallback?: T
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Ignore benign HMR/Vite errors
    const isBenign = message.includes('WebSocket') || 
                     message.includes('failed to connect to websocket') ||
                     message.includes('HMR');
                     
    if (isBenign) {
      return fallback;
    }

    console.error(`[ASYNC-ERROR] ${context}:`, error);
    
    logger.error('ASYNC_FAILURE', `Falha em ${context}: ${message}`, {
      context,
      error: message
    });

    return fallback;
  }
}

/**
 * Handler global para disparar avisos visuais sem quebrar o fluxo
 */
export const AsyncErrorHandler = {
  handle: (error: any, context: string) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[GLOBAL-ASYNC-ERROR] ${context}:`, error);
    
    // Aqui poderíamos disparar um toast ou notificação global
    logger.error('GLOBAL_ASYNC', `Erro capturado: ${message}`, { context });
  }
};
