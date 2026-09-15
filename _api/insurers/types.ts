export interface CotacaoInput {
  leadId?: string;
  segurado: {
    nome: string;
    cpfCnpj: string;
    tipoPessoa: 'fisica' | 'juridica';
    telefone?: string;
    email?: string;
  };
  veiculo: {
    idVeiculoTokio?: number;
    anoModelo: number;
    zeroKm: boolean;
    valorVeiculo: number;
    cep: string; // TM só tem um CEP no Item — cobre "CEP Residencial"/"CEP Pernoite" do Agger, que não existem separados aqui
    placa?: string;
    chassi?: string;
    percentualAjuste?: number; // "Fipe (%)" no Agger — TM: PercentualAjuste
    blindado?: boolean; // "Blindado" no Agger — TM: Blindagem
    lmiBlindagem?: number;
    kitGas?: boolean; // "Kit Gás" no Agger — TM: KitGas
    lmiKitGas?: number; // "Valor kit Gás" no Agger — TM: LmiKitGas
  };
  condutor?: {
    // "Condutor" no Agger. TM não tem data de nascimento/sexo/tempo de habilitação pra
    // condutor — só esses três campos existem no cotar.
    nome?: string;
    cpf?: string;
    estadoCivil?: string;
  };
  cobertura: {
    classeBonus?: number;
    tipoSeguro: '1' | '6' | '7';
    tipoAssistencia: 'N' | 'C' | 'V';
    isencaoFiscal?: '24747' | '24748' | '24749';
    codigoCobertura: '1' | '2' | '3' | '4' | '5' | '6';
    tipoModalidade?: 'A' | 'D';
    codigoFranquia?: string;
    codigoFranquiaIndenizacaoIntegral?: string;
    principalCondutor?: string; // "Condutor Principal" no Agger
    garagemPrincipalCondutor?: string; // "Garagem na Residência" no Agger
    coberturaPessoasResidentes1825Anos?: string; // "Jovem Condutor" no Agger (domínio ainda não confirmado, ver spec §5)
    // RCF — "Coberturas > RCF" no Agger
    danosMateriais?: number;
    danosCorporais?: number;
    danosMorais?: number;
    // APP — "Coberturas > APP" no Agger
    appMorte?: number;
    appInvalidez?: number;
    appDmho?: number;
  };
  vigencia: {
    inicio: string; // DD/MM/AAAA
    fim: string;    // DD/MM/AAAA
  };
  renovacao?: {
    // "Renovação" no Agger — só se aplica quando cobertura.tipoSeguro é '6' ou '7'.
    codigoSeguradoraAnterior?: string; // obrigatório p/ tipoSeguro '6' — domínio sem lookup identificado, texto livre
    numeroApoliceAnterior?: string; // obrigatório p/ tipoSeguro '7'
    dataVencimentoApoliceAnterior?: string; // DD/MM/AAAA
  };
}

export interface CotacaoResultadoItem {
  providerId: string;
  numeroCalculo: string;
  modalidades: Array<{
    codigoModalidade: string;
    descricaoModalidade: string;
    premioLiquido: number;
    custoApolice: number;
    coberturas: Array<{ codigo: string; descricao: string; valor?: number; premio?: number; franquia?: string }>;
    parcelas: Array<{ numero: number; valor: number }>;
  }>;
  avisos: string[];
}

export interface CotacaoResultado {
  providerId: string;
  ok: boolean;
  itens?: CotacaoResultadoItem[];
  erro?: string;
}

export interface InsurerProvider {
  id: string;
  cotar(organizationId: string, input: CotacaoInput): Promise<CotacaoResultado>;
}
