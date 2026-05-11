
import { useState, useEffect } from 'react';
import { AgentConfig, UserProfile, VisualIdentityConfig } from '../types';
import { DataService } from '../services/DataService';

export function useAgentConfig(user: any, userProfile: UserProfile | null, visualConfig: VisualIdentityConfig) {
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    name: `Assistente ${(visualConfig?.companyName || 'Empresa').split(' ')[0]}`,
    persona: 'Especialista em Seguros de Automóvel',
    instructions: '',
    isActive: false,
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    whatsappEnabled: false,
    extraction: {
      name: 'Analisador de Documentos',
      persona: 'Especialista em OCR e Extração de Dados',
      instructions: '',
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini'
    },
    followUps: [],
    scheduling: {
      timezone: 'America/Sao_Paulo',
      enabled: false
    }
  });

  useEffect(() => {
    if (!user) return;
    
    // Notify DataService about current user for internal permission checks
    DataService.setCurrentUser(userProfile || { uid: user.uid, role: 'atendente' } as any);

    const unsub = DataService.subscribe('config', 'agent', (data) => {
      if (data) {
        setAgentConfig(prev => {
          const next = { ...data, isActive: true };
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      }
    });

    return () => unsub();
  }, [user, userProfile, user?.uid, userProfile?.role, userProfile?.organizationId]);

  return { agentConfig, setAgentConfig };
}
