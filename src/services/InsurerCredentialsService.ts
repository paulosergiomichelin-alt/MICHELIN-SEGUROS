import { authHeader } from '../lib/dataApiClient';

export interface TokioMarineCredentialsForm {
  ativa: boolean;
  ambiente: 'aceite-w' | 'aceite-y' | 'producao';
  codigoCorretor: string;
  codigoUsuario: string;
  codigoOperadora: string; // vazio = "não alterar"
  cpfEmissor: string;
}

export interface InsurerCredentialsSafe {
  ativa: boolean;
  ambiente: string;
  codigoCorretor: string;
  codigoUsuario: string;
  cpfEmissor: string;
  temCredencial: boolean;
}

async function handle(res: Response) {
  if (!res.ok) throw new Error(`API /api/insurers respondeu ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export const InsurerCredentialsService = {
  async get(): Promise<Record<string, InsurerCredentialsSafe>> {
    const res = await fetch('/api/insurers/credenciais', { headers: await authHeader() });
    return handle(res);
  },
  async save(providerId: string, data: TokioMarineCredentialsForm): Promise<void> {
    const res = await fetch(`/api/insurers/credenciais/${providerId}`, {
      method: 'PUT', headers: await authHeader(), body: JSON.stringify(data),
    });
    await handle(res);
  },
  async validar(providerId: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/insurers/credenciais/${providerId}/validar`, {
      method: 'POST', headers: await authHeader(),
    });
    return handle(res);
  },
};
