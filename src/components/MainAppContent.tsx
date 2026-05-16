
import React from 'react';
import { AgentConfig, UserProfile, Permissions, VisualIdentityConfig } from '../types';
import { AppShell } from './AppShell';
import { AppContentManager } from './AppContentManager';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { ScrollToTop } from './ScrollToTop';

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
  setVisualConfig,
}: MainAppContentProps) => {
  const { agentConfig, setAgentConfig } = useAgentConfig(user, userProfile, visualConfig);

  if (permsLoading || !isAuthReady) {
    return (
      <div className="h-screen bg-brand-dark flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />
      <AppShell
        user={user}
        userProfile={userProfile}
        permissions={permissions}
        visualConfig={visualConfig}
      >
        <AppContentManager
          permissions={permissions}
          visualConfig={visualConfig}
          setVisualConfig={setVisualConfig}
          agentConfig={agentConfig}
          setAgentConfig={setAgentConfig}
          userProfile={userProfile}
        />
      </AppShell>
    </>
  );
};
