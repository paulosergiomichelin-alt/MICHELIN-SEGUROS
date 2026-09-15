import { TokioMarineConfig } from './config.js';

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function postConsulta<T>(config: TokioMarineConfig, method: string, extra: Record<string, any> = {}): Promise<T> {
  const res = await fetchWithTimeout(`${config.baseUrl}/TmsWS/Auto/consultas/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigoCorretor: config.codigoCorretor,
      codigoUsuario: config.codigoUsuario,
      codigoOperadora: config.codigoOperadora,
      ...extra,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tokio Marine REST "${method}" retornou ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

export interface VeiculoTokioMarine {
  idVeiculo: number; codigoProduto: number; nomeProduto: string; codigoFipe: string | null; codigoMolicar: string | null;
  categoria: string; codigoFabricante: string; descricaoFabricante: string; codigoModelo: string; descricaoModelo: string;
  lotacao: number; lotacaoMaxima: number; tipoCombustivel: string;
}

export async function buscarVeiculos(
  config: TokioMarineConfig,
  params: { codigoProduto: number; anoModelo: string; codigoFIPE?: string; tipoCombustivel?: string; inicioVigencia?: string },
): Promise<{ veiculos: VeiculoTokioMarine[] }> {
  return postConsulta(config, 'modelos', params);
}

export async function buscarCpfEmissor(config: TokioMarineConfig): Promise<{ listaCpfEmissor: Array<{ cpf: string; nome: string }> }> {
  return postConsulta(config, 'cpfEmissor', { codigoParceiroNegocio: undefined });
}

export async function buscarCoberturasAdicionais(
  config: TokioMarineConfig, codigoProduto: number,
): Promise<{ coberturasAdicionais: Array<{ codigo: number; descricao: string; opcoes: Array<{ codigo: string; descricao: string }> }> }> {
  return postConsulta(config, 'coberturasAdicionais', { codigoProduto });
}

export async function buscarValorMercado(
  config: TokioMarineConfig, params: { anoModelo: string; idVeiculo: number; zeroKm: string; inicioVigencia: string },
): Promise<{ valorMercado: { valor: string } }> {
  return postConsulta(config, 'valorMercado', params);
}

export async function buscarFranquiaIndenizacaoIntegral(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'franquiaIndenizacaoIntegral', params);
}

export async function buscarPrincipalCondutor(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string; tipoPessoa: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'principalCondutor', params);
}

export async function buscarGaragemPrincipalCondutor(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'principalCondutorGaragem', params);
}

export async function buscarCoberturaResidentes1825Anos(
  config: TokioMarineConfig, params: { codigoProduto: number; inicioVigencia: string },
): Promise<{ tipos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'coberturaResidentes1825Anos', params);
}

export async function buscarCodigoProduto(config: TokioMarineConfig): Promise<{ produtos: Array<{ codigo: number; descricao: string }> }> {
  return postConsulta(config, 'codigoProduto');
}

export async function buscarPdfCotacao(config: TokioMarineConfig, numeroCalculo: string): Promise<{ impressao: { pdf: string } }> {
  const res = await fetchWithTimeout(`${config.baseUrl}/TmsWS/Auto/impressao/cotacao/${numeroCalculo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigoCorretor: config.codigoCorretor, codigoUsuario: config.codigoUsuario, codigoOperadora: config.codigoOperadora,
      produtos: null, formasPagamento: null,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tokio Marine REST "cotacao/pdf" retornou ${res.status}: ${text}`);
  return JSON.parse(text);
}
