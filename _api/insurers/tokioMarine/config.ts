import { getInsurerCredentials, TokioMarineCredentials } from '../credentials.js';

const BASE_URLS: Record<TokioMarineCredentials['ambiente'], string> = {
  'aceite-w': 'https://wscotador-aceitew.tokiomarine.com.br',
  'aceite-y': 'https://wscotador-aceitey.tokiomarine.com.br',
  'producao': 'https://wscotador.tokiomarine.com.br',
};

export interface TokioMarineConfig extends TokioMarineCredentials {
  baseUrl: string;
}

export async function getTokioMarineConfig(organizationId: string): Promise<TokioMarineConfig> {
  const creds = await getInsurerCredentials(organizationId, 'tokio');
  if (!creds) throw new Error('Nenhuma credencial da Tokio Marine cadastrada — configure em Configurações > Seguradoras');
  if (!creds.ativa) throw new Error('Integração com a Tokio Marine está desativada em Configurações > Seguradoras');
  return { ...creds, baseUrl: BASE_URLS[creds.ambiente] };
}
