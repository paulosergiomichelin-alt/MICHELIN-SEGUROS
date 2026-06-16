import {
  collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc,
  getDocs, onSnapshot, orderBy, query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DataService } from './DataService';
import { Apolice, ApoliceStatus, Cliente, ClienteHistoricoItem, ClienteStatus, Lead } from '../types';
import { generateId } from '../lib/utils';

function nowISO() {
  return new Date().toISOString();
}

function tsToISO(ts: any): string {
  if (!ts) return nowISO();
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return nowISO();
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

export class ClienteService {
  // ── Apolices subcollection ─────────────────────────────────────────────────

  private static apolicesRef(clienteId: string) {
    return collection(db, 'clientes', clienteId, 'apolices');
  }

  private static historicoRef(clienteId: string) {
    return collection(db, 'clientes', clienteId, 'historico');
  }

  static async createApolice(
    clienteId: string,
    data: Omit<Apolice, 'id' | 'createdAt' | 'updatedAt'>,
    organizationId?: string,
  ): Promise<string> {
    const ref = await addDoc(this.apolicesRef(clienteId), {
      ...data,
      clienteId,
      organizationId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Denormalize latest apolice info onto cliente document
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

    return ref.id;
  }

  static async updateApolice(
    clienteId: string,
    apoliceId: string,
    data: Partial<Apolice>,
  ): Promise<void> {
    const ref = doc(this.apolicesRef(clienteId), apoliceId);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });

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
    const ref = doc(this.apolicesRef(clienteId), apoliceId);
    await deleteDoc(ref);
  }

  static async listApolices(clienteId: string): Promise<Apolice[]> {
    const snap = await getDocs(
      query(this.apolicesRef(clienteId), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: tsToISO(d.data().createdAt),
      updatedAt: tsToISO(d.data().updatedAt),
    } as Apolice));
  }

  static subscribeApolices(
    clienteId: string,
    callback: (apolices: Apolice[]) => void,
  ): () => void {
    return onSnapshot(
      query(this.apolicesRef(clienteId), orderBy('createdAt', 'desc')),
      snap => {
        callback(snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: tsToISO(d.data().createdAt),
          updatedAt: tsToISO(d.data().updatedAt),
        } as Apolice)));
      },
    );
  }

  static subscribeAllApolices(
    organizationId: string,
    callback: (apolices: Apolice[]) => void,
  ): () => void {
    return onSnapshot(
      query(
        collectionGroup(db, 'apolices'),
        where('organizationId', '==', organizationId),
        where('status', 'in', ['ativo', 'em_renovacao']),
      ),
      snap => {
        callback(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            premioLiquido: (Number(data.premioLiquido) || 0) / 100,
            valorTotal: (Number(data.valorTotal) || 0) / 100,
            comissao: (Number(data.comissao) || 0) / 100,
            createdAt: tsToISO(data.createdAt),
            updatedAt: tsToISO(data.updatedAt),
          } as Apolice;
        }));
      },
    );
  }

  // ── Histórico subcollection ────────────────────────────────────────────────

  static async addHistorico(
    clienteId: string,
    item: Omit<ClienteHistoricoItem, 'id' | 'createdAt'> & { organizationId?: string },
  ): Promise<void> {
    await addDoc(this.historicoRef(clienteId), {
      ...item,
      createdAt: serverTimestamp(),
    });
  }

  static subscribeHistorico(
    clienteId: string,
    callback: (items: ClienteHistoricoItem[]) => void,
  ): () => void {
    return onSnapshot(
      query(this.historicoRef(clienteId), orderBy('createdAt', 'desc')),
      snap => {
        callback(snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: tsToISO(d.data().createdAt),
        } as ClienteHistoricoItem)));
      },
    );
  }

  // ── Conversão Lead → Cliente ───────────────────────────────────────────────

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
