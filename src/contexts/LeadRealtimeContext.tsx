
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Lead, UserProfile } from '../types';
import { DataService } from '../services/DataService';
import { orderBy, limit } from 'firebase/firestore';

interface LeadRealtimeContextType {
  leads: Lead[];
  loading: boolean;
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
  selectedLead: Lead | null;
  hasMore: boolean;
  loadMoreLeads: () => void;
}

const LeadRealtimeContext = createContext<LeadRealtimeContextType | undefined>(undefined);

const LEADS_PER_PAGE = 50;

export const LeadRealtimeProvider: React.FC<{ children: React.ReactNode, userProfile: UserProfile | null }> = ({ children, userProfile }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const initialLoadDone = useRef(false);

  // Realtime sync for ACTIVE/RECENT leads (First Page)
  const userId = userProfile?.uid;
  const canReadAll = userProfile?.permissions?.canReadAllLeads;
  const userRole = userProfile?.role;
  const organizationId = userProfile?.organizationId;

  const canReadAllBool = !!canReadAll;

  // Memoize primitives to prevent unnecessary effect re-runs
  const memoizedContextParams = React.useMemo(() => ({
    userId,
    canReadAll: canReadAllBool,
    userRole: userRole || 'none',
    organizationId: organizationId || 'default'
  }), [userId, canReadAllBool, userRole, organizationId]);

  const lastSubParams = useRef<string>('');

  useEffect(() => {
    const { userId, canReadAll, userRole, organizationId } = memoizedContextParams;
    const currentParamsKey = JSON.stringify(memoizedContextParams);

    if (!userId) {
      Promise.resolve().then(() => {
        setLeads(prev => prev.length > 0 ? [] : prev);
        setLoading(prev => prev ? false : prev);
      });
      initialLoadDone.current = false;
      return;
    }

    // Skip re-init if params are effectively the same to prevent flapping
    if (lastSubParams.current === currentParamsKey && initialLoadDone.current) {
      return;
    }
    
    lastSubParams.current = currentParamsKey;
    console.log(`[LEADS_SUBSCRIPTION_INIT] User: ${userId}, Org: ${organizationId}, Role: ${userRole}`);
    Promise.resolve().then(() => setLoading(true));

    const unsub = DataService.subscribeCollection(
      'leads',
      [orderBy('updatedAt', 'desc'), limit(LEADS_PER_PAGE)],
      (data) => {
        setLeads(prev => {
          // Robust comparison: Only update state if IDs or updatedAt values changed
          if (prev.length === data.length) {
            const isSame = data.every((lead, index) => 
              lead.id === prev[index].id && lead.updatedAt === prev[index].updatedAt
            );
            if (isSame) return prev;
          }

          // Merge realtime updates with existing leads
          const updatedIds = new Set(data.map(l => l.id));
          const filteredPrev = prev.filter(l => !updatedIds.has(l.id));
          const combined = [...data, ...filteredPrev];
          
          // Deduplication
          const seen = new Set();
          const unique = combined.filter(l => {
            if (seen.has(l.id)) return false;
            seen.add(l.id);
            return true;
          });

          return unique.sort((a, b) => 
            new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
          );
        });
        setLoading(false);
        initialLoadDone.current = true;
      }
    );

    return () => {
      // DataService.subscribeCollection uses SubscriptionRegistry, 
      // which has a 500ms grace period. We don't log cleanup here 
      // to avoid spam if it's just a fast remount.
      unsub();
    };
  }, [memoizedContextParams]);

  const selectedLead = leads.find(l => l.id === selectedLeadId) || null;

  const loadMoreLeads = async () => {
    if (!hasMore || loading || !leads.length) return;
    
    setLoading(true);
    try {
      const lastVisible = leads[leads.length - 1]; // We use the last item in the list as cursor base
      // Optimization: In a real cursor we'd need the QueryDocumentSnapshot, 
      // but DataService listPaginated handles it. 
      // For now, we fetch the next batch.
      const result = await DataService.listPaginated(
        'leads',
        [orderBy('updatedAt', 'desc')],
        LEADS_PER_PAGE,
        lastDoc
      );

      if (result.data.length > 0) {
        setLeads(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const newLeads = result.data.filter(l => !existingIds.has(l.id));
          return [...prev, ...newLeads];
        });
        setLastDoc(result.lastVisible);
        setHasMore(result.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('Failed to load more leads:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LeadRealtimeContext.Provider value={{
      leads,
      loading,
      selectedLeadId,
      setSelectedLeadId,
      selectedLead,
      hasMore,
      loadMoreLeads
    }}>
      {children}
    </LeadRealtimeContext.Provider>
  );
};

export const useLeads = () => {
  const context = useContext(LeadRealtimeContext);
  if (context === undefined) {
    throw new Error('useLeads must be used within a LeadRealtimeProvider');
  }
  return context;
};
