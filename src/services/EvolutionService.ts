import { WhatsAppSession } from '../types';

export const EvolutionService = {
  async getSessions(): Promise<WhatsAppSession[]> {
    try {
      const res = await fetch('/api/evolution/sessions');
      if (!res.ok) return [];
      const data = await res.json();
      return data.sessions ?? [];
    } catch { return []; }
  },

  async createSession(userId: string, organizationId: string): Promise<{ instanceName: string; status: string } | null | { error: string }> {
    try {
      const res = await fetch('/api/evolution/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body?.error ?? 'Falha ao criar sessão' };
      }
      return res.json();
    } catch { return null; }
  },

  async getQRCode(sessionName: string): Promise<{ base64?: string; code?: string } | null> {
    try {
      const res = await fetch(`/api/evolution/qr?name=${encodeURIComponent(sessionName)}`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  async deleteSession(sessionName: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/evolution/sessions?name=${encodeURIComponent(sessionName)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch { return false; }
  },

  async refreshSession(sessionName: string): Promise<{ state?: string } | null> {
    try {
      const res = await fetch('/api/evolution/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sessionName }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  async syncConversations(sessionName: string, organizationId?: string): Promise<{ conversationsImported: number; messagesImported: number } | null> {
    try {
      const res = await fetch('/api/evolution/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName, organizationId }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  async sendMessage(sessionName: string, phone: string, message: string): Promise<boolean> {
    try {
      const res = await fetch('/api/evolution/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName, phone, message }),
      });
      return res.ok;
    } catch { return false; }
  },
};
