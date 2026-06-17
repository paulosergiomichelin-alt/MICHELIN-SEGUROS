/**
 * Rastreia IDs de mensagens enviadas pelo CRM via Evolution API.
 * Usado para evitar que o eco do webhook (MESSAGES_UPSERT fromMe:true)
 * crie um documento duplicado no Firestore.
 *
 * Funciona em memória: válido enquanto o processo Node.js estiver vivo.
 * A janela de 2 minutos cobre o delay máximo da fila + latência do webhook.
 */

interface SentEntry {
  evolutionId: string;
  optimisticDocId: string; // ID do doc otimista (wamsg_out_...)
  addedAt: number;
}

const sentMap = new Map<string, SentEntry>(); // evolutionId → SentEntry
const TTL_MS = 2 * 60 * 1000; // 2 minutos

// Limpeza periódica de entradas expiradas
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sentMap) {
    if (now - entry.addedAt > TTL_MS) sentMap.delete(id);
  }
}, 30_000);

export function markSentByUs(evolutionId: string, optimisticDocId: string): void {
  sentMap.set(evolutionId, { evolutionId, optimisticDocId, addedAt: Date.now() });
}

export function getSentEntry(evolutionId: string): SentEntry | null {
  const entry = sentMap.get(evolutionId);
  if (!entry) return null;
  if (Date.now() - entry.addedAt > TTL_MS) {
    sentMap.delete(evolutionId);
    return null;
  }
  return entry;
}

export function clearSentById(evolutionId: string): void {
  sentMap.delete(evolutionId);
}

export function getSentCount(): number {
  return sentMap.size;
}
