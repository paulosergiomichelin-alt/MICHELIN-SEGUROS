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
                'MESSAGES_DELETE',
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

    const stateRes = await EvolutionAPI.getConnectionState(instanceName);
    const currentState = (
      (stateRes as any)?.instance?.state ?? (stateRes as any)?.state ?? ''
    ).toLowerCase();
    console.log(`[EvolutionAPI] getQRCode ${instanceName}: sem QR, state=${currentState} — forçando logout`);

    if (currentState === 'open') return null;

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
          text,
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
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ where: {} }),
      }, 20000);
      const text = await res.text();
      process.stdout.write(`[EvolutionAPI] findChats ${instanceName} status=${res.status} chats=${text.length > 100 ? '(truncated)' : text}\n`);
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

  // POST /chat/findMessages/{instance} com { where: { key: { remoteJid } }, limit }
  // Resposta v2.x: { messages: { total, pages, currentPage, records: [...] } }
  async findMessages(instanceName: string, remoteJid: string, msgLimit = 50): Promise<any[]> {
    const candidates = [
      { path: `/chat/findMessages/${instanceName}`,    method: 'POST' },
      { path: `/message/findMessages/${instanceName}`, method: 'POST' },
    ];

    for (const { path, method } of candidates) {
      try {
        const url = `${EVOLUTION_API_URL()}${path}`;
        const res = await fetchWithTimeout(url, {
          method,
          headers: authHeaders(),
          body: JSON.stringify({ where: { key: { remoteJid } }, limit: msgLimit }),
        }, 15000);

        if (res.status === 404) continue; // Endpoint não existe nesta versão

        const text = await res.text();
        if (!res.ok) {
          process.stdout.write(`[EvolutionAPI] findMessages ${path} status=${res.status}\n`);
          continue;
        }

        try {
          const data: any = JSON.parse(text);
          // v2.x: { messages: { total, pages, currentPage, records: [...] } }
          // v1.x: array direto
          const msgs = Array.isArray(data)
            ? data
            : Array.isArray(data?.messages?.records)
              ? data.messages.records
              : Array.isArray(data?.messages)
                ? data.messages
                : [];
          process.stdout.write(`[EvolutionAPI] findMessages via ${path}: ${msgs.length} msgs (total no banco: ${data?.messages?.total ?? '?'})\n`);
          return msgs;
        } catch { continue; }
      } catch (err: any) {
        if (err?.name === 'AbortError') continue;
        process.stdout.write(`[EvolutionAPI] findMessages ${path} error: ${err}\n`);
        continue;
      }
    }

    return []; // Histórico não disponível nesta versão da Evolution API
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

  async fetchProfilePicture(instanceName: string, phone: string): Promise<string | null> {
    const number = phone.replace(/@.*$/, ''); // strip JID suffix
    try {
      // Try GET with query param (Evolution API v1 style)
      const res = await fetchWithTimeout(
        `${EVOLUTION_API_URL()}/chat/fetchProfilePicture/${instanceName}?number=${number}`,
        { headers: authHeaders() },
        8000,
      );
      if (res.ok) {
        const data: any = await res.json();
        const pic = data?.profilePictureUrl ?? data?.url ?? data?.picture ?? null;
        if (pic) return pic;
      }
      // Try POST (Evolution API v2 style)
      const res2 = await fetchWithTimeout(
        `${EVOLUTION_API_URL()}/chat/fetchProfilePicture/${instanceName}`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ number }),
        },
        8000,
      );
      if (res2.ok) {
        const data: any = await res2.json();
        return data?.profilePictureUrl ?? data?.url ?? data?.picture ?? null;
      }
      return null;
    } catch { return null; }
  },

  // Busca uma mensagem pelo key.id (WhatsApp ID) para obter key+message completos
  async findMessageById(instanceName: string, waId: string): Promise<any | null> {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/findMessages/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ where: { key: { id: waId } }, limit: 1 }),
      }, 10000);
      if (!res.ok) return null;
      const data: any = await res.json();
      return data?.messages?.records?.[0] ?? null;
    } catch { return null; }
  },

  // Descriptografa mídia via Evolution API e retorna base64
  async getMediaBase64(instanceName: string, msg: any): Promise<{ base64: string; mimetype: string } | null> {
    try {
      const url = `${EVOLUTION_API_URL()}/chat/getBase64FromMediaMessage/${instanceName}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message: { key: msg.key, message: msg.message } }),
      }, 60000);
      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data?.base64) return null;
      return { base64: data.base64, mimetype: data.mimetype ?? 'application/octet-stream' };
    } catch { return null; }
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
      if (Array.isArray(data)) return data[0] ?? null;
      return data ?? null;
    } catch (err) {
      console.error('[EvolutionAPI] getInstanceInfo error:', err);
      return null;
    }
  },
};
