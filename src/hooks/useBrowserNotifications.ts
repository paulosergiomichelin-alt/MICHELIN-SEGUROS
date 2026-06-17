import { useEffect, useRef, useCallback } from 'react';

const ICON = '/favicon.ico';
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min por contato

export function useBrowserNotifications() {
  const lastNotifiedAt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const notify = useCallback((
    conversationId: string,
    contactName: string,
    messageBody: string,
    picture?: string,
  ) => {
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;

    const now = Date.now();
    const last = lastNotifiedAt.current.get(conversationId) ?? 0;
    if (now - last < COOLDOWN_MS) return;
    lastNotifiedAt.current.set(conversationId, now);

    const preview = messageBody.trim().slice(0, 100) || 'Nova mensagem';
    const n = new Notification(contactName, {
      body: preview,
      icon: picture || ICON,
      badge: ICON,
      tag: conversationId,
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };
  }, []);

  return { notify };
}
