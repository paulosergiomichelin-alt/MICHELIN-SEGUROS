import React, { createContext, useContext, useState, useEffect } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { WhatsAppSession, WhatsAppConversation, UserProfile } from '../types';
import { DataService } from '../services/DataService';

interface WhatsAppContextType {
  sessions: WhatsAppSession[];
  activeSessions: WhatsAppSession[];
  loading: boolean;
  selectedSessionName: string | null;
  setSelectedSessionName: (name: string | null) => void;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined);

export const WhatsAppProvider: React.FC<{ children: React.ReactNode; userProfile: UserProfile | null }> = ({
  children,
  userProfile,
}) => {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionName, setSelectedSessionName] = useState<string | null>(null);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'gestor';
  const userId = userProfile?.uid;
  const orgId = userProfile?.organizationId;

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }

    const constraints = [orderBy('updatedAt', 'desc'), limit(50)];

    const unsub = DataService.subscribeCollection(
      'whatsapp_sessions',
      constraints,
      (data: any[]) => {
        const mapped = data as WhatsAppSession[];
        // Non-admins only see their own sessions
        const filtered = isAdmin ? mapped : mapped.filter(s => s.userId === userId);
        setSessions(filtered);
        setLoading(false);

        // Auto-select first open session if none selected
        if (!selectedSessionName) {
          const open = filtered.find(s => s.status === 'open');
          if (open) setSelectedSessionName(open.sessionName);
        }
      },
      false,
      () => setLoading(false),
    );

    return unsub;
  }, [orgId, userId, isAdmin]);

  const activeSessions = sessions.filter(s => s.status === 'open');

  return (
    <WhatsAppContext.Provider value={{ sessions, activeSessions, loading, selectedSessionName, setSelectedSessionName }}>
      {children}
    </WhatsAppContext.Provider>
  );
};

export const useWhatsApp = () => {
  const ctx = useContext(WhatsAppContext);
  if (!ctx) throw new Error('useWhatsApp must be used inside WhatsAppProvider');
  return ctx;
};
