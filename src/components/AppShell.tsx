
import React, { Suspense, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useChatPreferences } from '../hooks/useAppContexts';
import { useViewport } from '../hooks/useAppContexts';
import { ShellProviders } from './ShellProviders';
import { MobileHeader } from './MobileHeader';
import { VisualIdentityConfig, Permissions, UserProfile } from '../types';
import { UserProfileModal } from './UserProfileModal';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

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
  const viewport = useViewport();
  const { preferences } = useChatPreferences();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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
          onProfileClick={() => setIsProfileOpen(true)}
        />

        {/* Sidebar — never unmounts, always present */}
        <Sidebar
          user={user}
          userProfile={userProfile}
          permissions={permissions}
          visualConfig={visualConfig}
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
          onProfileClick={() => setIsProfileOpen(true)}
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

        {/* Profile Unified Modal */}
        <AnimatePresence>
          {isProfileOpen && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProfileOpen(false)}
                className="absolute inset-0 bg-black/95 backdrop-blur-xl"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: viewport.isMobile ? 0 : 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: viewport.isMobile ? 0 : 20 }}
                className={cn(
                  "relative w-full h-full bg-[#050505] z-[2001] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col",
                  viewport.isMobile ? "rounded-0" : "max-w-[1400px] max-h-[95vh] rounded-[2.5rem] border border-white/10"
                )}
              >
                <UserProfileModal
                  mode="edit"
                  user={user}
                  profile={userProfile}
                  onClose={() => setIsProfileOpen(false)}
                  onUpdate={() => {
                    // handled by subscription
                  }}
                />
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ShellProviders>
  );
};
