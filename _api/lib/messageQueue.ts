import { EvolutionAPI } from './evolutionApi.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueItem {
  instanceName: string;
  phone: string;
  text: string;
  resolve: (result: any) => void;
  reject: (err: Error) => void;
  attempts: number;
  addedAt: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_MESSAGES_PER_MINUTE = 20;
const MIN_DELAY_MS = 1200;
const MAX_DELAY_MS = 3500;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 2000;
const MAX_QUEUE_SIZE = 500;

// ── State ─────────────────────────────────────────────────────────────────────

const queues = new Map<string, QueueItem[]>(); // keyed by instanceName
const processing = new Set<string>();
const sentCount = new Map<string, number[]>(); // instanceName → timestamps

function randomDelay(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Rate limiter (sliding window, per instance) ───────────────────────────────

function isRateLimited(instanceName: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (sentCount.get(instanceName) ?? []).filter(t => t > windowStart);
  sentCount.set(instanceName, timestamps);
  return timestamps.length >= MAX_MESSAGES_PER_MINUTE;
}

function recordSent(instanceName: string) {
  const timestamps = sentCount.get(instanceName) ?? [];
  timestamps.push(Date.now());
  sentCount.set(instanceName, timestamps);
}

// ── Worker ────────────────────────────────────────────────────────────────────

async function processQueue(instanceName: string) {
  if (processing.has(instanceName)) return;
  processing.add(instanceName);

  try {
    const queue = queues.get(instanceName) ?? [];

    while (queue.length > 0) {
      // Rate limit check — pause until next slot available
      while (isRateLimited(instanceName)) {
        console.log(`[MessageQueue] Rate limit atingido para ${instanceName} — aguardando...`);
        await sleep(5000);
      }

      const item = queue[0];

      // Random human-like delay
      await sleep(randomDelay());

      let result: any = null;
      let lastErr: Error | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          result = await EvolutionAPI.sendText(instanceName, item.phone, item.text);
          if (result) break;
          throw new Error('sendText retornou null');
        } catch (err: any) {
          lastErr = err;
          if (attempt < MAX_ATTEMPTS) {
            const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
            console.warn(`[MessageQueue] Tentativa ${attempt} falhou para ${instanceName}→${item.phone}. Retry em ${backoff}ms`);
            await sleep(backoff);
          }
        }
      }

      queue.shift(); // remove processed item

      if (result) {
        recordSent(instanceName);
        item.resolve(result);
      } else {
        item.reject(lastErr ?? new Error('Falha ao enviar mensagem após múltiplas tentativas'));
      }
    }
  } finally {
    processing.delete(instanceName);
    // Clean up empty queue and stale sentCount entries
    if ((queues.get(instanceName) ?? []).length === 0) {
      queues.delete(instanceName);
      // Prune sentCount for this instance if no sent messages in last 60s
      const now = Date.now();
      const ts = (sentCount.get(instanceName) ?? []).filter(t => t > now - 60_000);
      if (ts.length === 0) sentCount.delete(instanceName);
      else sentCount.set(instanceName, ts);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function enqueueMessage(
  instanceName: string,
  phone: string,
  text: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const queue = queues.get(instanceName) ?? [];

    if (queue.length >= MAX_QUEUE_SIZE) {
      return reject(new Error(`Fila cheia para instância ${instanceName} (máx ${MAX_QUEUE_SIZE} mensagens)`));
    }

    queue.push({ instanceName, phone, text, resolve, reject, attempts: 0, addedAt: Date.now() });
    queues.set(instanceName, queue);

    console.log(`[MessageQueue] Enfileirada mensagem para ${instanceName}→${phone} (fila: ${queue.length})`);

    // Start worker if not already running
    processQueue(instanceName).catch(err =>
      console.error('[MessageQueue] processQueue error:', err),
    );
  });
}

export function getQueueStatus(): Record<string, { pending: number; sentLastMinute: number }> {
  const status: Record<string, { pending: number; sentLastMinute: number }> = {};
  const now = Date.now();

  for (const [instance, queue] of queues) {
    const windowStart = now - 60_000;
    const sentLast = (sentCount.get(instance) ?? []).filter(t => t > windowStart).length;
    status[instance] = { pending: queue.length, sentLastMinute: sentLast };
  }

  return status;
}
