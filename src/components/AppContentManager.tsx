
import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useLeads } from '../contexts/LeadRealtimeContext';
import { Permissions, VisualIdentityConfig, AgentConfig, UserProfile } from '../types';
import { DataService } from '../services/DataService';

const DashboardView    = lazy(() => import('../domains/dashboard/DashboardPage').then(m => ({ default: m.DashboardView })));
const LeadsView        = lazy(() => import('../domains/leads/LeadsPage').then(m => ({ default: m.LeadsPage })));
const ChatView         = lazy(() => import('../domains/leads/ChatView').then(m => ({ default: m.ChatView })));
const SalesPipeline    = lazy(() => import('../domains/leads/SalesPipeline').then(m => ({ default: m.SalesPipeline })));
const TeamPage         = lazy(() => import('../domains/admin/TeamPage').then(m => ({ default: m.TeamPage })));
const Settings         = lazy(() => import('../domains/settings/SettingsPage').then(m => ({ default: m.Settings })));
const TechDocs         = lazy(() => import('../domains/settings/TechDocs').then(m => ({ default: m.TechDocs })));
const AgentSettings    = lazy(() => import('../domains/settings/AgentSettings').then(m => ({ default: m.AgentSettings })));
const UserLogsView     = lazy(() => import('../domains/admin/UserLogsView').then(m => ({ default: m.UserLogsView })));
const MensagensAtivas  = lazy(() => import('../domains/leads/MensagensAtivas').then(m => ({ default: m.MensagensAtivas })));
const EmpresasManagement = lazy(() => import('../domains/admin/EmpresasManagement').then(m => ({ default: m.EmpresasManagement })));
const UserProfilePage    = lazy(() => import('../domains/admin/UserProfilePage').then(m => ({ default: m.UserProfilePage })));
const LeadPage           = lazy(() => import('../domains/leads/LeadPage').then(m => ({ default: m.LeadPage })));

interface AppContentManagerProps {
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
  permissions,
  visualConfig,
  setVisualConfig,
  agentConfig,
  setAgentConfig,
  userProfile,
}) => {
  const navigate = useNavigate();
  const { leads } = useLeads();

  // Programmatic navigation — passed as prop to pages that need it
  const setActiveTab = (tab: string) => navigate('/' + tab);

  return (
    <Suspense fallback={<LoadingFallback />}>
      <div className="flex-1 overflow-auto">
        <Routes>

          {/* Default: redirect / to /pipeline */}
          <Route path="/" element={<Navigate to="/pipeline" replace />} />

          <Route
            path="/pipeline"
            element={
              <SalesPipeline
                visualConfig={visualConfig}
                permissions={permissions}
                setActiveTab={setActiveTab}
              />
            }
          />

          <Route
            path="/dashboard"
            element={
              <DashboardView
                visualConfig={visualConfig}
                setActiveTab={setActiveTab}
              />
            }
          />

          <Route
            path="/leads"
            element={
              <LeadsView
                visualConfig={visualConfig}
                permissions={permissions}
                setActiveTab={setActiveTab}
              />
            }
          />

          <Route path="/leads/new" element={<LeadPage />} />
          <Route path="/leads/:id" element={<LeadPage />} />

          <Route
            path="/chat"
            element={
              <ChatView
                visualConfig={visualConfig}
                permissions={permissions}
                agentConfig={agentConfig}
                setActiveTab={setActiveTab}
                isSlow={false}
              />
            }
          />

          {/* Ativos / Mensagens Ativas */}
          <Route
            path="/ativos"
            element={
              permissions.canReadAllLeads
                ? <MensagensAtivas leads={leads} visualConfig={visualConfig} />
                : <Navigate to="/pipeline" replace />
            }
          />
          <Route
            path="/active_messages"
            element={<Navigate to="/ativos" replace />}
          />

          <Route
            path="/logs"
            element={
              permissions.canAccessSettings
                ? <UserLogsView />
                : <Navigate to="/pipeline" replace />
            }
          />

          <Route
            path="/users"
            element={
              permissions.canManageUsers
                ? <TeamPage />
                : <Navigate to="/pipeline" replace />
            }
          />

          <Route
            path="/users/:uid"
            element={
              permissions.canManageUsers
                ? <UserProfilePage />
                : <Navigate to="/pipeline" replace />
            }
          />

          <Route
            path="/agent"
            element={
              permissions.canAccessSettings
                ? (
                  <div className="p-6">
                    <AgentSettings
                      visualConfig={visualConfig}
                      onUpdate={async (c: any) => {
                        await DataService.update('config', 'agent', c);
                        setAgentConfig(c);
                      }}
                    />
                  </div>
                )
                : <Navigate to="/pipeline" replace />
            }
          />

          <Route
            path="/settings"
            element={
              permissions.canAccessSettings
                ? (
                  <div className="p-6">
                    <Settings
                      visualConfig={visualConfig}
                      onUpdateVisualConfig={setVisualConfig}
                      canManageUsers={permissions.canManageUsers}
                      permissions={permissions}
                      userProfile={userProfile}
                    />
                  </div>
                )
                : <Navigate to="/pipeline" replace />
            }
          />

          <Route
            path="/tech-docs"
            element={<TechDocs onBack={() => setActiveTab('settings')} />}
          />

          <Route
            path="/empresas"
            element={
              userProfile?.superadmin === true
                ? <EmpresasManagement />
                : <Navigate to="/pipeline" replace />
            }
          />

          {/* Fallback: any unknown path → pipeline */}
          <Route path="*" element={<Navigate to="/pipeline" replace />} />

        </Routes>
      </div>
    </Suspense>
  );
};
