
import React from 'react';
import { LeadRealtimeProvider } from '../contexts/LeadRealtimeContext';
import { ClienteRealtimeProvider } from '../contexts/ClienteRealtimeContext';
import { ChatProvider } from '../contexts/ChatContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { WhatsAppProvider } from '../contexts/WhatsAppContext';
import { EmailProvider } from '../contexts/EmailContext';
import { UserProfile } from '../types';

interface ShellProvidersProps {
  children: React.ReactNode;
  user: any;
  userProfile: UserProfile | null;
}

export const ShellProviders: React.FC<ShellProvidersProps> = ({ children, user, userProfile }) => {
  return (
    <LeadRealtimeProvider userProfile={userProfile}>
      <ClienteRealtimeProvider userProfile={userProfile}>
        <NotificationProvider userId={user.uid}>
          <ChatProvider>
            <WhatsAppProvider userProfile={userProfile}>
              <EmailProvider>
                {children}
              </EmailProvider>
            </WhatsAppProvider>
          </ChatProvider>
        </NotificationProvider>
      </ClienteRealtimeProvider>
    </LeadRealtimeProvider>
  );
};
