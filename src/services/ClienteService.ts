import { DataService } from './DataService';
import { authHeader } from '../lib/dataApiClient';
import { Apolice, Cliente, ClienteHistoricoItem, ClienteStatus, Lead } from '../types';

function nowISO() {
  return new Date().toISOString();
}

function computeClienteStatus(dataRenovacao?: string): ClienteStatus {
  if (!dataRenovacao) return 'ativo';
  const renov = new Date(dataRenovacao);
  const now = new Date();
  const diffDays = Math.ceil((renov.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'renovacao_vencida';
  if (diffDays <= 30) return 'renovacao_proxima';
  return 'ativo';
}

// Os valores monetários de Apolice (premioLiquido/valorTotal/comissao) já circulam em
// CENTAVOS no domínio da app (ver ApoliceForm.tsx: * 100 ao salvar, / 100 ao popular o
// form) — a coluna Postgres é só um rename (premioLiquidoCentavos), não uma conversão.
function apoliceToRow(data: Partial<Apolice>): Record<string, any> {
  const { premioLiquido, valorTotal, comissao, ...rest } = data as any;
  const row: Record<string, any> = { ...rest };
  if (premioLiquido !== undefined) row.premioLiquidoCentavos = premioLiquido;
  if (valorTotal !== undefined) row.valorTotalCentavos = valorTotal;
  if (comissao !== undefined) row.comissaoCentavos = comissao;
  return row;
}

// `divideBy100`: false preserva o contrato atual de listApolices/subscribeApolices (cents,
// consumido por ApoliceForm); true reproduz subscribeAllApolices/Report (reais, consumido
// por RenovacoesPage/RelatoriosPage/ContactSidePanel/ClienteDetailPage via fmtMoney).
function rowToApolice(row: any, divideBy100: boolean): Apolice {
  const { premioLiquidoCentavos, valorTotalCentavos, comissaoCentavos, ...rest } = row;
  const div = divideBy100 ? 100 : 1;
  return {
    ...rest,
    premioLiquido: (Number(premioLiquidoCentavos) || 0) / div,
    valorTotal: (Number(valorTotalCentavos) || 0) / div,
    comissao: (Number(comissaoCentavos) || 0) / div,
  } as Apolice;
}

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { ...(await authHeader()), ...(init?.headers ?? {}) } });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`${path} respondeu ${res.status}: ${await res.text()}`);
  return res.json();
}

export class ClienteService {
  // ── Apólices ─────────────────────────────────────────────────────────────

  static async createApolice(
    clienteId: string,
    data: Omit<Apolice, 'id' | 'createdAt' | 'updatedAt'>,
    organizationId?: string,
  ): Promise<string> {
    const row = await fetchJson(`/api/data/clientes/${clienteId}/apolices`, {
      method: 'POST',
      body: JSON.stringify({ ...apoliceToRow(data), clienteId, organizationId }),
    });

    // Denormalize latest apolice info onto cliente
    const newStatus = computeClienteStatus(data.dataRenovacao);
    await DataService.update('cliente', clienteId, {
      seguradoraAtualId: data.seguradoraId,
      produtoAtual: data.produto,
      dataRenovacao: data.dataRenovacao,
      status: newStatus,
      updatedAt: nowISO(),
    });

    await this.addHistorico(clienteId, {
      clienteId,
      tipo: 'apolice_criada',
      descricao: `Apólice ${data.numeroApolice || ''} criada — ${data.produto}`,
      organizationId,
    });

    return row.id;
  }

  static async updateApolice(
    clienteId: string,
    apoliceId: string,
    data: Partial<Apolice>,
  ): Promise<void> {
    await fetchJson(`/api/data/clientes/${clienteId}/apolices/${apoliceId}`, {
      method: 'PATCH',
      body: JSON.stringify(apoliceToRow(data)),
    });

    if (data.dataRenovacao || data.seguradoraId || data.produto) {
      const allApolices = await this.listApolices(clienteId);
      const ativa = allApolices.find(a => a.status === 'ativo') ?? allApolices[0];
      if (ativa) {
        const newStatus = computeClienteStatus(ativa.dataRenovacao);
        await DataService.update('cliente', clienteId, {
          seguradoraAtualId: ativa.seguradoraId,
          produtoAtual: ativa.produto,
          dataRenovacao: ativa.dataRenovacao,
          status: newStatus,
          updatedAt: nowISO(),
        });
      }
    }
  }

