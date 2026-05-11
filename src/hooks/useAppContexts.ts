
import { useContext } from 'react';
import { ThemeContext, LayoutContext, ChatPreferencesContext } from '../contexts/ContextInstances';

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useViewport() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useViewport must be used within a LayoutProvider');
  }
  return context;
}

export function useChatPreferences() {
  const context = useContext(ChatPreferencesContext);
  if (context === undefined) {
    throw new Error('useChatPreferences must be used within a ChatPreferencesProvider');
  }
  return context;
}
