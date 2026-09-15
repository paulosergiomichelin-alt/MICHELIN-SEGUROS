import { CotacaoInput, CotacaoResultado } from '../types.js';
import { TokioMarineCredentials } from '../credentials.js';

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildCotarBody(input: CotacaoInput, config: Pick<TokioMarineCredentials, 'cpfEmissor'>, codigoProduto: number): Record<string, any> {
  const { segurado, veiculo, condutor, cobertura, vigencia, renovacao } = input;

  const item: Record<string, any> = {
    IdVeiculo: veiculo.idVeiculoTokio,
    AnoModelo: veiculo.anoModelo,
    ZeroKm: veiculo.zeroKm ? 'S' : 'N',
    ValorVeiculo: veiculo.valorVeiculo,
    CEP: veiculo.cep,
    Placa: veiculo.placa,
    Chassi: veiculo.chassi,
    PercentualAjuste: veiculo.percentualAjuste,
    Blindagem: veiculo.blindado !== undefined ? (veiculo.blindado ? 'S' : 'N') : undefined,
    LmiBlindagem: veiculo.lmiBlindagem,
    KitGas: veiculo.kitGas !== undefined ? (veiculo.kitGas ? 'S' : 'N') : undefined,
    LmiKitGas: veiculo.lmiKitGas,
    NomeCondutor: condutor?.nome,
    CPFCondutor: condutor?.cpf,
    EstadoCivilCondutor: condutor?.estadoCivil,
    CodigoCobertura: cobertura.codigoCobertura,
    ClasseBonus: cobertura.classeBonus,
    InicioVigencia: vigencia.inicio,
    FinalVigencia: vigencia.fim,
    TipoSeguro: cobertura.tipoSeguro,
    TipoAssistencia: cobertura.tipoAssistencia,
    IsencaoFiscal: cobertura.isencaoFiscal,
    PrincipalCondutor: cobertura.principalCondutor,
    GaragemPrincipalCondutor: cobertura.garagemPrincipalCondutor,
    CoberturaPessoasResidentes1825Anos: cobertura.coberturaPessoasResidentes1825Anos,
    CodigoFranquiaIndenizacaoIntegral: cobertura.codigoFranquiaIndenizacaoIntegral,
    DanosMateriais: cobertura.danosMateriais,
    DanosCorporais: cobertura.danosCorporais,
    DanosMorais: cobertura.danosMorais,
    AppMorte: cobertura.appMorte,
    AppInvalidez: cobertura.appInvalidez,
    AppDmho: cobertura.appDmho,
  };

  // TipoModalidade não é obrigatório em cotação "sem casco" (RCF-V isolado ou Assistência
  // Exclusiva) — ADR-10 da spec.
  if (cobertura.codigoCobertura !== '3' && cobertura.codigoCobertura !== '6') {
    item.TipoModalidade = cobertura.tipoModalidade;
  }

  // CodigoFranquia (parcial) não se aplica quando a cobertura é RCF-V (3) ou Indenização
  // Integral (5) — ADR-10 da spec.
  if (cobertura.codigoCobertura !== '3' && cobertura.codigoCobertura !== '5') {
    item.CodigoFranquia = cobertura.codigoFranquia;
  }

  // Dados de renovação: CodigoSeguradoraAnterior obrigatório em renovação de congênere (6),
  // NumeroApoliceAnterior obrigatório em renovação Tokio (7) — conforme doc da Tokio Marine.
  if (cobertura.tipoSeguro === '6') {
    item.CodigoSeguradoraAnterior = renovacao?.codigoSeguradoraAnterior;
  }
  if (cobertura.tipoSeguro === '7') {
    item.NumeroApoliceAnterior = renovacao?.numeroApoliceAnterior;
  }
  if (cobertura.tipoSeguro === '6' || cobertura.tipoSeguro === '7') {
    item.DataVencimentoApoliceAnterior = renovacao?.dataVencimentoApoliceAnterior;
  }

  return {
    Calculo: {
      CpfEmissor: config.cpfEmissor,
      Segurado: {
        NomeSegurado: segurado.nome,
        CGC_CPF: segurado.cpfCnpj,
        TipoPessoa: segurado.tipoPessoa === 'juridica' ? 'J' : 'F',
        TelefoneSegurado: segurado.telefone,
        EmailSegurado: segurado.email,
      },
      Item: item,
      CodigoProduto: codigoProduto,
    },
  };
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseCotarResponse(providerId: string, retorno: any): CotacaoResultado {
  const erros = toArray(retorno?.Erros?.Mensagem);
  if (erros.length > 0 || !retorno?.Calculo) {
    return { providerId, ok: false, erro: erros[0] ?? 'Erro desconhecido ao calcular na Tokio Marine' };
  }

  const calculo = retorno.Calculo;
  const avisos = toArray(calculo?.Avisos?.Mensagem);
  const itensXml = toArray(calculo?.Itens?.Item);

  const itens = itensXml.map((itemXml: any) => {
    const modalidadesXml = toArray(itemXml?.Modalidades?.Modalidade);
    const modalidades = modalidadesXml.map((mod: any) => {
      const coberturasXml = toArray(mod?.Coberturas?.Cobertura);
      const condicoesXml = toArray(mod?.Parcelas?.CondicaoPagamento);
      const parcelas = condicoesXml.flatMap((cond: any) =>
        toArray(cond?.FormaPagamento).flatMap((forma: any) =>
          toArray(forma?.Parcela).map((p: any) => ({
            numero: toNum(p.NumeroParcela),
            valor: toNum(p.ValorPrimeira ?? p.ValorDemais),
          })),
        ),
      );
      return {
        codigoModalidade: String(mod.CodigoModalidade),
        descricaoModalidade: String(mod.DescricaoModalidade ?? ''),
        premioLiquido: toNum(mod.PremioLiquido),
        custoApolice: toNum(mod.CustoApolice),
        coberturas: coberturasXml.map((c: any) => ({
          codigo: String(c.CodigoCobertura), descricao: String(c.DescricaoCobertura ?? ''),
          valor: c.ValorCobertura !== undefined ? toNum(c.ValorCobertura) : undefined,
          premio: c.PremioCobertura !== undefined ? toNum(c.PremioCobertura) : undefined,
          franquia: c.FranquiaCobertura !== undefined ? String(c.FranquiaCobertura) : undefined,
        })),
        parcelas,
      };
    });
    return { providerId, numeroCalculo: String(calculo.NumeroCalculo), modalidades, avisos: avisos.map(String) };
  });

  return { providerId, ok: true, itens };
}
