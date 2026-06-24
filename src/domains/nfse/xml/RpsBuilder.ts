import type { RpsData } from '../types';

/**
 * Construtor de RPS no padrão ABRASF 2.02.
 * Utilizado pelo BethaProvider para montar o XML de envio.
 */
export class RpsBuilder {
  build(rps: RpsData): string {
    // TODO: implementar geração completa do XML ABRASF 2.02
    // Estrutura base do envelope SOAP para envio ao Betha
    return `<?xml version="1.0" encoding="UTF-8"?>
<EnviarLoteRpsEnvio xmlns="http://www.betha.com.br/e-nota-contribuinte-ws">
  <LoteRps Id="lote1">
    <NumeroLote>1</NumeroLote>
    <Cnpj>${rps.prestador.cnpj}</Cnpj>
    <InscricaoMunicipal>${rps.prestador.inscricaoMunicipal}</InscricaoMunicipal>
    <QuantidadeRps>1</QuantidadeRps>
    <ListaRps>
      <Rps>
        <InfRps Id="rps1">
          <IdentificacaoRps>
            <Numero>${rps.numero}</Numero>
            <Serie>${rps.serie}</Serie>
            <Tipo>${rps.tipo}</Tipo>
          </IdentificacaoRps>
          <DataEmissao>${rps.dataEmissao}</DataEmissao>
          <NaturezaOperacao>${rps.naturezaOperacao}</NaturezaOperacao>
          <OptanteSimplesNacional>${rps.optanteSimplesNacional ? 1 : 2}</OptanteSimplesNacional>
          <IncentivadorCultural>${rps.incentivadorCultural ? 1 : 2}</IncentivadorCultural>
          <Status>${rps.status}</Status>
          <Servico>
            <Valores>
              <ValorServicos>${rps.servico.valores.valorServicos.toFixed(2)}</ValorServicos>
              <ValorDeducoes>${rps.servico.valores.valorDeducoes.toFixed(2)}</ValorDeducoes>
              <IssRetido>${rps.servico.valores.issRetido ? 1 : 2}</IssRetido>
              <ValorIss>${rps.servico.valores.valorIss.toFixed(2)}</ValorIss>
              <BaseCalculo>${rps.servico.valores.baseCalculo.toFixed(2)}</BaseCalculo>
              <Aliquota>${rps.servico.valores.aliquota}</Aliquota>
              <ValorLiquidoNfse>${rps.servico.valores.valorLiquidoNfse.toFixed(2)}</ValorLiquidoNfse>
            </Valores>
            <ItemListaServico>${rps.servico.itemListaServico}</ItemListaServico>
            <CodigoCnae>${rps.servico.codigoCnae}</CodigoCnae>
            <CodigoTributacaoMunicipio>${rps.servico.codigoTributacaoMunicipio}</CodigoTributacaoMunicipio>
            <Discriminacao>${rps.servico.discriminacao}</Discriminacao>
            <CodigoMunicipio>${rps.servico.codigoMunicipio}</CodigoMunicipio>
          </Servico>
          <Prestador>
            <Cnpj>${rps.prestador.cnpj}</Cnpj>
            <InscricaoMunicipal>${rps.prestador.inscricaoMunicipal}</InscricaoMunicipal>
          </Prestador>
          <Tomador>
            <IdentificacaoTomador>
              <CpfCnpj>
                ${rps.tomador.cpfCnpj.replace(/\D/g, '').length === 11
                  ? `<Cpf>${rps.tomador.cpfCnpj.replace(/\D/g, '')}</Cpf>`
                  : `<Cnpj>${rps.tomador.cpfCnpj.replace(/\D/g, '')}</Cnpj>`}
              </CpfCnpj>
            </IdentificacaoTomador>
            <RazaoSocial>${rps.tomador.razaoSocial}</RazaoSocial>
          </Tomador>
        </InfRps>
      </Rps>
    </ListaRps>
  </LoteRps>
</EnviarLoteRpsEnvio>`;
  }
}
