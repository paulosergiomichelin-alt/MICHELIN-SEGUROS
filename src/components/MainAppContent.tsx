
import React, { useState, useEffect } from 'react';
import { AgentConfig, UserProfile, Permissions, VisualIdentityConfig } from '../types';
import { DataService } from '../services/DataService';
import { AppShell } from './AppShell';
import { AppContentManager } from './AppContentManager';
import { ChatPreferencesProvider } from '../contexts/ChatPreferencesContext';
import { useAgentConfig } from '../hooks/useAgentConfig';

interface MainAppContentProps {
  user: any;
  userProfile: UserProfile | null;
  isAuthReady: boolean;
  permissions: Permissions;
  permsLoading: boolean;
  visualConfig: VisualIdentityConfig;
  setVisualConfig: (c: VisualIdentityConfig) => void;
}

export const MainAppContent = ({ 
  user, 
  userProfile, 
  isAuthReady, 
  permissions, 
  permsLoading, 
  visualConfig,
  setVisualConfig
}: MainAppContentProps) => {
  const [activeTab, setActiveTab] = useState<any>('pipeline');
  const { agentConfig, setAgentConfig } = useAgentConfig(user, userProfile, visualConfig);

  if (permsLoading || !isAuthReady) {
    return (
      <div className="h-screen bg-brand-dark flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      userProfile={userProfile}
      permissions={permissions}
      visualConfig={visualConfig}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      <AppContentManager
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        permissions={permissions}
        visualConfig={visualConfig}
        setVisualConfig={setVisualConfig}
        agentConfig={agentConfig}
        setAgentConfig={setAgentConfig}
        userProfile={userProfile}
      />
    </AppShell>
  );
};
