import { createLogger, errCtx } from './logger.js';
const log = createLogger('evolution/api');

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
          log.warn('createInstance: instância já existe, reutilizando', { instance: instanceName });
          return await EvolutionAPI.getInstanceInfo(instanceName) ?? { instanceName };
        }
        log.error('createInstance falhou', { instance: instanceName, status: res.status, body: text.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log.error('createInstance erro inesperado', { instance: instanceName, ...errCtx(err) });
      return null;
    }
  },

  async setWebhook(instanceName: string, webhookUrl: string): Promise<boolean> {
    const events = [
      'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE',
      'CONNECTION_UPDATE', 'QRCODE_UPDATED',
      'CONTACTS_UPDATE', 'CHATS_UPDATE', 'CHATS_UPSERT', 'PRESENCE_UPDATE',
    ];
    // Tenta v2.x primeiro (body aninhado em "webhook"), depois v1.x (body flat)
    const payloads = [
      { webhook: { url: webhookUrl, byEvents: true, base64: false, events } },
      { url: webhookUrl, byEvents: true, base64: false, events },
    ];
    for (const body of payloads) {
      try {
        const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/webhook/set/${instanceName}`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
        }, 8000);
        if (res.ok) {
          log.info('setWebhook OK', { instance: instanceName, url: webhookUrl });
          return true;
        }
        const text = await res.text();
        log.warn('setWebhook falhou (tentando próximo payload)', { instance: instanceName, status: res.status, body: text.slice(0, 200) });
      } catch (err) {
        log.error('setWebhook erro inesperado', { instance: instanceName, ...errCtx(err) });
      }
    }
    return false;
  },

  async getQRCode(instanceName: string): Promise<{ base64?: string; code?: string } | null> {
    const connectAndRead = async (): Promise<{ base64?: string; code?: string } | null> => {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/connect/${instanceName}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const text = await res.text();
        log.warn('getQRCode falhou', { instance: instanceName, status: res.status, body: text.slice(0, 200) });
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
        log.debug('getQRCode: tentativa sem QR', { instance: instanceName, attempt: i + 1 });
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        log.error('getQRCode erro inesperado', { instance: instanceName, ...errCtx(err) });
        return null;
      }
    }

    const stateRes = await EvolutionAPI.getConnectionState(instanceName);
    const currentState = (
      (stateRes as any)?.instance?.state ?? (stateRes as any)?.state ?? ''
    ).toLowerCase();
    log.warn('getQRCode: sem QR após 3 tentativas, forçando logout', { instance: instanceName, state: currentState });

    if (currentState === 'open') return null;

    try {
      await fetchWithTimeout(`${EVOLUTION_API_URL()}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      await new Promise(r => setTimeout(r, 2000));
      return await connectAndRead();
    } catch (err) {
      log.error('getQRCode post-logout erro inesperado', { instance: instanceName, ...errCtx(err) });
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
        log.warn('getConnectionState falhou', { instance: instanceName, status: res.status, body: text.slice(0, 200) });
        return null;
      }
      const data: any = await res.json();
      return data ?? null;
    } catch (err) {
      log.error('getConnectionState erro inesperado', { instance: instanceName, ...errCtx(err) });
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
        log.warn('logoutInstance falhou', { instance: instanceName, status: res.status, body: text.slice(0, 200) });
      }
    } catch (err) {
      log.error('logoutInstance erro inesperado', { instance: instanceName, ...errCtx(err) });
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
        log.warn('deleteInstance falhou', { instance: instanceName, status: res.status, body: text.slice(0, 200) });
      }
    } catch (err) {
      log.error('deleteInstance erro inesperado', { instance: instanceName, ...errCtx(err) });
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
        log.error('sendText falhou', { instance: instanceName, phone, status: res.status, body: errText.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log.error('sendText erro inesperado', { instance: instanceName, phone, ...errCtx(err) });
      return null;
    }
  },

  async sendImage(instanceName: string, phone: string, mediaUrl: string, caption?: string): Promise<any> {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          number: phone,
          mediatype: 'image',
          media: mediaUrl,
          caption: caption ?? '',
          options: { delay: 1200, presence: 'composing' },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        log.error('sendImage falhou', { instance: instanceName, phone, status: res.status, body: errText.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log.error('sendImage erro inesperado', { instance: instanceName, phone, ...errCtx(err) });
      return null;
    }
  },

  async sendMediaBase64(instanceName: string, phone: string, mediatype: string, mimetype: string, base64: string, fileName?: string, caption?: string): Promise<any> {
    try {
      const res = await fetchWithTimeout(`${EVOLUTION_API_URL()}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          number: phone,
          mediatype,
          mimetype,
          media: base64,
          fileName: fileName ?? `arquivo.${mimetype?.split('/').pop() ?? 'bin'}`,
          caption: caption ?? '',
          options: { delay: 1200, presence: 'composing' },
        }),
      }, 60000);
      if (!res.ok) {
        const errText = await res.text();
        log.error('sendMediaBase64 falhou', { instance: instanceName, phone, mediatype, status: res.status, body: errText.slice(0, 200) });
        return null;
      }
      return await res.json();
    } catch (err) {
      log.error('sendMediaBase64 erro inesperado', { instance: instanceName, phone, mediatype, ...errCtx(err) });
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
        log.error('fetchInstances falhou', { status: res.status, body: text.slice(0, 200) });
        return [];
      }
      const data: any = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      log.error('fetchInstances erro inesperado', errCtx(err));
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
      log.debug('findChats resposta', { instance: instanceName, status: res.status, len: text.length });
      if (!res.ok) return [];
      try {
        const data: any = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch { return []; }
    } catch (err) {
      log.error('findChats erro inesperado', { instance: instanceName, ...errCtx(err) });
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
          body: JSON.stringify({ where: { key: { remoteJid } }, offset: msgLimit, page: 1 }),
        }, 15000);

        if (res.status === 404) continue; // Endpoint não existe nesta versão

        const text = await res.text();
        if (!res.ok) {
          log.warn('findMessages retornou erro', { instance: instanceName, path, status: res.status });
          continue;
        }

        try {
          const data: any = JSON.parse(text);
          const msgs = Array.isArray(data)
            ? data
            : Array.isArray(data?.messages?.records)
              ? data.messages.records
              : Array.isArray(data?.messages)
                ? data.messages
                : [];
          log.debug('findMessages OK', { instance: instanceName, path, count: msgs.length, total: data?.messages?.total ?? '?' });
          return msgs;
        } catch { continue; }
      } catch (err: any) {
        if (err?.name === 'AbortError') continue;
        log.warn('findMessages timeout/erro', { instance: instanceName, path, ...errCtx(err) });
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
      log.error('findContacts erro inesperado', { instance: instanceName, ...errCtx(err) });
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
        body: JSON.stringify({ where: { key: { id: waId } }, offset: 1, page: 1 }),
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
        log.warn('getInstanceInfo falhou', { instance: instanceName, status: res.status, body: text.slice(0, 200) });
        return null;
      }
      const data: any = await res.json();
      if (Array.isArray(data)) return data[0] ?? null;
      return data ?? null;
    } catch (err) {
      log.error('getInstanceInfo erro inesperado', { instance: instanceName, ...errCtx(err) });
      return null;
    }
  },
};
