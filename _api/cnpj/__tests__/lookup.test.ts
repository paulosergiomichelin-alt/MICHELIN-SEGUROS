import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../lookup.js';

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('_api/cnpj/lookup handler', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('rejeita CNPJ com menos de 14 dígitos antes de chamar a API', async () => {
    global.fetch = vi.fn();
    const req = { method: 'GET', params: { cnpj: '123' } };
    const res = makeRes();

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('busca na BrasilAPI e mapeia os campos pro formato interno', async () => {
    global.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toBe('https://brasilapi.com.br/api/cnpj/v1/11222333000181');
      return {
        ok: true, status: 200,
        json: async () => ({
          cnpj: '11222333000181',
          razao_social: 'Empresa Exemplo LTDA',
          nome_fantasia: 'Exemplo',
          descricao_situacao_cadastral: 'ATIVA',
          descricao_porte: 'DEMAIS',
          cnae_fiscal_descricao: 'Desenvolvimento de programas de computador sob encomenda',
          cep: '01310100',
          logradouro: 'Avenida Paulista',
          numero: '1000',
          complemento: 'Sala 1',
          bairro: 'Bela Vista',
          municipio: 'São Paulo',
          uf: 'SP',
        }),
      };
    }) as any;

    const req = { method: 'GET', params: { cnpj: '11.222.333/0001-81' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      cnpj: '11222333000181',
      razaoSocial: 'Empresa Exemplo LTDA',
      nomeFantasia: 'Exemplo',
      situacaoCadastral: 'ATIVA',
      porte: 'DEMAIS',
      cnae: 'Desenvolvimento de programas de computador sob encomenda',
      cep: '01310100',
      rua: 'Avenida Paulista',
      numero: '1000',
      complemento: 'Sala 1',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
    });
  });

  it('devolve 404 quando a BrasilAPI não encontra o CNPJ', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, text: async () => 'not found' })) as any;
    const req = { method: 'GET', params: { cnpj: '11222333000181' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('devolve 502 quando a BrasilAPI responde outro erro', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })) as any;
    const req = { method: 'GET', params: { cnpj: '11222333000181' } };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });
});
