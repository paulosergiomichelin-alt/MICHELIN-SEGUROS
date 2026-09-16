
import React from 'react';
import { VisualIdentityConfig, UserProfile } from '../types';

interface MobileHeaderProps {
  visualConfig: VisualIdentityConfig;
  user: any;
  userProfile: UserProfile | null;
  onMenuClick: () => void;
  onProfileClick: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  visualConfig,
  user,
  userProfile,
  onMenuClick,
  onProfileClick
}) => {
  return (
    <div className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-slate-200 shrink-0 z-50">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 text-slate-400 hover:text-[#1B4D8F] transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-black text-xs uppercase tracking-[0.2em] text-gold-deep truncate max-w-[150px]">
          {visualConfig.companyName || 'CRM'}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={onProfileClick}
          className="w-8 h-8 rounded-lg bg-gold-deep/10 border border-gold-deep/20 flex items-center justify-center hover:bg-gold-deep/20 transition-colors"
        >
          <span className="text-[10px] font-black text-gold-deep">
            {(userProfile?.name || user?.email || 'U').charAt(0).toUpperCase()}
          </span>
        </button>
      </div>
    </div>
  );
};
