import { useState, useRef, useCallback } from 'react';

export function useColumnResize(defaultWidth: number, min: number, max: number) {
  const [width, setWidth] = useState(defaultWidth);
  const isDragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX;
      setWidth(Math.min(max, Math.max(min, startWidth + delta)));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width, min, max]);

  return { width, onMouseDown };
}
