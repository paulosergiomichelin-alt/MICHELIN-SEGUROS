import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({ getTokioMarineConfig: vi.fn() }));
vi.mock('../restClient.js', () => ({ buscarCodigoProduto: vi.fn() }));
vi.mock('../soapClient.js', () => ({ callSoap: vi.fn() }));

import { getTokioMarineConfig } from '../config.js';
import { buscarCodigoProduto } from '../restClient.js';
import { callSoap } from '../soapClient.js';
import { tokioMarineProvider } from '../provider.js';
import { CotacaoInput } from '../../types.js';

const INPUT: CotacaoInput = {
  segurado: { nome: 'João', cpfCnpj: '11122233344', tipoPessoa: 'fisica' },
  veiculo: { idVeiculoTokio: 999, anoModelo: 2023, zeroKm: false, valorVeiculo: 55000, cep: '79000000' },
  cobertura: { tipoSeguro: '1', tipoAssistencia: 'C', codigoCobertura: '1' },
  vigencia: { inicio: '15/09/2026', fim: '15/09/2027' },
};

describe('tokioMarineProvider.cotar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('resolve o CodigoProduto de Automóvel, chama o SOAP cotar e devolve o resultado mapeado', async () => {
    (getTokioMarineConfig as any).mockResolvedValue({ baseUrl: 'https://x', cpfEmissor: '111', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'S1' });
    (buscarCodigoProduto as any).mockResolvedValue({ produtos: [{ codigo: 7, descricao: 'Automóvel' }, { codigo: 9, descricao: 'Moto' }] });
    (callSoap as any).mockResolvedValue({ Retorno: { Calculo: { NumeroCalculo: '830044509', Itens: { Item: [] } }, Erros: undefined } });

    const result = await tokioMarineProvider.cotar('org1', INPUT);

    expect(buscarCodigoProduto).toHaveBeenCalled();
    expect(callSoap).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://x', path: '/TmsWS/Auto/Cotacao?wsdl', namespace: 'CotacaoWS', method: 'cotar',
      body: expect.objectContaining({ codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'S1' }),
    }));
    expect(result.ok).toBe(true);
    expect(result.providerId).toBe('tokio');
  });

  it('devolve ok:false com erro amigável quando não acha "Automóvel" na lista de produtos', async () => {
    (getTokioMarineConfig as any).mockResolvedValue({ baseUrl: 'https://x', cpfEmissor: '111' });
    (buscarCodigoProduto as any).mockResolvedValue({ produtos: [{ codigo: 9, descricao: 'Moto' }] });

    const result = await tokioMarineProvider.cotar('org1', INPUT);

    expect(result.ok).toBe(false);
    expect(result.erro).toContain('Automóvel');
    expect(callSoap).not.toHaveBeenCalled();
  });

  it('devolve ok:false quando as credenciais não estão configuradas', async () => {
    (getTokioMarineConfig as any).mockRejectedValue(new Error('Nenhuma credencial da Tokio Marine cadastrada'));
    const result = await tokioMarineProvider.cotar('org1', INPUT);
    expect(result.ok).toBe(false);
    expect(result.erro).toContain('credencial');
  });
});
