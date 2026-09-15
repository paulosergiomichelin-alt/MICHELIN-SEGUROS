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
    cep: string;
    placa?: string;
    chassi?: string;
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
    principalCondutor?: string;
    garagemPrincipalCondutor?: string;
    coberturaPessoasResidentes1825Anos?: string;
  };
  vigencia: {
    inicio: string; // DD/MM/AAAA
    fim: string;    // DD/MM/AAAA
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
