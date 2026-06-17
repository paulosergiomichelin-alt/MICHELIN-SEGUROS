import { fsGet } from '../lib/adminFirebase.js';
import { EvolutionAPI } from '../lib/evolutionApi.js';
import { reconcileSession } from '../lib/syncService.js';
import { getActiveSessions } from '../webhook/evolution.js';

let lastReconcileAt: string | null = null;
let totalImported = 0;
let reconcileRunning = false;

export function getReconcileStats() {
  return { lastReconcileAt, totalImported, reconcileRunning };
}

// Executa reconciliação de todas as sessões ativas.
// Usa Evolution API fetchInstances para detectar sessões abertas — sem Firestore.
export async function runReconcile(): Promise<void> {
  if (reconcileRunning) {
    console.log('[EVOLUTION/reconcile] Já em execução, ignorando...');
    return;
  }
  reconcileRunning = true;
  const startedAt = Date.now();

  try {
    // 1ª fonte: sessões que emitiram CONNECTION_UPDATE open nesta sessão do servidor
    const inMemory = getActiveSessions();

    // 2ª fonte: consulta direta à Evolution API (não usa Firestore)
    const instances = await EvolutionAPI.fetchInstances().catch(() => [] as any[]);
    const openInstances = instances.filter(i => {
      const state = (i.instance?.state ?? i.connectionStatus ?? i.state ?? '').toLowerCase();
      return state === 'open';
    });

    // Merge das duas fontes
    const sessions = new Map<string, string>(inMemory);
    for (const inst of openInstances) {
      const name: string = inst.instance?.instanceName ?? inst.instanceName ?? '';
      if (name && !sessions.has(name)) sessions.set(name, 'default');
    }

    process.stdout.write(`[EVOLUTION/reconcile] ${sessions.size} sessões ativas\n`);

    for (const [sessionName, orgId] of sessions) {
      const { imported } = await reconcileSession(sessionName, orgId, 60).catch(err => {
        console.error(`[EVOLUTION/reconcile] Erro em ${sessionName}:`, err?.message);
        return { checked: 0, imported: 0 };
      });
      totalImported += imported;
    }

    lastReconcileAt = new Date().toISOString();
    process.stdout.write(
      `[EVOLUTION/reconcile] Concluído em ${Date.now() - startedAt}ms. Total importado: ${totalImported}\n`,
    );
  } finally {
    reconcileRunning = false;
  }
}

export function scheduleReconcile(intervalMs = 5 * 60 * 1000): void {
  setTimeout(() => {
    runReconcile().catch(err => console.error('[EVOLUTION/reconcile] Erro:', err));
    setInterval(() => {
      runReconcile().catch(err => console.error('[EVOLUTION/reconcile] Erro:', err));
    }, intervalMs);
  }, 2 * 60 * 1000);

  process.stdout.write(`[EVOLUTION/reconcile] Agendado a cada ${intervalMs / 60000} minutos\n`);
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    return res.status(200).json(getReconcileStats());
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionName } = req.body ?? {};

  try {
    if (sessionName) {
      const session = await fsGet('whatsapp_sessions', sessionName).catch(() => null);
      const orgId = session?.organizationId ?? 'default';
      const result = await reconcileSession(sessionName, orgId, 120);
      return res.status(200).json({ ok: true, ...result });
    } else {
      res.status(202).json({ ok: true, message: 'Reconciliação iniciada' });
      runReconcile().catch(err => console.error('[EVOLUTION/reconcile] Erro:', err));
    }
  } catch (err: any) {
    console.error('[EVOLUTION/reconcile] handler error:', err);
    return res.status(500).json({ error: 'Erro na reconciliação', detail: err?.message });
  }
}
