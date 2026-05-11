
import React, { useState, useEffect, useRef } from 'react';
import { Theme, UserProfile } from '../types';
import { DataService } from '../services/DataService';
import { ThemeContext } from './ContextInstances';
const STORAGE_KEY = 'app-theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode, userProfile: UserProfile | null }> = ({ children, userProfile }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Priority 1: Local Storage
    if (typeof window !== 'undefined') {
      const savedLocal = localStorage.getItem(STORAGE_KEY) as Theme;
      if (savedLocal) return savedLocal;
    }
    return 'dark';
  });

  // Keep a ref to the last synced profile theme to avoid redundant effect triggers
  const lastProfileThemeRef = useRef<string | undefined>(userProfile?.theme);

  useEffect(() => {
    if (userProfile?.theme && userProfile.theme !== theme && userProfile.theme !== lastProfileThemeRef.current) {
      setThemeState(userProfile.theme);
      lastProfileThemeRef.current = userProfile.theme;
    }
  }, [userProfile?.theme, theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
    // Always keep localStorage updated with the current state of theme
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
    
    if (userProfile?.uid) {
      try {
        await DataService.update('users', userProfile.uid, { theme: newTheme });
        console.log(`Theme saved via DataService: ${newTheme} for user ${userProfile.uid}`);
      } catch (error) {
        console.error('Error saving theme to profile:', error);
      }
    }
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    await setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
