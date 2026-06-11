const EVOLUTION_API_URL = () => {
  const url = process.env.EVOLUTION_API_URL;
  if (!url) throw new Error('[EvolutionAPI] EVOLUTION_API_URL env var não definida');
  return url.replace(/\/$/, '');
};

const EVOLUTION_API_KEY = () => {
  const key = process.env.EVOLUTION_API_KEY;
  if (!key) throw new Error('[EvolutionAPI] EVOLUTION_API_KEY env var não definida');
  return key;
};

function authHeaders(): Record<string, string> {
  return {
    apikey: EVOLUTION_API_KEY(),
    'Content-Type': 'application/json',
  };
}

export const EvolutionAPI = {
  async createInstance(instanceName: string, webhookUrl: string): Promise<any> {
    try {
      const res = await fetch(`${EVOLUTION_API_URL()}/instance/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          instanceName,
          token: '',
          qrcode: true,
          webhook: {
            url: webhookUrl,
            webhook_by_events: true,
            webhook_base64: false,
            events: [
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'CONNECTION_UPDATE',
              'QRCODE_UPDATED',
              'CONTACTS_UPDATE',
            ],
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[EvolutionAPI] createInstance ${instanceName} falhou (${res.status}): ${text}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('[EvolutionAPI] createInstance error:', err);
      return null;
    }
  },

  async getQRCode(instanceName: string): Promise<{ base64?: string; code?: string } | null> {
    try {
      const res = await fetch(`${EVOLUTION_API_URL()}/instance/connect/${instanceName}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[EvolutionAPI] getQRCode ${instanceName} falhou (${res.status}): ${text}`);
        return null;
      }
      const data: any = await res.json();
      // Evolution API returns { base64, code } or { qrcode: { base64, code } }
      if (data?.base64 || data?.code) {
        return { base64: data.base64, code: data.code };
      }
      if (data?.qrcode) {
        return { base64: data.qrcode.base64, code: data.qrcode.code };
      }
      return data ?? null;
    } catch (err) {
      console.error('[EvolutionAPI] getQRCode error:', err);
      return null;
    }
  },

  async getConnectionState(instanceName: string): Promise<{ state: string; instance?: any } | null> {
    try {
      const res = await fetch(`${EVOLUTION_API_URL()}/instance/connectionState/${instanceName}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[EvolutionAPI] getConnectionState ${instanceName} falhou (${res.status}): ${text}`);
        return null;
      }
      const data: any = await res.json();
      return data ?? null;
    } catch (err) {
      console.error('[EvolutionAPI] getConnectionState error:', err);
      return null;
    }
  },

  async logoutInstance(instanceName: string): Promise<void> {
    try {
      const res = await fetch(`${EVOLUTION_API_URL()}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[EvolutionAPI] logoutInstance ${instanceName} falhou (${res.status}): ${text}`);
      }
    } catch (err) {
      console.error('[EvolutionAPI] logoutInstance error:', err);
    }
  },

  async deleteInstance(instanceName: string): Promise<void> {
    try {
      const res = await fetch(`${EVOLUTION_API_URL()}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[EvolutionAPI] deleteInstance ${instanceName} falhou (${res.status}): ${text}`);
      }
    } catch (err) {
      console.error('[EvolutionAPI] deleteInstance error:', err);
    }
  },

  async sendText(instanceName: string, phone: string, text: string): Promise<any> {
    try {
      const res = await fetch(`${EVOLUTION_API_URL()}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          number: phone,
          textMessage: { text },
          options: { delay: 1200, presence: 'composing' },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[EvolutionAPI] sendText ${instanceName}→${phone} falhou (${res.status}): ${errText}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('[EvolutionAPI] sendText error:', err);
      return null;
    }
  },

  async fetchInstances(): Promise<any[]> {
    try {
      const res = await fetch(`${EVOLUTION_API_URL()}/instance/fetchInstances`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[EvolutionAPI] fetchInstances falhou (${res.status}): ${text}`);
        return [];
      }
      const data: any = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('[EvolutionAPI] fetchInstances error:', err);
      return [];
    }
  },

  async getInstanceInfo(instanceName: string): Promise<any> {
    try {
      const res = await fetch(
        `${EVOLUTION_API_URL()}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
        { headers: authHeaders() },
      );
      if (!res.ok) {
        const text = await res.text();
        console.error(`[EvolutionAPI] getInstanceInfo ${instanceName} falhou (${res.status}): ${text}`);
        return null;
      }
      const data: any = await res.json();
      // Returns array — pick first match
      if (Array.isArray(data)) return data[0] ?? null;
      return data ?? null;
    } catch (err) {
      console.error('[EvolutionAPI] getInstanceInfo error:', err);
      return null;
    }
  },
};
