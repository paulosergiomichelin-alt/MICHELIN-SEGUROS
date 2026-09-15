const BRASIL_API_BASE = 'https://brasilapi.com.br/api/cnpj/v1';

interface BrasilApiCnpjResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  descricao_porte?: string;
  cnae_fiscal_descricao?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const digits = String(req.params?.cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) {
    return res.status(400).json({ error: 'CNPJ precisa ter 14 dígitos' });
  }

  try {
    const apiRes = await fetch(`${BRASIL_API_BASE}/${digits}`);

    if (!apiRes.ok) {
      if (apiRes.status === 404) {
        return res.status(404).json({ error: 'CNPJ não encontrado' });
      }
      const detail = await apiRes.text();
      console.error('[cnpj/lookup] BrasilAPI error:', apiRes.status, detail);
      return res.status(502).json({ error: 'Falha ao consultar a BrasilAPI', detail });
    }

    const data = await apiRes.json() as BrasilApiCnpjResponse;

    return res.status(200).json({
      cnpj: data.cnpj,
      razaoSocial: data.razao_social,
      nomeFantasia: data.nome_fantasia ?? null,
      situacaoCadastral: data.descricao_situacao_cadastral ?? null,
      porte: data.descricao_porte ?? null,
      cnae: data.cnae_fiscal_descricao ?? null,
      cep: data.cep ?? null,
      rua: data.logradouro ?? null,
      numero: data.numero ?? null,
      complemento: data.complemento ?? null,
      bairro: data.bairro ?? null,
      cidade: data.municipio ?? null,
      estado: data.uf ?? null,
    });
  } catch (err: any) {
    console.error('[cnpj/lookup] error:', err);
    return res.status(502).json({ error: 'Erro ao consultar CNPJ', detail: err?.message });
  }
}
