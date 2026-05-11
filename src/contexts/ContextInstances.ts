
import { createContext } from 'react';
import { Theme, UserProfile, ChatPreferences } from '../types';

// Theme Context
export interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  toggleTheme: () => Promise<void>;
}
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Layout Context
export type LayoutMode = 'mobile' | 'tablet' | 'desktop' | 'ultrawide';
export interface Viewport {
  width: number;
  height: number;
  pixelRatio: number;
  layoutMode: LayoutMode;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isUltraWide: boolean;
}
export const LayoutContext = createContext<Viewport | undefined>(undefined);

// Chat Preferences Context
export interface ChatPreferencesContextType {
  preferences: ChatPreferences;
  updatePreferences: (newPrefs: Partial<ChatPreferences>) => Promise<void>;
  resetPreferences: () => Promise<void>;
  isUpdating: boolean;
}
export const ChatPreferencesContext = createContext<ChatPreferencesContextType | undefined>(undefined);
