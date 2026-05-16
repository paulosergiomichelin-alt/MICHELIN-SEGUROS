
import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useChatPreferences } from '../hooks/useAppContexts';
import { useViewport } from '../hooks/useAppContexts';
import { ShellProviders } from './ShellProviders';
import { MobileHeader } from './MobileHeader';
import { VisualIdentityConfig, Permissions, UserProfile } from '../types';

interface AppShellProps {
  user: any;
  userProfile: UserProfile | null;
  permissions: Permissions;
  visualConfig: VisualIdentityConfig;
  children: React.ReactNode;
}

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-brand-dark/50">
    <div className="w-6 h-6 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin"></div>
  </div>
);

export const AppShell: React.FC<AppShellProps> = ({
  user,
  userProfile,
  permissions,
  visualConfig,
  children
}) => {
  const navigate = useNavigate();
  const viewport = useViewport();
  const { preferences } = useChatPreferences();

  const [isSidebarOpen, setIsSidebarOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('michelin_sidebar_open');
      if (saved !== null) return saved === 'true';

      // Default behavior: closed on mobile, open on desktop
      return window.innerWidth >= 768;
    }
    return true;
  });

  const toggleSidebar = (open: boolean) => {
    setIsSidebarOpen(open);
    localStorage.setItem('michelin_sidebar_open', String(open));
  };

  return (
    <ShellProviders user={user} userProfile={userProfile}>
      <div className="flex flex-col md:flex-row h-screen h-[100dvh] overflow-hidden bg-brand-dark text-white font-sans selection:bg-gold-deep/30">
        <MobileHeader
          user={user}
          userProfile={userProfile}
          visualConfig={visualConfig}
          onMenuClick={() => toggleSidebar(true)}
          onProfileClick={() => navigate('/users/' + (userProfile?.uid ?? ''))}
        />

        {/* Sidebar — never unmounts, always present */}
        <Sidebar
          user={user}
          userProfile={userProfile}
          permissions={permissions}
          visualConfig={visualConfig}
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
          onProfileClick={() => navigate('/users/' + (userProfile?.uid ?? ''))}
        />

        <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
          {/* Overlay for mobile sidebar */}
          {isSidebarOpen && viewport.isMobile && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] md:hidden transition-all duration-300 animate-in fade-in"
              onClick={() => toggleSidebar(false)}
            />
          )}

          <Suspense fallback={<LoadingFallback />}>
            {children}
          </Suspense>
        </main>

      </div>
    </ShellProviders>
  );
};
