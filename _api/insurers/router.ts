import { Router } from 'express';
import { randomBytes } from 'crypto';
import { requireAuth } from '../lib/authMiddleware.js';
import { loadTenantContext } from '../data/tenantMiddleware.js';
import { getDb } from '../lib/db.js';
import { cotacoes } from '../db/schema/insurers.js';
import { getInsurerCredentialsSafe, saveInsurerCredentials, getInsurerCredentials } from './credentials.js';
import { PROVIDERS } from './registry.js';
import { buscarVeiculos, buscarPdfCotacao, buscarCodigoProduto } from './tokioMarine/restClient.js';
import { getTokioMarineConfig } from './tokioMarine/config.js';
import type { CotacaoInput } from './types.js';

function generateId(): string {
  return randomBytes(9).toString('base64url');
}

export const insurersRouter = Router();
insurersRouter.use(requireAuth);
insurersRouter.use(loadTenantContext);

function requireAdmin(req: any, res: any, next: any) {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem gerenciar credenciais de seguradora' });
  next();
}

insurersRouter.get('/credenciais', requireAdmin, async (req: any, res) => {
  const creds = await getInsurerCredentialsSafe(req.organizationId);
  res.json(creds);
});

insurersRouter.put('/credenciais/:providerId', requireAdmin, async (req: any, res) => {
  const { ativa, ambiente, codigoCorretor, codigoUsuario, codigoOperadora, cpfEmissor } = req.body ?? {};
  if (!ambiente || !codigoCorretor || !codigoUsuario || !cpfEmissor) {
    return res.status(400).json({ error: 'ambiente, codigoCorretor, codigoUsuario e cpfEmissor são obrigatórios' });
  }
  await saveInsurerCredentials(req.organizationId, req.params.providerId, {
    ativa: !!ativa, ambiente, codigoCorretor, codigoUsuario, codigoOperadora: codigoOperadora ?? '', cpfEmissor,
  });
  res.status(204).end();
});

insurersRouter.post('/credenciais/:providerId/validar', requireAdmin, async (req: any, res) => {
  const creds = await getInsurerCredentials(req.organizationId, req.params.providerId);
  if (!creds) return res.status(400).json({ ok: false, error: 'Nenhuma credencial salva para validar' });
  // Validação real (chamar /codigoProduto da Tokio Marine) entra na Task 7, quando o
  // restClient existir. Por enquanto confirma só que há credencial salva.
  res.json({ ok: true, pendingRealValidation: true });
});

insurersRouter.post('/cotar', async (req: any, res) => {
  const input = req.body as CotacaoInput;
  if (!input?.segurado?.nome || !input?.veiculo?.idVeiculoTokio) {
    return res.status(400).json({ error: 'Dados de segurado e veículo (com idVeiculoTokio) são obrigatórios' });
  }

  const resultados = await Promise.all(PROVIDERS.map((p) => p.cotar(req.organizationId, input)));

  await Promise.all(resultados.map((r) =>
    getDb().insert(cotacoes).values({
      id: generateId(),
      organizationId: req.organizationId,
      leadId: input.leadId ?? null,
      providerId: r.providerId,
      numeroCalculo: r.itens?.[0]?.numeroCalculo ?? null,
      status: r.ok ? 'ok' : 'erro',
      resultado: r.itens ?? null,
      erro: r.erro ?? null,
      createdBy: req.userId,
    }),
  ));

  res.json(resultados);
});

insurersRouter.get('/veiculos', async (req: any, res) => {
  const { anoModelo, codigoFIPE, tipoCombustivel } = req.query ?? {};
  if (!anoModelo) return res.status(400).json({ error: 'anoModelo é obrigatório' });
  try {
    const config = await getTokioMarineConfig(req.organizationId);
    const { produtos } = await buscarCodigoProduto(config);
    const produtoAuto = produtos.find((p) => p.descricao.toLowerCase().includes('autom'));
    if (!produtoAuto) return res.status(502).json({ error: 'Código do produto Automóvel não encontrado na Tokio Marine' });
    const result = await buscarVeiculos(config, {
      codigoProduto: produtoAuto.codigo, anoModelo: String(anoModelo),
      codigoFIPE: codigoFIPE ? String(codigoFIPE) : undefined,
      tipoCombustivel: tipoCombustivel ? String(tipoCombustivel) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'Erro ao buscar veículos na Tokio Marine' });
  }
});

insurersRouter.get('/cotacao/:numeroCalculo/pdf', async (req: any, res) => {
  try {
    const config = await getTokioMarineConfig(req.organizationId);
    const result = await buscarPdfCotacao(config, req.params.numeroCalculo);
    res.json({ pdf: result.impressao.pdf });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'Erro ao buscar PDF da cotação' });
  }
});
