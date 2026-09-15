import type { DadosEmpresa } from '../types';

export const CnpjService = {
  async lookup(cnpj: string): Promise<DadosEmpresa> {
    const digits = cnpj.replace(/\D/g, '');
    const res = await fetch(`/api/cnpj/${digits}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Falha ao buscar CNPJ (${res.status})`);
    }
    return res.json();
  },
};
