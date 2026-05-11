import React from 'react';
import { 
  Users, 
  Send, 
  MessageSquare, 
  Bot, 
  FileSearch, 
  ShieldAlert, 
  Cog, 
  LogOut, 
  Menu, 
  X,
  ChevronLeft,
  ChevronRight,
  Activity,
  LayoutGrid,
  PieChart,
  ClipboardList,
  FileText,
  BarChart3,
  UserCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Permissions, VisualIdentityConfig } from '../types';
import { useTheme, useViewport } from '../hooks/useAppContexts';


import { auth, signOut } from '../lib/firebase';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  permissions: Permissions;
  visualConfig: VisualIdentityConfig;
  user: any;
  userProfile: any;
  isSidebarOpen: boolean;
  toggleSidebar: (open: boolean) => void;
  onProfileClick: () => void;
}

export const Sidebar = React.memo(({ 
  activeTab, 
  setActiveTab, 
  permissions, 
  visualConfig,
  user,
  userProfile,
  isSidebarOpen,
  toggleSidebar,
  onProfileClick
}: SidebarProps) => {
  const { theme } = useTheme();
  const viewport = useViewport();
  
  const handleNavClick = (tab: any) => {
    setActiveTab(tab);
    if (viewport.width < 768) {
      toggleSidebar(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Tem certeza que deseja sair?')) {
      await signOut(auth);
    }
  };

  const [logoError, setLogoError] = React.useState(false);
  const logoUrlRaw = theme === 'light' && visualConfig.logoLight 
    ? visualConfig.logoLight 
    : (visualConfig.logoDark || 'https://cdn-icons-png.flaticon.com/512/3755/3755250.png');
    
  const logoUrl = logoUrlRaw;

  // Reset error state when URL changes
  React.useEffect(() => {
    setLogoError(false);
  }, [logoUrl]);

  return (
    <aside 
      className={cn(
        "bg-brand-black border-r border-brand-dark flex flex-col transition-all duration-300 z-[1000] fixed md:relative h-full inset-y-0 left-0 overflow-x-hidden sidebar-main",
        isSidebarOpen 
          ? "w-[240px] translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.5)]" 
          : "w-[240px] -translate-x-full md:w-16 md:translate-x-0"
      )}
    >
      <div className="p-4 flex flex-col items-center gap-3 relative shrink-0">
        <button 
          onClick={() => toggleSidebar(false)}
          className="md:hidden absolute top-3 right-3 p-1.5 text-gold-light/40 hover:text-gold-deep transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="w-full h-24 flex items-center justify-center p-1.5 overflow-hidden">
          {logoUrl && !logoError ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className={cn(
                "object-contain w-full h-full transition-all duration-300 scale-110",
                !isSidebarOpen && "scale-150 translate-x-[-2px]"
              )}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-16 h-16 bg-gold-deep/20 rounded-2xl flex items-center justify-center text-gold-deep font-black text-xl mb-4">
              {(visualConfig.companyName || 'M').charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

    <nav className="flex-1 mt-4 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden custom-scrollbar">
      {[
        { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid, permission: permissions.canReadAllLeads },
        { id: 'dashboard', label: 'Início', icon: PieChart, permission: permissions.canReadAllLeads },
        { id: 'leads', label: 'LEADS', icon: Users, permission: permissions.canReadAllLeads },
        { id: 'ativos', label: 'Ativos', icon: Send, permission: permissions.canReadAllLeads },
        { id: 'chat', label: 'WhatsApp', icon: MessageSquare, permission: permissions.canReadAllLeads, badge: '12' },
        { id: 'agent', label: 'Agente de IA', icon: Bot, permission: permissions.canAccessSettings },
        { id: 'users', label: 'Equipe', icon: ShieldAlert, permission: permissions.canManageUsers },
        { id: 'settings', label: 'Configurações', icon: Cog, permission: permissions.canAccessSettings },
      ].map((item) => {
        if (!item.permission) return null;
        
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        
        return (
          <button 
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
              isActive 
                ? "bg-brand-dark/40 text-gold-deep border border-gold-deep/10 shadow-sm" 
                : "text-white/60 hover:bg-brand-dark/10 hover:text-white font-medium"
            )}
          >
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gold-deep rounded-r-full" />
            )}
            <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-gold-deep" : "group-hover:text-gold-light")} />
            <span className={cn(
              "font-bold uppercase text-[10.5px] tracking-widest ml-2 whitespace-nowrap transition-all duration-300 opacity-100 flex-1 text-left",
              !isSidebarOpen && "md:opacity-0 md:pointer-events-none"
            )}>
              {item.label}
            </span>
            {item.badge && isSidebarOpen && (
              <span className="bg-gold-deep text-brand-dark text-[8px] font-black px-1.5 py-0.5 rounded min-w-[16px] text-center">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>

    <div className="p-3 mt-auto border-t border-white/5 space-y-3 shrink-0 bg-brand-black">
       {/* User Profile Card */}
       <button 
         onClick={onProfileClick}
         className={cn(
           "w-full flex items-center gap-2.5 p-1.5 rounded-lg transition-all duration-300 group relative cursor-pointer",
           "bg-white/5 border border-white/5",
           "hover:bg-white/10 hover:border-gold-deep/20 hover:scale-[1.01] active:scale-[0.99]",
           !isSidebarOpen && "justify-center px-0 bg-transparent border-transparent"
         )}
       >
         <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 shrink-0 overflow-hidden relative group-hover:border-gold-deep/50 transition-colors">
           {userProfile?.photoURL ? (
             <img src={userProfile.photoURL} alt="Profile" className="w-full h-full object-cover" />
           ) : (
             <div className="w-full h-full flex items-center justify-center text-gold-deep/40 group-hover:text-gold-deep transition-colors">
               <UserCircle className="w-full h-full p-0.5" />
             </div>
           )}
           <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border-2 border-brand-black rounded-full" />
         </div>
         {isSidebarOpen && (
           <div className="min-w-0 flex-1 text-left">
             <div className="flex items-center justify-between">
               <p className="text-[10px] font-black text-white truncate uppercase tracking-tight group-hover:text-gold-light transition-colors">
                 {(userProfile?.name || 'Vendedor').split(' ')[0]}
               </p>
               <ChevronRight className="w-2.5 h-2.5 text-white/20" />
             </div>
             <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest truncate">
               {userProfile?.cargo || 'Admin'}
             </p>
           </div>
         )}
       </button>

       <button 
        onClick={handleLogout}
        className={cn(
          "w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-red-500/10 text-white/15 hover:text-red-500 transition-all group overflow-hidden border border-transparent",
          !isSidebarOpen && "justify-center px-0"
        )}
       >
         <LogOut className="w-4 h-4 shrink-0" />
         <span className={cn(
           "font-bold uppercase text-[10px] tracking-[0.15em] ml-2 transition-all duration-300 opacity-100",
           !isSidebarOpen && "md:opacity-0 md:pointer-events-none"
         )}>
           Sair
         </span>
       </button>
    </div>
  </aside>
  );
});

Sidebar.displayName = 'Sidebar';
