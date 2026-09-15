import { InsurerProvider, CotacaoInput, CotacaoResultado } from '../types.js';
import { getTokioMarineConfig } from './config.js';
import { buscarCodigoProduto } from './restClient.js';
import { callSoap } from './soapClient.js';
import { buildCotarBody, parseCotarResponse } from './mapper.js';

async function cotar(organizationId: string, input: CotacaoInput): Promise<CotacaoResultado> {
  try {
    const config = await getTokioMarineConfig(organizationId);

    const { produtos } = await buscarCodigoProduto(config);
    const produtoAuto = produtos.find((p) => p.descricao.toLowerCase().includes('automóvel') || p.descricao.toLowerCase().includes('automovel'));
    if (!produtoAuto) {
      return { providerId: 'tokio', ok: false, erro: 'Não foi possível localizar o código do produto "Automóvel" na Tokio Marine' };
    }

    const body = buildCotarBody(input, config, produtoAuto.codigo);
    const retorno = await callSoap({
      baseUrl: config.baseUrl,
      path: '/TmsWS/Auto/Cotacao?wsdl',
      namespace: 'CotacaoWS',
      method: 'cotar',
      body: { codigoCorretor: config.codigoCorretor, codigoUsuario: config.codigoUsuario, codigoOperadora: config.codigoOperadora, xmlEnvio: body },
    });

    return parseCotarResponse('tokio', retorno?.Retorno);
  } catch (err: any) {
    return { providerId: 'tokio', ok: false, erro: err?.message ?? 'Erro inesperado ao consultar a Tokio Marine' };
  }
}

export const tokioMarineProvider: InsurerProvider = { id: 'tokio', cotar };
