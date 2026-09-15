import { describe, it, expect, vi, afterEach } from 'vitest';
import { buscarVeiculos, buscarCodigoProduto, buscarPdfCotacao } from '../restClient.js';

const CONFIG = {
  baseUrl: 'https://wscotador-aceitew.tokiomarine.com.br',
  codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA', cpfEmissor: '111', ativa: true, ambiente: 'aceite-w' as const,
};

describe('tokioMarine/restClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('buscarVeiculos chama /modelos com os parâmetros certos e devolve a lista', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toBe('https://wscotador-aceitew.tokiomarine.com.br/TmsWS/Auto/consultas/modelos');
      const body = JSON.parse(opts.body);
      expect(body).toEqual({ codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA', codigoProduto: 1, anoModelo: '2023', codigoFIPE: undefined, tipoCombustivel: undefined, inicioVigencia: undefined });
      const responseBody = JSON.stringify({ veiculos: [{ idVeiculo: 999, codigoProduto: 1, nomeProduto: 'Automóvel', codigoFipe: '001004-9', codigoMolicar: null, categoria: '1', codigoFabricante: '56', descricaoFabricante: 'FIAT', codigoModelo: '1234', descricaoModelo: 'ARGO 1.0', lotacao: 5, lotacaoMaxima: 5, tipoCombustivel: 'GASOLINA' }] });
      return {
        ok: true, status: 200,
        text: async () => responseBody,
        json: async () => JSON.parse(responseBody),
      };
    }) as any;

    const result = await buscarVeiculos(CONFIG, { codigoProduto: 1, anoModelo: '2023' });
    expect(result.veiculos).toHaveLength(1);
    expect(result.veiculos[0].idVeiculo).toBe(999);
  });

  it('buscarCodigoProduto devolve a lista de produtos com erro tratado', async () => {
    const responseBody = JSON.stringify({ produtos: [{ codigo: 1, descricao: 'Automóvel' }, { codigo: 2, descricao: 'Moto' }] });
    global.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => responseBody,
      json: async () => JSON.parse(responseBody),
    })) as any;

    const result = await buscarCodigoProduto(CONFIG);
    expect(result.produtos.find((p) => p.descricao === 'Automóvel')?.codigo).toBe(1);
  });

  it('lança erro amigável quando a Tokio Marine responde erro HTTP', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' })) as any;
    await expect(buscarCodigoProduto(CONFIG)).rejects.toThrow(/401/);
  });

  it('buscarPdfCotacao posta em /impressao/cotacao/:numeroCalculo e devolve o pdf em base64', async () => {
    const responseBody = JSON.stringify({ impressao: { pdf: 'BASE64PDFDATA' } });
    global.fetch = vi.fn(async (url: any) => {
      expect(String(url)).toBe('https://wscotador-aceitew.tokiomarine.com.br/TmsWS/Auto/impressao/cotacao/123456');
      return { ok: true, status: 200, text: async () => responseBody, json: async () => JSON.parse(responseBody) };
    }) as any;

    const result = await buscarPdfCotacao(CONFIG, '123456');
    expect(result.impressao.pdf).toBe('BASE64PDFDATA');
  });
});
