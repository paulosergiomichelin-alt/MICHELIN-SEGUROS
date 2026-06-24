export type {
  NfseStatus,
  NfseProvider,
  NfseEnvironment,
  RegimeTributario,
  CertificateType,
  EnderecoFiscal,
  FiscalSettings,
  CertificateInfo,
  FiscalService,
  NfseDocument,
  NfseLog,
} from '../../../types';

export interface RpsData {
  numero: string;
  serie: string;
  tipo: number;
  dataEmissao: string;
  naturezaOperacao: number;
  regimeEspecialTributacao: number;
  optanteSimplesNacional: boolean;
  incentivadorCultural: boolean;
  status: number;
  prestador: {
    cnpj: string;
    inscricaoMunicipal: string;
  };
  tomador: {
    cpfCnpj: string;
    razaoSocial: string;
    email?: string;
    endereco?: {
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      codigoMunicipio: string;
      uf: string;
      cep: string;
    };
  };
  servico: {
    valores: {
      valorServicos: number;
      valorDeducoes: number;
      valorPis: number;
      valorCofins: number;
      valorInss: number;
      valorIr: number;
      valorCsll: number;
      issRetido: boolean;
      valorIss: number;
      valorIssRetido: number;
      baseCalculo: number;
      aliquota: number;
      valorLiquidoNfse: number;
      descontoIncondicionado: number;
      descontoCondicionado: number;
    };
    itemListaServico: string;
    codigoCnae: string;
    codigoTributacaoMunicipio: string;
    discriminacao: string;
    codigoMunicipio: string;
  };
}

export interface NfseResult {
  success: boolean;
  numeroNota?: string;
  numeroRps?: string;
  protocolo?: string;
  codigoVerificacao?: string;
  xmlRetorno?: string;
  error?: string;
}

export interface DanfseData {
  empresa: {
    razaoSocial: string;
    nomeFantasia?: string;
    cnpj: string;
    inscricaoMunicipal?: string;
    endereco?: string;
    telefone?: string;
    email?: string;
    logoUrl?: string;
  };
  nota: import('../../../types').NfseDocument;
}

export interface NfseMonthlyStats {
  total: number;
  valorTotal: number;
  issTotal: number;
  ticketMedio: number;
}
