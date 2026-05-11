
import { Message } from '../types';
import { CacheManager } from './CacheManager';

/**
 * MessageCacheService: Gerencia cache local de mensagens para velocidade de UI.
 * Permite que mensagens enviadas apareçam instantaneamente enquanto o Firestore sincroniza.
 */
export class MessageCacheService {
  private static readonly PREFIX = 'chat_msgs:';

  public static append(leadId: string, message: Message) {
    const key = this.PREFIX + leadId;
    const current = CacheManager.get(key) || [];
    
    // Evita duplicatas se a mesma mensagem chegar pelo onSnapshot e local push
    if (current.find((m: Message) => m.id === message.id)) return;
    
    const updated = [...current, message].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Mantém apenas as últimas 50 mensagens em cache de memória
    CacheManager.set(key, updated.slice(-50));
  }

  public static get(leadId: string): Message[] {
    return CacheManager.get(this.PREFIX + leadId) || [];
  }

  public static set(leadId: string, messages: Message[]) {
    const key = this.PREFIX + leadId;
    CacheManager.set(key, messages.slice(-50));
  }
}
