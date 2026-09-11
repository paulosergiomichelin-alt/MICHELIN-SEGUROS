
import React, { createContext, useContext, useState, useEffect } from 'react';
import { DataService } from '../services/DataService';
import { where, orderBy, limit } from '../lib/queryConstraints';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearNotification: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ userId: string; children: React.ReactNode }> = ({ userId, children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!userId) return;

    // DataService already applies visibility constraints
    const unsub = DataService.subscribeCollection(
      'notifications',
      [where('user_id', '==', userId), orderBy('created_at', 'desc'), limit(50)],
      (data) => {
        setNotifications(data);
      }
    );

    return () => unsub();
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    await DataService.update('notifications', id, { read: true });
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    const promises = unread.map(n => DataService.update('notifications', n.id, { read: true }));
    await Promise.all(promises);
  };

  const clearNotification = async (id: string) => {
    await DataService.delete('notifications', id);
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      clearNotification
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
