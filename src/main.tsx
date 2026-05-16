import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './lib/pdf-init';
import { logger } from './services/LoggerService';

window.addEventListener('error', (event) => {
  // Suppress Vite HMR annoyance if it closes before opening
  if (event.message?.includes('WebSocket closed without opened')) {
    return;
  }
  
  logger.critical('WINDOW_ERROR', event.message, { 
    error: event.error?.message, 
    stack: event.error?.stack 
  });
});

window.addEventListener('unhandledrejection', (event) => {
  // Suppress Vite HMR annoyance if it closes before opening
  if (event.reason?.message?.includes('WebSocket closed without opened')) {
    console.warn("[WS_SUPPRESSED] Erro de HMR ignorado (Promise)");
    event.preventDefault();
    return;
  }

  logger.critical('UNHANDLED_PROMISE', event.reason?.message || 'Promise rejected', { 
    reason: event.reason?.stack || event.reason 
  });
});

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
