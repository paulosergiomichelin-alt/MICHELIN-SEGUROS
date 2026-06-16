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

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export const EvolutionAPI = {
  async createInstance(instanceName: string, webhookUrl: string): Promise<any> {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          ...(webhookUrl ? {
            webhook: {
              url: webhookUrl,
              byEvents: true,
              base64: false,
              events: [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'CONNECTION_UPDATE',
                'QRCODE_UPDATED',
                'CONTACTS_UPDATE',
                'CHATS_UPDATE',
                'CHATS_UPSERT',
                'PRESENCE_UPDATE',
              ],
            },
          } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        // Instance already exists — reuse it
        if (res.status === 403 && text.includes('already in use')) {
          console.warn(`[EvolutionAPI] createInstance: instância ${instanceName} já existe, reutilizando`);
          return await EvolutionAPI.getInstanceInfo(instanceName) ?? { instanceName };
        }
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
    const connectAndRead = async (): Promise<{ base64?: string; code?: string } | null> => {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/connect/${instanceName}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[EvolutionAPI] getQRCode ${instanceName} falhou (${res.status}): ${text}`);
        return null;
      }
      const data: any = await res.json();
      if (data?.base64 || data?.code) return { base64: data.base64, code: data.code };
      if (data?.qrcode?.base64) return { base64: data.qrcode.base64, code: data.qrcode.code };
      return null;
    };

    // Poll up to 3x with 1.5s delay — primary QR delivery is via QRCODE_UPDATED webhook
    for (let i = 0; i < 3; i++) {
      try {
        const qr = await connectAndRead();
        if (qr) return qr;
        console.log(`[EvolutionAPI] getQRCode ${instanceName}: tentativa ${i + 1}/3 sem QR`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.error('[EvolutionAPI] getQRCode error:', err);
        return null;
      }
    }

    // Instance stuck in 'connecting' (Baileys trying to restore an expired session).
    // Force logout to wipe the cached session and trigger fresh QR generation.
    const stateRes = await EvolutionAPI.getConnectionState(instanceName);
    const currentState = (
      (stateRes as any)?.instance?.state ?? (stateRes as any)?.state ?? ''
    ).toLowerCase();
    console.log(`[EvolutionAPI] getQRCode ${instanceName}: sem QR, state=${currentState} — forçando logout`);

    if (currentState === 'open') return null; // Já conectado, não precisa de QR

    try {
      await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      await new Promise(r => setTimeout(r, 2000));
      return await connectAndRead();
    } catch (err) {
      console.error('[EvolutionAPI] getQRCode post-logout error:', err);
      return null;
    }
  },

  async getConnectionState(instanceName: string): Promise<{ state: string; instance?: any } | null> {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/connectionState/${instanceName}`, {
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
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/logout/${instanceName}`, {
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
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/delete/${instanceName}`, {
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
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/message/sendText/${instanceName}`, {
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
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/fetchInstances`, {
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

  async findChats(instanceName: string): Promise<any[]> {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/findChats/${instanceName}`;
      process.stdout.write(`[EvolutionAPI] findChats POST ${url}\n`);
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ where: {} }),
      }, 20000);
      const text = await res.text();
      process.stdout.write(`[EvolutionAPI] findChats ${instanceName} status=${res.status} body=${text.slice(0, 800)}\n`);
      if (!res.ok) return [];
      try {
        const data: any = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch { return []; }
    } catch (err) {
      process.stdout.write(`[EvolutionAPI] findChats error: ${err}\n`);
      return [];
    }
  },

  async findMessages(instanceName: string, remoteJid: string, msgLimit = 30): Promise<any[]> {
    try {
      const url = `${EVOLUTION_API_URL()}/message/findMessages/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ where: { key: { remoteJid } }, limit: msgLimit }),
      }, 20000);
      const text = await res.text();
      if (!res.ok) {
        process.stdout.write(`[EvolutionAPI] findMessages ${remoteJid} status=${res.status} body=${text.slice(0, 300)}\n`);
        return [];
      }
      const data: any = JSON.parse(text);
      const msgs = Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : []);
      process.stdout.write(`[EvolutionAPI] findMessages ${remoteJid}: ${msgs.length} msgs. Amostra: ${JSON.stringify(msgs[0])?.slice(0, 200) ?? 'none'}\n`);
      return msgs;
    } catch (err) {
      process.stdout.write(`[EvolutionAPI] findMessages error: ${err}\n`);
      return [];
    }
  },

  async findContacts(instanceName: string): Promise<any[]> {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/findContacts/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ where: {} }),
      }, 20000);
      if (!res.ok) return [];
      const text = await res.text();
      try {
        const data: any = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch { return []; }
    } catch (err) {
      process.stdout.write(`[EvolutionAPI] findContacts error: ${err}\n`);
      return [];
    }
  },

  async getInstanceInfo(instanceName: string): Promise<any> {
    try {
      const res = await fetchWithTimeout(
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
