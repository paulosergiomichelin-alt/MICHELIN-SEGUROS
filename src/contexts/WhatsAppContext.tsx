import React, { createContext, useContext, useState, useEffect } from 'react';
import { limit } from 'firebase/firestore';
import { WhatsAppSession, UserProfile } from '../types';
import { DataService } from '../services/DataService';

interface WhatsAppContextType {
  sessions: WhatsAppSession[];
  activeSessions: WhatsAppSession[];
  loading: boolean;
  selectedSessionName: string | null;
  setSelectedSessionName: (name: string | null) => void;
  totalUnreadWA: number;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined);

export const WhatsAppProvider: React.FC<{ children: React.ReactNode; userProfile: UserProfile | null }> = ({
  children,
  userProfile,
}) => {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionName, setSelectedSessionName] = useState<string | null>(null);
  const [totalUnreadWA, setTotalUnreadWA] = useState(0);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'gestor';
  const userId = userProfile?.uid;
  const orgId = userProfile?.organizationId;

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }

    // No orderBy — avoids composite index requirement on whatsapp_sessions(organizationId, updatedAt).
    // Sorted client-side after filtering.
    const constraints = [limit(50)];

    const unsub = DataService.subscribeCollection(
      'whatsapp_sessions',
      constraints,
      (data: any[]) => {
        const mapped = data as WhatsAppSession[];
        // Non-admins only see their own sessions
        const filtered = isAdmin ? mapped : mapped.filter(s => s.userId === userId);
        // Sort by updatedAt desc client-side
        filtered.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
        const dbg = filtered.map(s => `id=${s.id} status=${s.status} hasQr=${!!s.qrBase64} qrLen=${s.qrBase64?.length ?? 0}`).join(' | ');
        console.log('[WHATSAPP_CTX] sessions snapshot:', dbg || '(vazio)');
        setSessions(filtered);
        setLoading(false);

        // Auto-select first open session if none selected; fallback to Meta
        if (!selectedSessionName) {
          const open = filtered.find(s => s.status === 'open');
          setSelectedSessionName(open ? open.sessionName : 'meta');
        }
      },
      false,
      () => setLoading(false),
    );

    return unsub;
  }, [orgId, userId, isAdmin]);

  const activeSessions = sessions.filter(s => s.status === 'open');

  // ── Contagem de conversas não lidas (cache-only, não cria listener realtime) ─
  useEffect(() => {
    if (!orgId || sessions.length === 0) { setTotalUnreadWA(0); return; }
    const sessionNames = new Set(sessions.map(s => s.sessionName).filter(Boolean));

    // forceRealtime=false: usa cache se disponível — evita carregar centenas de
    // documentos em tempo real só para exibir um badge numérico.
    const unsub = DataService.subscribeCollection(
      'whatsapp_conversations',
      [limit(100)],
      (data: any[]) => {
        const total = data
          .filter(c => sessionNames.has(c.sessionName))
          .reduce((sum, c) => sum + Math.max(0, c.unreadCount ?? 0), 0);
        setTotalUnreadWA(total);
      },
      false,
      () => setTotalUnreadWA(0),
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sessions.map(s => s.sessionName).join(',')]);

  return (
    <WhatsAppContext.Provider value={{ sessions, activeSessions, loading, selectedSessionName, setSelectedSessionName, totalUnreadWA }}>
      {children}
    </WhatsAppContext.Provider>
  );
};

export const useWhatsApp = () => {
  const ctx = useContext(WhatsAppContext);
  if (!ctx) throw new Error('useWhatsApp must be used inside WhatsAppProvider');
  return ctx;
};
