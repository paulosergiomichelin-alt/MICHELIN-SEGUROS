// src/services/__tests__/CnpjService.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CnpjService } from '../CnpjService';

vi.mock('../../lib/dataApiClient', () => ({
  authHeader: vi.fn(async () => ({ Authorization: 'Bearer test-token', 'Content-Type': 'application/json' })),
}));

describe('CnpjService.lookup', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('chama a rota certa, envia o token de auth e devolve os dados da empresa', async () => {
    global.fetch = vi.fn(async (url: any, options: any) => {
      expect(String(url)).toBe('/api/cnpj/11222333000181');
      expect(options?.headers?.Authorization).toBe('Bearer test-token');
      return { ok: true, status: 200, json: async () => ({ cnpj: '11222333000181', razaoSocial: 'Empresa Exemplo LTDA' }) };
    }) as any;

    const result = await CnpjService.lookup('11.222.333/0001-81');
    expect(result).toEqual({ cnpj: '11222333000181', razaoSocial: 'Empresa Exemplo LTDA' });
  });

  it('lança erro com a mensagem do backend quando a resposta não é ok', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'CNPJ não encontrado' }) })) as any;

    await expect(CnpjService.lookup('11222333000181')).rejects.toThrow('CNPJ não encontrado');
  });
});
