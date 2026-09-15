import { describe, it, expect } from 'vitest';
import { buildCotarBody, parseCotarResponse } from '../mapper.js';
import { CotacaoInput } from '../../types.js';

const CONFIG = { cpfEmissor: '11122233344' } as any;

const BASE_INPUT: CotacaoInput = {
  segurado: { nome: 'João da Silva', cpfCnpj: '11122233344', tipoPessoa: 'fisica', telefone: '67999999999', email: 'joao@example.com' },
  veiculo: { idVeiculoTokio: 999, anoModelo: 2023, zeroKm: false, valorVeiculo: 55000, cep: '79000000', placa: 'ABC1D23', chassi: '9BWZZZ377VT004251' },
  cobertura: { classeBonus: 0, tipoSeguro: '1', tipoAssistencia: 'C', codigoCobertura: '1', tipoModalidade: 'A', codigoFranquia: '1' },
  vigencia: { inicio: '15/09/2026', fim: '15/09/2027' },
};

describe('tokioMarine/mapper — buildCotarBody', () => {
  it('monta o Calculo com Segurado e Item a partir do CotacaoInput', () => {
    const body = buildCotarBody(BASE_INPUT, CONFIG, 1);
    expect(body.Calculo.CpfEmissor).toBe('11122233344');
    expect(body.Calculo.Segurado.NomeSegurado).toBe('João da Silva');
    expect(body.Calculo.Segurado.CGC_CPF).toBe('11122233344');
    expect(body.Calculo.Segurado.TipoPessoa).toBe('F');
    expect(body.Calculo.Item.IdVeiculo).toBe(999);
    expect(body.Calculo.Item.AnoModelo).toBe(2023);
    expect(body.Calculo.Item.ZeroKm).toBe('N');
    expect(body.Calculo.Item.CodigoCobertura).toBe('1');
    expect(body.Calculo.Item.CodigoFranquia).toBe('1');
    expect(body.Calculo.Item.InicioVigencia).toBe('15/09/2026');
    expect(body.Calculo.CodigoProduto).toBe(1);
  });

  it('não envia CodigoFranquia quando CodigoCobertura é 3 (RCF-V)', () => {
    const input = { ...BASE_INPUT, cobertura: { ...BASE_INPUT.cobertura, codigoCobertura: '3' as const, codigoFranquia: '1' } };
    const body = buildCotarBody(input, CONFIG, 1);
    expect(body.Calculo.Item.CodigoFranquia).toBeUndefined();
  });

  it('não envia CodigoFranquia quando CodigoCobertura é 5 (Indenização Integral)', () => {
    const input = { ...BASE_INPUT, cobertura: { ...BASE_INPUT.cobertura, codigoCobertura: '5' as const, codigoFranquia: '1' } };
    const body = buildCotarBody(input, CONFIG, 1);
    expect(body.Calculo.Item.CodigoFranquia).toBeUndefined();
  });

  it('envia TipoPessoa J e usa Nome do Responsável quando pessoa jurídica', () => {
    const input = { ...BASE_INPUT, segurado: { ...BASE_INPUT.segurado, tipoPessoa: 'juridica' as const, cpfCnpj: '11222333000181' } };
    const body = buildCotarBody(input, CONFIG, 1);
    expect(body.Calculo.Segurado.TipoPessoa).toBe('J');
  });
});

describe('tokioMarine/mapper — parseCotarResponse', () => {
  it('extrai modalidades, coberturas e parcelas do XML de retorno', () => {
    const retorno = {
      Calculo: {
        Avisos: { Mensagem: ['Cálculo válido por 7 dias'] },
        NumeroCalculo: '830044509',
        Itens: {
          Item: [{
            ITEM: '1', Placa: 'ABC1D23', Chassi: '9BWZZZ377VT004251',
            Modalidades: {
              Modalidade: [{
                CodigoModalidade: 'M1', CodigoProduto: '1', DescricaoModalidade: 'Compreensiva',
                PremioLiquido: '1200.50', CustoApolice: '25.00',
                Coberturas: { Cobertura: [{ CodigoCobertura: '1', DescricaoCobertura: 'Compreensiva', ValorCobertura: '55000.00', PremioCobertura: '1200.50', FranquiaCobertura: '1500.00' }] },
                Parcelas: { CondicaoPagamento: [{ CodigoCondicaoPagamento: '2', FormaPagamento: [{ CodigoFormaPagamento: '1', Parcela: [{ NumeroParcela: '1', ValorPrimeira: '120.05' }, { NumeroParcela: '2', ValorDemais: '110.00' }] }] }] },
              }],
            },
          }],
        },
      },
      Erros: undefined,
    };

    const result = parseCotarResponse('tokio', retorno);
    expect(result.ok).toBe(true);
    expect(result.itens).toHaveLength(1);
    expect(result.itens![0].numeroCalculo).toBe('830044509');
    expect(result.itens![0].avisos).toEqual(['Cálculo válido por 7 dias']);
    const modalidade = result.itens![0].modalidades[0];
    expect(modalidade.premioLiquido).toBe(1200.5);
    expect(modalidade.coberturas[0].codigo).toBe('1');
    expect(modalidade.parcelas).toHaveLength(2);
    expect(modalidade.parcelas[0].valor).toBe(120.05);
  });

  it('devolve ok:false com a mensagem de erro quando a Tokio Marine recusa o cálculo', () => {
    const retorno = { Calculo: undefined, Erros: { Mensagem: ['CEP inválido'] } };
    const result = parseCotarResponse('tokio', retorno);
    expect(result.ok).toBe(false);
    expect(result.erro).toBe('CEP inválido');
  });
});
