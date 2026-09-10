import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { requireAuth } from '../lib/authMiddleware';
import { loadTenantContext } from './tenantMiddleware';
import { clienteApolices, clienteHistorico, clientes } from '../db/schema';
import { emitDataChanged } from '../lib/realtimeBus';
import { normalizeTimestamps } from '../lib/normalizeTimestamps';

export const clientesRouter = Router();
clientesRouter.use(requireAuth, loadTenantContext);
clientesRouter.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body: any) => originalJson(normalizeTimestamps(body));
  next();
});

async function assertClienteInOrg(clienteId: string, req: any) {
  if (req.userSuperadmin) return true;
  const [c] = await getDb().select().from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.organizationId, req.organizationId)));
  return !!c;
}

// ── Apólices ──────────────────────────────────────────────────────────────

clientesRouter.get('/:clienteId/apolices', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req)) return res.status(404).end();
  const rows = await getDb().select().from(clienteApolices)
    .where(eq(clienteApolices.clienteId, req.params.clienteId))
    .orderBy(desc(clienteApolices.createdAt));
  res.json(rows);
});

clientesRouter.post('/:clienteId/apolices', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req)) return res.status(404).end();
  const [row] = await getDb().insert(clienteApolices)
    .values({ id: randomUUID(), ...req.body, clienteId: req.params.clienteId }).returning();
  await emitDataChanged('cliente_apolices', row.id, req.organizationId);
  res.status(201).json(row);
});

clientesRouter.patch('/:clienteId/apolices/:apoliceId', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req)) return res.status(404).end();
  const [row] = await getDb().update(clienteApolices).set(req.body)
    .where(eq(clienteApolices.id, req.params.apoliceId)).returning();
  await emitDataChanged('cliente_apolices', req.params.apoliceId, req.organizationId);
  res.json(row ?? null);
});

clientesRouter.delete('/:clienteId/apolices/:apoliceId', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req)) return res.status(404).end();
  await getDb().delete(clienteApolices).where(eq(clienteApolices.id, req.params.apoliceId));
  res.status(204).end();
});

// ── Histórico ─────────────────────────────────────────────────────────────

clientesRouter.get('/:clienteId/historico', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req)) return res.status(404).end();
  const rows = await getDb().select().from(clienteHistorico)
    .where(eq(clienteHistorico.clienteId, req.params.clienteId))
    .orderBy(desc(clienteHistorico.createdAt));
  res.json(rows);
});

clientesRouter.post('/:clienteId/historico', async (req: any, res) => {
  if (!await assertClienteInOrg(req.params.clienteId, req)) return res.status(404).end();
  const [row] = await getDb().insert(clienteHistorico)
    .values({ id: randomUUID(), ...req.body, clienteId: req.params.clienteId }).returning();
  await emitDataChanged('cliente_historico', row.id, req.organizationId);
  res.status(201).json(row);
});
