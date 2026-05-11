
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { X, GripHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import { useViewport } from '../hooks/useAppContexts';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  className?: string;
  isSidebarOpen?: boolean;
  hideCloseButton?: boolean;
  maxWidth?: string;
  showDragHandle?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className,
  isSidebarOpen = true,
  hideCloseButton = false,
  maxWidth = 'max-w-4xl',
  showDragHandle = true
}) => {
  const viewport = useViewport();
  const dragControls = useDragControls();
  const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.getElementById('modal-root');
    if (root) {
      // Defer state update to avoid cascading render lint error
      const timer = setTimeout(() => setModalRoot(root), 0);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!modalRoot) return null;

  // Intelligent Centering Logic
  // Sidebar is usually around 240px if open on desktop
  const sidebarWidth = (viewport.isDesktop || viewport.isUltraWide) && isSidebarOpen ? 240 : 0;
  
  // Usable area starts after sidebar
  const usableWidth = viewport.width - sidebarWidth;
  
  // Modal position calculation for desktop
  // We'll use CSS transform for the actual centering, but we can nudge the whole container
  const modalOffset = viewport.isMobile ? 0 : sidebarWidth / 2;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center isolate overflow-hidden">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              x: (viewport.isDesktop || viewport.isUltraWide) && isSidebarOpen ? (sidebarWidth / 2) : 0
            }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            drag={!viewport.isMobile && showDragHandle}
            dragControls={dragControls}
            dragMomentum={false}
            dragListener={false} // Only drag by handle
            className={cn(
              "relative z-[9999] w-full flex flex-col bg-brand-dark shadow-2xl overflow-hidden",
              viewport.isMobile ? "h-full" : cn("rounded-3xl border border-white/10", maxWidth),
              className
            )}
            style={{
              maxHeight: viewport.isMobile ? '100%' : '90vh',
            }}
          >
            {/* Header / Drag Handle */}
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className={cn(
                "flex items-center justify-between px-5 py-3.5 shrink-0 border-b border-white/5 cursor-grab active:cursor-grabbing bg-gradient-to-b from-[#0B1120] to-[#050816]",
                viewport.isMobile ? "pt-10" : ""
              )}
            >
              <div className="flex items-center gap-3">
                {showDragHandle && !viewport.isMobile && <GripHorizontal className="w-4 h-4 text-white/20" />}
                {typeof title === 'string' ? (
                  <h2 className="text-[11px] font-black uppercase text-white tracking-widest">{title}</h2>
                ) : (
                  title
                )}
              </div>
              {!hideCloseButton && (
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-white/30 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    modalRoot
  );
};
