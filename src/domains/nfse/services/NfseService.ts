import {
  collection, addDoc, updateDoc, doc, getDocs,
  query, where, orderBy, limit, startAfter,
  DocumentSnapshot, getDoc, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { NfseDocument, NfseLog, NfseStatus } from '../../../types';
import type { NfseMonthlyStats } from '../types';

function nfseCol(organizationId: string) {
  return collection(db, 'organizations', organizationId, 'nfse');
}
function logsCol(organizationId: string) {
  return collection(db, 'organizations', organizationId, 'nfse_logs');
}

function toDoc(snap: DocumentSnapshot): NfseDocument | null {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    ...d,
    id: snap.id,
    createdAt:  d.createdAt instanceof Timestamp  ? d.createdAt.toDate().toISOString()  : (d.createdAt ?? ''),
    emittedAt:  d.emittedAt instanceof Timestamp  ? d.emittedAt.toDate().toISOString()  : d.emittedAt,
    canceledAt: d.canceledAt instanceof Timestamp ? d.canceledAt.toDate().toISOString() : d.canceledAt,
  } as NfseDocument;
}

export const NfseService = {
  async createDraft(
    organizationId: string,
    data: Omit<NfseDocument, 'id' | 'createdAt'>,
  ): Promise<string> {
    const ref = await addDoc(nfseCol(organizationId), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async update(organizationId: string, nfseId: string, data: Partial<NfseDocument>): Promise<void> {
    const ref = doc(nfseCol(organizationId), nfseId);
    await updateDoc(ref, { ...data });
  },

  async list(
    organizationId: string,
    opts: { status?: NfseStatus; pageSize?: number; lastDoc?: DocumentSnapshot } = {},
  ): Promise<{ docs: NfseDocument[]; lastDoc: DocumentSnapshot | null }> {
    const { status, pageSize = 20, lastDoc: lastSnap } = opts;

    const constraints = [
      ...(status ? [where('status', '==', status)] : []),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
      ...(lastSnap ? [startAfter(lastSnap)] : []),
    ];

    const snap = await getDocs(query(nfseCol(organizationId), ...constraints));
    const docs = snap.docs.map(s => toDoc(s)).filter(Boolean) as NfseDocument[];
    const lastDoc = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;

    return { docs, lastDoc };
  },

  async getById(organizationId: string, nfseId: string): Promise<NfseDocument | null> {
    const snap = await getDoc(doc(nfseCol(organizationId), nfseId));
    return toDoc(snap);
  },

  async getMonthlyStats(organizationId: string): Promise<NfseMonthlyStats> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    const snap = await getDocs(
      query(
        nfseCol(organizationId),
        where('status', '==', 'emitida'),
        where('createdAt', '>=', Timestamp.fromDate(firstDay)),
        orderBy('createdAt', 'desc'),
        limit(200),
      ),
    );

    let valorTotal = 0;
    let issTotal = 0;

    snap.docs.forEach(s => {
      const d = s.data();
      valorTotal += Number(d.valorServico) || 0;
      issTotal   += Number(d.valorISS)     || 0;
    });

    const total       = snap.docs.length;
    const ticketMedio = total > 0 ? valorTotal / total : 0;

    return { total, valorTotal, issTotal, ticketMedio };
  },

  async addLog(log: Omit<NfseLog, 'id' | 'createdAt'>): Promise<void> {
    await addDoc(logsCol(log.organizationId), {
      ...log,
      createdAt: serverTimestamp(),
    });
  },
};
