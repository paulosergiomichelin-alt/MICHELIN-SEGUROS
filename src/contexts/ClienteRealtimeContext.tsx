import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Cliente, UserProfile } from '../types';
import { DataService } from '../services/DataService';
import { orderBy, limit } from 'firebase/firestore';

interface ClienteRealtimeContextType {
  clientes: Cliente[];
  loading: boolean;
  hasMore: boolean;
  loadMoreClientes: () => void;
}

const ClienteRealtimeContext = createContext<ClienteRealtimeContextType | undefined>(undefined);

const CLIENTES_PER_PAGE = 50;

export const ClienteRealtimeProvider: React.FC<{ children: React.ReactNode; userProfile: UserProfile | null }> = ({
  children,
  userProfile,
}) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const initialLoadDone = useRef(false);

  const userId = userProfile?.uid;
  const organizationId = userProfile?.organizationId;

  const memoizedParams = React.useMemo(() => ({
    userId,
    organizationId: organizationId || 'default',
  }), [userId, organizationId]);

  const lastParams = useRef<string>('');

  useEffect(() => {
    const currentKey = JSON.stringify(memoizedParams);
    if (!memoizedParams.userId) {
      setClientes([]);
      setLoading(false);
      initialLoadDone.current = false;
      return;
    }
    if (lastParams.current === currentKey && initialLoadDone.current) return;
    lastParams.current = currentKey;

    setLoading(true);

    const unsub = DataService.subscribeCollection(
      'clientes',
      [orderBy('updatedAt', 'desc'), limit(CLIENTES_PER_PAGE)],
      (data) => {
        setClientes(prev => {
          if (prev.length === data.length) {
            const isSame = data.every((c, i) => c.id === prev[i].id && c.updatedAt === prev[i].updatedAt);
            if (isSame) return prev;
          }
          const updatedIds = new Set(data.map(c => c.id));
          const combined = data.length < CLIENTES_PER_PAGE
            ? data
            : [...data, ...prev.filter(c => !updatedIds.has(c.id))];
          const seen = new Set<string>();
          return combined.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          }).sort((a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
          );
        });
        setLoading(false);
        initialLoadDone.current = true;
      },
    );

    return () => unsub();
  }, [memoizedParams]);

  const loadMoreClientes = async () => {
    if (!hasMore || loading || !clientes.length) return;
    setLoading(true);
    try {
      const result = await DataService.listPaginated(
        'clientes',
        [orderBy('updatedAt', 'desc')],
        CLIENTES_PER_PAGE,
        lastDoc,
      );
      if (result.data.length > 0) {
        setClientes(prev => {
          const existing = new Set(prev.map(c => c.id));
          return [...prev, ...result.data.filter(c => !existing.has(c.id))];
        });
        setLastDoc(result.lastVisible);
        setHasMore(result.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('[Clientes] loadMore failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClienteRealtimeContext.Provider value={{ clientes, loading, hasMore, loadMoreClientes }}>
      {children}
    </ClienteRealtimeContext.Provider>
  );
};

export const useClientes = () => {
  const ctx = useContext(ClienteRealtimeContext);
  if (!ctx) throw new Error('useClientes must be used within ClienteRealtimeProvider');
  return ctx;
};
