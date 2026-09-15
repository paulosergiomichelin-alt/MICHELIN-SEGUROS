import { Router } from 'express';
import { requireAuth } from '../lib/authMiddleware.js';
import { loadTenantContext } from '../data/tenantMiddleware.js';
import { getInsurerCredentialsSafe, saveInsurerCredentials, getInsurerCredentials } from './credentials.js';

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
