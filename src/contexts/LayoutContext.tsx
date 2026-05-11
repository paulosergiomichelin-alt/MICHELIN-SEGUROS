import React, { useState, useEffect, useCallback } from 'react';
import { LayoutContext, Viewport, LayoutMode } from './ContextInstances';

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewport, setViewport] = useState<Viewport>({
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
    layoutMode: 'desktop',
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isUltraWide: false,
  });

  const getLayoutMode = (width: number): LayoutMode => {
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    if (width < 1600) return 'desktop';
    return 'ultrawide';
  };

  const handleResize = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const mode = getLayoutMode(width);
    
    setViewport({
      width,
      height,
      pixelRatio: window.devicePixelRatio,
      layoutMode: mode,
      isMobile: mode === 'mobile',
      isTablet: mode === 'tablet',
      isDesktop: mode === 'desktop',
      isUltraWide: mode === 'ultrawide',
    });
  }, []);

  useEffect(() => {
    // Initial call deferred to avoid cascading render warning in some environments
    const initTimer = setTimeout(handleResize, 0);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const debouncedResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (timeoutId) clearTimeout(timeoutId);
      clearTimeout(initTimer);
    };
  }, [handleResize]);

  return (
    <LayoutContext.Provider value={viewport}>
      {children}
    </LayoutContext.Provider>
  );
};
