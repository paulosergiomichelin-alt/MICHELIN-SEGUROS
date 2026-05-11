import { useMemo } from 'react';
import { UserProfile } from '../types';

export function useUserMetrics(user: UserProfile | null) {
  return useMemo(() => {
    if (!user) return null;

    const metrics = user.metrics || {
      totalLeads: 0,
      totalVendas: 0,
      conversionRate: 0,
      performanceLevel: 'LOW'
    };

    const lastAccess = user.activity?.lastAccess;
    let status: 'ONLINE' | 'AWAY' | 'OFFLINE' = 'OFFLINE';

    if (lastAccess) {
      try {
        const date = lastAccess.toDate ? lastAccess.toDate() : new Date(lastAccess);
        const diffMinutes = (new Date().getTime() - date.getTime()) / (1000 * 60);
        
        if (diffMinutes < 5) status = 'ONLINE';
        else if (diffMinutes < 30) status = 'AWAY';
        else status = 'OFFLINE';
      } catch (e) {
        status = 'OFFLINE';
      }
    }

    return {
      ...metrics,
      status
    };
  }, [user]);
}
