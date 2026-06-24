import { useState, useCallback, useRef } from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';
import type { NfseDocument, NfseStatus } from '../../../types';
import { NfseService } from '../services/NfseService';

interface UseNfseState {
  docs: NfseDocument[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
}

export function useNfse(organizationId: string) {
  const [state, setState] = useState<UseNfseState>({
    docs: [],
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
  });

  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const statusRef  = useRef<NfseStatus | undefined>(undefined);
  const cacheRef   = useRef<Map<string, NfseDocument>>(new Map());

  const load = useCallback(async (status?: NfseStatus, reset = true) => {
    if (!organizationId) return;

    statusRef.current = status;
    if (reset) lastDocRef.current = null;

    setState(s => ({ ...s, loading: reset, loadingMore: !reset, error: null }));

    try {
      const { docs, lastDoc } = await NfseService.list(organizationId, {
        status,
        pageSize: 20,
        lastDoc: reset ? undefined : lastDocRef.current ?? undefined,
      });

      docs.forEach(d => cacheRef.current.set(d.id, d));
      lastDocRef.current = lastDoc;

      setState(s => ({
        ...s,
        docs: reset ? docs : [...s.docs, ...docs],
        loading: false,
        loadingMore: false,
        hasMore: lastDoc !== null,
      }));
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, loadingMore: false, error: e?.message ?? 'Erro ao carregar notas' }));
    }
  }, [organizationId]);

  const loadMore = useCallback(() => {
    if (state.loadingMore || !state.hasMore) return;
    load(statusRef.current, false);
  }, [load, state.loadingMore, state.hasMore]);

  const refresh = useCallback(() => load(statusRef.current, true), [load]);

  const filterByStatus = useCallback((status?: NfseStatus) => {
    load(status, true);
  }, [load]);

  const createDraft = useCallback(async (data: Omit<NfseDocument, 'id' | 'createdAt'>): Promise<string> => {
    const id = await NfseService.createDraft(organizationId, data);
    refresh();
    return id;
  }, [organizationId, refresh]);

  const updateStatus = useCallback(async (nfseId: string, status: NfseStatus, extra?: Partial<NfseDocument>) => {
    await NfseService.update(organizationId, nfseId, { status, ...extra });
    setState(s => ({
      ...s,
      docs: s.docs.map(d => d.id === nfseId ? { ...d, status, ...extra } : d),
    }));
  }, [organizationId]);

  return {
    ...state,
    load,
    loadMore,
    refresh,
    filterByStatus,
    createDraft,
    updateStatus,
  };
}
