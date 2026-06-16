import { fsGet, fsQueryFull } from '../lib/adminFirebase.js';
import { reconcileSession } from '../lib/syncService.js';

let lastReconcileAt: string | null = null;
let totalImported = 0;
let reconcileRunning = false;

export function getReconcileStats() {
  return { lastReconcileAt, totalImported, reconcileRunning };
}

// Executa reconciliação de todas as sessões ativas
export async function runReconcile(): Promise<void> {
  if (reconcileRunning) {
    console.log('[EVOLUTION/reconcile] Já em execução, ignorando...');
    return;
  }
  reconcileRunning = true;
  const startedAt = Date.now();

  try {
    const sessions = await fsQueryFull('whatsapp_sessions', [{ field: 'status', value: 'open' }], 20);
    process.stdout.write(`[EVOLUTION/reconcile] ${sessions.length} sessões ativas\n`);

    for (const session of sessions) {
      const sessionName: string = session.id ?? session.sessionName ?? '';
      const orgId: string = session.organizationId ?? 'default';
      if (!sessionName) continue;

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

// Agenda reconciliação periódica (chamado pelo server.ts na inicialização)
export function scheduleReconcile(intervalMs = 5 * 60 * 1000): void {
  // Primeira execução após 2 minutos (para não sobrecarregar na inicialização)
  setTimeout(() => {
    runReconcile().catch(err => console.error('[EVOLUTION/reconcile] Erro:', err));
    setInterval(() => {
      runReconcile().catch(err => console.error('[EVOLUTION/reconcile] Erro:', err));
    }, intervalMs);
  }, 2 * 60 * 1000);

  process.stdout.write(`[EVOLUTION/reconcile] Agendado a cada ${intervalMs / 60000} minutos\n`);
}

// Handler HTTP
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
      // Reconcile de sessão específica
      const session = await fsGet('whatsapp_sessions', sessionName).catch(() => null);
      const orgId = session?.organizationId ?? 'default';
      const result = await reconcileSession(sessionName, orgId, 120);
      return res.status(200).json({ ok: true, ...result });
    } else {
      // Reconcile de todas as sessões (async)
      res.status(202).json({ ok: true, message: 'Reconciliação iniciada' });
      runReconcile().catch(err => console.error('[EVOLUTION/reconcile] Erro:', err));
    }
  } catch (err: any) {
    console.error('[EVOLUTION/reconcile] handler error:', err);
    return res.status(500).json({ error: 'Erro na reconciliação', detail: err?.message });
  }
}
