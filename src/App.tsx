import React, { useState, useEffect } from 'react';
import { auth, onAuthStateChanged, signOut } from './lib/firebase';
import { Auth } from './components/Auth';
import { CompanyRegistration } from './domains/onboarding/CompanyRegistration';
import { MainAppContent } from './components/MainAppContent';
import { PermissionsProvider, usePermissions } from './contexts/PermissionsContext';
import { VisualIdentityConfig } from './types';
import { ChatPreferencesProvider } from './contexts/ChatPreferencesContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LayoutProvider } from './contexts/LayoutContext';
import { ShieldAlert } from 'lucide-react';

import { logger } from './services/LoggerService';
import { agentService } from './services/agentService';
import { DataService } from './services/DataService';
import { templateService } from './services/TemplateService';
import { SetupWizard } from './domains/onboarding/SetupWizard';
import { DeviceInfoService } from './services/DeviceInfoService';
import { initDatadogRUM, setRUMUser, clearRUMUser } from './services/DatadogRUM';
import { initDatadogLogs, ddLogInfo, ddLogError } from './services/DatadogLogs';

// Initialise Datadog as early as possible (before first render)
initDatadogRUM();
initDatadogLogs();

// Prefetch device/IP info once at app start so audit logs always carry it
DeviceInfoService.getInfo().then(info => DataService.setDeviceInfo(info));

export default function App() {
  return (
    <PermissionsProvider>
      <AppInternal />
    </PermissionsProvider>
  );
}

function AppInternal() {
  const { permissions, userProfile, loading: permsLoading, error: permsError } = usePermissions();
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [agentApiKey, setAgentApiKey] = useState<string | undefined>(undefined);
  const [visualConfig, setVisualConfig] = useState<VisualIdentityConfig>({
    companyName: '',
    logoDark: 'https://cdn-icons-png.flaticon.com/512/3755/3755250.png',
    logoLight: '',
    primaryColor: '#CFA764',
  });

  // Global Error Tracking
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logger.error('GLOBAL_ERROR', event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack
      });
      ddLogError('GLOBAL_ERROR', event.error, { filename: event.filename, lineno: event.lineno });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      logger.error('UNHANDLED_REJECTION', event.reason?.message || 'Promise failed', {
        reason: event.reason?.stack || event.reason
      });
      ddLogError('UNHANDLED_REJECTION', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Sync RUM + DataService when profile data changes (name, role, etc.)
  useEffect(() => {
    if (userProfile) {
      console.log("USER_ROLE_IN_APP", userProfile.role);
      setRUMUser(userProfile.uid ?? '', userProfile.name ?? '', userProfile.email ?? '');
      ddLogInfo('USER_AUTHENTICATED', { user_id: userProfile.uid, role: userProfile.role, org: userProfile.organizationId });
    } else {
      clearRUMUser();
    }
    DataService.setCurrentUser(userProfile);
  }, [userProfile]);

  // Activity tracking — depends only on uid so event listeners are not re-registered
  // every time a volatile field like activity.lastAccess changes in Firestore.
  useEffect(() => {
    if (!userProfile?.uid) return;
    const uid = userProfile.uid;
    const handleActivity = () => DataService.updateUserActivity(uid);

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    DataService.updateUserActivity(uid);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.uid]);

  useEffect(() => {
    // 1. Listen to Visual Identity changes
    const unsubVisual = DataService.subscribe('settings', 'visual_identity', (data) => {
      if (data) {
        console.log('[APP] Identidade Visual carregada/atualizada:', data);
        setVisualConfig(prev => ({ ...prev, ...data }));
      }
    }, true);

    // 2. Auth State Listener
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });

    return () => {
      unsubVisual();
      unsubscribeAuth();
    };
  }, []);

  // Check onboarding completion whenever the org changes — must be before any conditional returns
  useEffect(() => {
    if (!userProfile?.organizationId) return;
    templateService.isOnboardingComplete(userProfile.organizationId)
      .then(complete => setNeedsOnboarding(!complete))
      .catch(() => setNeedsOnboarding(false));

    DataService.get('config', 'agent_config').then((cfg: any) => {
      if (cfg?.openrouterApiKey) setAgentApiKey(cfg.openrouterApiKey);
    }).catch(() => {});
  }, [userProfile?.organizationId]);

  if (!isAuthReady || permsLoading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <div className="w-3 h-3 bg-gold-deep rounded-full animate-bounce"></div>
            <div className="w-3 h-3 bg-gold-deep rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-3 h-3 bg-gold-deep rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          </div>
          <p className="text-gold-deep/60 text-[10px] font-bold uppercase tracking-[0.2em] animate-pulse">Sincronizando Segurança...</p>
        </div>
      </div>
    );
  }

  if (permsError) {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2 uppercase tracking-wider">Erro de Permissão</h1>
        <p className="text-gray-400 max-w-md mb-8">{permsError}</p>
        <button 
          onClick={() => signOut(auth)}
          className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm font-medium transition-colors"
        >
          Sair da Conta
        </button>
      </div>
    );
  }

  if (!user) {
    if (showRegistration) {
      return <CompanyRegistration onBack={() => setShowRegistration(false)} />;
    }
    return <Auth onSuccess={() => {}} onSignup={() => setShowRegistration(true)} visualConfig={visualConfig} />;
  }

  if (needsOnboarding && userProfile?.organizationId) {
    return (
      <SetupWizard
        organizationId={userProfile.organizationId}
        organizationName={visualConfig.companyName || 'sua empresa'}
        openrouterApiKey={agentApiKey}
        updatedBy={userProfile.uid}
        onComplete={() => setNeedsOnboarding(false)}
      />
    );
  }

  return (
    <ThemeProvider userProfile={userProfile}>
      <LayoutProvider>
        <ChatPreferencesProvider userProfile={userProfile}>
          <MainAppContent 
            user={user}
            userProfile={userProfile}
            isAuthReady={isAuthReady}
            permissions={permissions}
            permsLoading={permsLoading}
            visualConfig={visualConfig}
            setVisualConfig={setVisualConfig}
          />
        </ChatPreferencesProvider>
      </LayoutProvider>
    </ThemeProvider>
  );
}
