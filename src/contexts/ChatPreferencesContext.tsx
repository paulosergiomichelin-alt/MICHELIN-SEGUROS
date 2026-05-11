
import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, ChatPreferences } from '../types';
import { DataService } from '../services/DataService';
import { ChatPreferencesContext } from './ContextInstances';



const DEFAULT_PREFERENCES: ChatPreferences = {
  fontSize: 14,
  chatZoom: 100,
  messageSpacing: 16,
  bubbleSize: 100,
  leftWidth: 320,
  rightWidth: 320
};



export const ChatPreferencesProvider: React.FC<{ children: React.ReactNode, userProfile: UserProfile | null }> = ({ children, userProfile }) => {
  const [preferences, setPreferences] = useState<ChatPreferences>(DEFAULT_PREFERENCES);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (userProfile?.chatPreferences) {
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...userProfile.chatPreferences
        });
      } else {
        setPreferences(DEFAULT_PREFERENCES);
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [userProfile]);

  const updatePreferences = useCallback(async (newPrefs: Partial<ChatPreferences>) => {
    if (!userProfile) return;
    
    setIsUpdating(true);
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);

    try {
      await DataService.update('users', userProfile.uid, {
        chatPreferences: updated
      });
    } catch (error) {
      console.error('Error updating chat preferences:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [userProfile, preferences]);

  const resetPreferences = useCallback(async () => {
    await updatePreferences(DEFAULT_PREFERENCES);
  }, [updatePreferences]);

  const value = React.useMemo(() => ({ 
    preferences, 
    updatePreferences, 
    resetPreferences, 
    isUpdating 
  }), [preferences, updatePreferences, resetPreferences, isUpdating]);

  return (
    <ChatPreferencesContext.Provider value={value}>
      {children}
    </ChatPreferencesContext.Provider>
  );
};
