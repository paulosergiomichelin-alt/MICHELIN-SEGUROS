
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Message, Lead } from '../types';
import { DataService } from '../services/DataService';
import { orderBy, where, limit } from 'firebase/firestore';
import { OrchestratorService } from '../services/OrchestratorService';
import { useLeads } from './LeadRealtimeContext';

interface ChatContextType {
  messages: Message[];
  loading: boolean;
  sendMessage: (text: string, lead: Lead) => Promise<void>;
  isAILoading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedLeadId, selectedLead } = useLeads();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);

  useEffect(() => {
    if (!selectedLeadId) {
      setTimeout(() => setMessages(prev => prev.length > 0 ? [] : prev), 0);
      return;
    }

    setTimeout(() => setLoading(true), 0);
    // DataService applies visibility for messages via leadOwnerId
    const unsub = DataService.subscribeCollection(
      'messages',
      [where('leadId', '==', selectedLeadId), orderBy('timestamp', 'asc')],
      (data) => {
        setMessages(data);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [selectedLeadId]);

  const sendMessage = async (text: string, lead: Lead) => {
    if (!text.trim()) return;
    
    try {
      // Orchestrator handles AI response logic and message creation
      setIsAILoading(true);
      await OrchestratorService.processMessage(lead, text);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsAILoading(false);
    }
  };

  return (
    <ChatContext.Provider value={{
      messages,
      loading,
      sendMessage,
      isAILoading
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