  static async deleteApolice(clienteId: string, apoliceId: string): Promise<void> {
    await fetchJson(`/api/data/clientes/${clienteId}/apolices/${apoliceId}`, { method: 'DELETE' });
  }

  static async listApolices(clienteId: string): Promise<Apolice[]> {
    const rows = await fetchJson(`/api/data/clientes/${clienteId}/apolices`);
    return (rows ?? []).map((r: any) => rowToApolice(r, false));
  }

  // Sem onSnapshot nativo para uma subcoleção só — usa o polling de segurança do
  // DataService.subscribe/subscribeCollection não se aplica aqui (não é uma entidade
  // genérica do ENTITY_TABLE); reimplementado como polling simples de 15s, suficiente
  // para uma lista de apólices de um cliente (baixa frequência de mudança).
  static subscribeApolices(
    clienteId: string,
    callback: (apolices: Apolice[]) => void,
  ): () => void {
    let cancelled = false;
    const refetch = () => this.listApolices(clienteId).then(a => !cancelled && callback(a)).catch(() => {});
    refetch();
    const poll = setInterval(refetch, 15000);
    return () => { cancelled = true; clearInterval(poll); };
  }

  static subscribeAllApolices(
    organizationId: string,
    callback: (apolices: Apolice[]) => void,
  ): () => void {
    let cancelled = false;
    const refetch = () => fetchJson(`/api/data/apolices?status=ativo,em_renovacao`)
      .then((rows) => !cancelled && callback((rows ?? []).map((r: any) => rowToApolice(r, true))))
      .catch(() => {});
    refetch();
    const poll = setInterval(refetch, 30000);
    return () => { cancelled = true; clearInterval(poll); };
  }

  static subscribeAllApolicesReport(
    organizationId: string,
    callback: (apolices: Apolice[]) => void,
  ): () => void {
    let cancelled = false;
    const refetch = () => fetchJson(`/api/data/apolices`)
      .then((rows) => !cancelled && callback((rows ?? []).map((r: any) => rowToApolice(r, true))))
      .catch(() => {});
    refetch();
    const poll = setInterval(refetch, 30000);
    return () => { cancelled = true; clearInterval(poll); };
  }

  // ── Histórico ────────────────────────────────────────────────────────────

  static async addHistorico(
    clienteId: string,
    item: Omit<ClienteHistoricoItem, 'id' | 'createdAt'> & { organizationId?: string },
  ): Promise<void> {
    await fetchJson(`/api/data/clientes/${clienteId}/historico`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  static subscribeHistorico(
    clienteId: string,
    callback: (items: ClienteHistoricoItem[]) => void,
  ): () => void {
    let cancelled = false;
    const refetch = () => fetchJson(`/api/data/clientes/${clienteId}/historico`)
      .then((rows) => !cancelled && callback(rows ?? []))
      .catch(() => {});
    refetch();
    const poll = setInterval(refetch, 15000);
    return () => { cancelled = true; clearInterval(poll); };
  }

  // ── Conversão Lead → Cliente ─────────────────────────────────────────────

  static async convertLeadToCliente(
    lead: Lead,
    responsavelId?: string,
    organizationId?: string,
  ): Promise<string> {
    const clienteData: Omit<Cliente, 'id'> = {
      nome: lead.name,
      cpf: lead.cpf,
      rg: lead.rg,
      dataNascimento: lead.birthDate,
      estadoCivil: lead.civilStatus,
      telefone: lead.phone,
      whatsapp: lead.phone2 || lead.phone,
      email: lead.email,
      cep: lead.zipCodeOvernight || lead.zipCodeResidence,
      rua: lead.addressOvernight || lead.addressResidence,
      numero: lead.numberOvernight || lead.numberResidence,
      bairro: lead.bairroPernoite,
      cidade: lead.city || lead.cidadePernoite,
      estado: lead.estadoPernoite,
      responsavelId: responsavelId || lead.vendedorId,
      observacoes: undefined,
      leadOrigemId: lead.id,
      status: 'ativo',
      organizationId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    const clienteId = await DataService.create('cliente', clienteData);

    // Link lead back to cliente
    await DataService.update('lead', lead.id, {
      clienteId,
      status: 'Fechado',
      updatedAt: nowISO(),
    });

    await this.addHistorico(clienteId, {
      clienteId,
      tipo: 'convertido',
      descricao: `Convertido a partir do Lead "${lead.name}"`,
      organizationId,
    });

    return clienteId;
  }
}
