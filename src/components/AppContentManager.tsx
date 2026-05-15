
import React, { lazy, Suspense } from 'react';
import { useLeads } from '../contexts/LeadRealtimeContext';
import { Permissions, VisualIdentityConfig, AgentConfig, Lead, UserProfile } from '../types';
import { DataService } from '../services/DataService';

const DashboardView = lazy(() => import('../domains/dashboard/DashboardPage').then(m => ({ default: m.DashboardView })));
const LeadsView = lazy(() => import('../domains/leads/LeadsPage').then(m => ({ default: m.LeadsPage })));
const ChatView = lazy(() => import('../domains/leads/ChatView').then(m => ({ default: m.ChatView })));
const SalesPipeline = lazy(() => import('../domains/leads/SalesPipeline').then(m => ({ default: m.SalesPipeline })));
const TeamPage = lazy(() => import('../domains/admin/TeamPage').then(m => ({ default: m.TeamPage })));
const Settings = lazy(() => import('../domains/settings/SettingsPage').then(m => ({ default: m.Settings })));
const TechDocs = lazy(() => import('../domains/settings/TechDocs').then(m => ({ default: m.TechDocs })));
const AgentSettings = lazy(() => import('../domains/settings/AgentSettings').then(m => ({ default: m.AgentSettings })));
const UserLogsView = lazy(() => import('../domains/admin/UserLogsView').then(m => ({ default: m.UserLogsView })));
const SystemHealth = lazy(() => import('../domains/settings/SystemHealth').then(m => ({ default: m.SystemHealth })));
const AdminTools = lazy(() => import('../domains/admin/AdminTools').then(m => ({ default: m.AdminTools })));
const MensagensAtivas = lazy(() => import('../domains/leads/MensagensAtivas').then(m => ({ default: m.MensagensAtivas })));
const DiagnosticDashboard = lazy(() => import('../domains/admin/DiagnosticDashboard').then(m => ({ default: m.DiagnosticDashboard })));
const EmpresasManagement = lazy(() => import('../domains/admin/EmpresasManagement').then(m => ({ default: m.EmpresasManagement })));

interface AppContentManagerProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  permissions: Permissions;
  visualConfig: VisualIdentityConfig;
  setVisualConfig: (c: VisualIdentityConfig) => void;
  agentConfig: AgentConfig;
  setAgentConfig: (c: AgentConfig) => void;
  userProfile?: UserProfile | null;
}

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-brand-dark/50">
    <div className="w-6 h-6 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin"></div>
  </div>
);

export const AppContentManager: React.FC<AppContentManagerProps> = ({
  activeTab,
  setActiveTab,
  permissions,
  visualConfig,
  setVisualConfig,
  agentConfig,
  setAgentConfig,
  userProfile,
}) => {
  const { leads, loading: leadsLoading } = useLeads();

  return (
    <Suspense fallback={<LoadingFallback />}>
      <div className="flex-1 overflow-auto">

        {activeTab === 'dashboard' && (
          <DashboardView visualConfig={visualConfig} setActiveTab={setActiveTab} />
        )}
        
        {activeTab === 'leads' && (
          <LeadsView 
            visualConfig={visualConfig}
            permissions={permissions}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'pipeline' && (
          <SalesPipeline visualConfig={visualConfig} permissions={permissions} setActiveTab={setActiveTab} />
        )}

        {activeTab === 'chat' && (
          <ChatView 
            visualConfig={visualConfig} 
            permissions={permissions} 
            agentConfig={agentConfig}
            setActiveTab={setActiveTab}
            isSlow={false}
          />
        )}

        {activeTab === 'active_messages' && permissions.canReadAllLeads && (
          <MensagensAtivas leads={leads} visualConfig={visualConfig} />
        )}

        {activeTab === 'logs' && permissions.canAccessSettings && <UserLogsView />}
        
        {activeTab === 'users' && permissions.canManageUsers && (
          <TeamPage />
        )}

        {activeTab === 'agent' && permissions.canAccessSettings && (
          <div className="p-6">
            <AgentSettings visualConfig={visualConfig} onUpdate={async (c: any) => {
              await DataService.update('config', 'agent', c);
              setAgentConfig(c);
            }} />
          </div>
        )}

        {activeTab === 'settings' && permissions.canAccessSettings && (
          <div className="p-6">
            <Settings
              visualConfig={visualConfig}
              onUpdateVisualConfig={setVisualConfig}
              canManageUsers={permissions.canManageUsers}
              permissions={permissions}
              userProfile={userProfile}
            />
          </div>
        )}

        {activeTab === 'tech-docs' && <TechDocs onBack={() => setActiveTab('settings')} />}

        {activeTab === 'empresas' && userProfile?.superadmin === true && (
          <EmpresasManagement />
        )}
      </div>
    </Suspense>
  );
};
