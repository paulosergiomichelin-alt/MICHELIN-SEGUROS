import { DataService } from '../../../services/DataService';
import { where, orderBy, limit, startAfter } from '../../../lib/queryConstraints';
import type { NfseDocument, NfseLog, NfseStatus } from '../../../types';
import type { NfseMonthlyStats } from '../types';

export const NfseService = {
  async createDraft(
    organizationId: string,
    data: Omit<NfseDocument, 'id' | 'createdAt'>,
  ): Promise<string> {
    return DataService.create('nfse_documents', { ...data, organizationId });
  },

  async update(organizationId: string, nfseId: string, data: Partial<NfseDocument>): Promise<void> {
    await DataService.update('nfse_documents', nfseId, data);
  },

  async list(
    organizationId: string,
    opts: { status?: NfseStatus; pageSize?: number; lastDoc?: unknown } = {},
  ): Promise<{ docs: NfseDocument[]; lastDoc: unknown | null }> {
    const { status, pageSize = 20, lastDoc: cursor } = opts;

    const constraints = [
      where('organizationId', '==', organizationId),
      ...(status ? [where('status', '==', status)] : []),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
      ...(cursor !== undefined && cursor !== null ? [startAfter(cursor)] : []),
    ];

    const docs = await DataService.list('nfse_documents', constraints) as NfseDocument[];
    // Cursor opaco: valor bruto do campo createdAt do último item (mesmo padrão de
    // DataService.listPaginated — nunca introspectado pelos call-sites, só round-tripped).
    const lastDoc = docs.length === pageSize ? (docs[docs.length - 1] as any).createdAt : null;

    return { docs, lastDoc };
  },

  async getById(organizationId: string, nfseId: string): Promise<NfseDocument | null> {
    return DataService.get('nfse_documents', nfseId);
  },

  async getMonthlyStats(organizationId: string): Promise<NfseMonthlyStats> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const docs = await DataService.list('nfse_documents', [
      where('organizationId', '==', organizationId),
      where('status', '==', 'emitida'),
      where('createdAt', '>=', firstDay.toISOString()),
      orderBy('createdAt', 'desc'),
      limit(200),
    ]) as any[];

    let valorTotal = 0;
    let issTotal = 0;

    docs.forEach((d) => {
      valorTotal += Number(d.valorServico) || 0;
      issTotal   += Number(d.valorIss)     || 0;
    });

    const total       = docs.length;
    const ticketMedio = total > 0 ? valorTotal / total : 0;

    return { total, valorTotal, issTotal, ticketMedio };
  },

  async addLog(log: Omit<NfseLog, 'id' | 'createdAt'>): Promise<void> {
    await DataService.create('nfse_logs', log);
  },
};
