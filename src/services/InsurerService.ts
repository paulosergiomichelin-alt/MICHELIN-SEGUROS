import { authHeader } from '../lib/dataApiClient';

export interface CotacaoInput {
  leadId?: string;
  segurado: { nome: string; cpfCnpj: string; tipoPessoa: 'fisica' | 'juridica'; telefone?: string; email?: string };
  veiculo: {
    idVeiculoTokio?: number; anoModelo: number; zeroKm: boolean; valorVeiculo: number; cep: string; placa?: string; chassi?: string;
    percentualAjuste?: number; blindado?: boolean; lmiBlindagem?: number; kitGas?: boolean; lmiKitGas?: number;
  };
  condutor?: { nome?: string; cpf?: string; estadoCivil?: string };
  cobertura: {
    classeBonus?: number; tipoSeguro: '1' | '6' | '7'; tipoAssistencia: 'N' | 'C' | 'V'; isencaoFiscal?: string;
    codigoCobertura: string; tipoModalidade?: string; codigoFranquia?: string; codigoFranquiaIndenizacaoIntegral?: string;
    principalCondutor?: string; garagemPrincipalCondutor?: string; coberturaPessoasResidentes1825Anos?: string;
    danosMateriais?: number; danosCorporais?: number; danosMorais?: number;
    appMorte?: number; appInvalidez?: number; appDmho?: number;
  };
  vigencia: { inicio: string; fim: string };
  renovacao?: { codigoSeguradoraAnterior?: string; numeroApoliceAnterior?: string; dataVencimentoApoliceAnterior?: string };
}

export interface CotacaoResultado {
  providerId: string;
  ok: boolean;
  itens?: Array<{
    providerId: string; numeroCalculo: string;
    modalidades: Array<{ codigoModalidade: string; descricaoModalidade: string; premioLiquido: number; custoApolice: number; coberturas: Array<{ codigo: string; descricao: string; valor?: number; premio?: number; franquia?: string }>; parcelas: Array<{ numero: number; valor: number }> }>;
    avisos: string[];
  }>;
  erro?: string;
}

export interface VeiculoTokioMarine {
  idVeiculo: number; nomeProduto: string; descricaoFabricante: string; descricaoModelo: string; tipoCombustivel: string;
}

async function handle(res: Response) {
  if (!res.ok) throw new Error(`API /api/insurers respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

export const InsurerService = {
  async buscarVeiculos(anoModelo: string): Promise<{ veiculos: VeiculoTokioMarine[] }> {
    const res = await fetch(`/api/insurers/veiculos?anoModelo=${encodeURIComponent(anoModelo)}`, { headers: await authHeader() });
    return handle(res);
  },
  async cotar(input: CotacaoInput): Promise<CotacaoResultado[]> {
    const res = await fetch('/api/insurers/cotar', { method: 'POST', headers: await authHeader(), body: JSON.stringify(input) });
    return handle(res);
  },
  async buscarPdf(numeroCalculo: string): Promise<{ pdf: string }> {
    const res = await fetch(`/api/insurers/cotacao/${numeroCalculo}/pdf`, { headers: await authHeader() });
    return handle(res);
  },
};
