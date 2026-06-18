import axios, { AxiosError } from 'axios';

const GRAPH_URL = 'https://graph.facebook.com/v23.0';
const MAX_RETRIES = 3;
const TIMEOUT_MS = 15000;

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error('[MetaAPI] META_ACCESS_TOKEN não definida');
  return t;
}

function phoneNumberId(): string {
  const id = process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error('[MetaAPI] META_PHONE_NUMBER_ID não definida');
  return id;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token()}`,
    'Content-Type': 'application/json',
  };
}

async function post(endpoint: string, data: any, retries = MAX_RETRIES): Promise<any> {
  const url = `${GRAPH_URL}${endpoint}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(url, data, {
        headers: authHeaders(),
        timeout: TIMEOUT_MS,
      });
      return res.data;
    } catch (err) {
      const axErr = err as AxiosError<any>;
      const status = axErr.response?.status ?? 0;
      const errData = axErr.response?.data;
      const code = errData?.error?.code;

      if (status === 429 || code === 80007) {
        const wait = attempt * 3000;
        console.warn(`[MetaAPI] Rate limit (tentativa ${attempt}/${retries}), aguardando ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (attempt < retries && (status >= 500 || status === 0)) {
        console.warn(`[MetaAPI] Erro ${status} em ${endpoint}, retry ${attempt}/${retries}`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      console.error(`[MetaAPI] POST ${endpoint} falhou (${status}):`, JSON.stringify(errData));
      throw new Error(`MetaAPI error ${status}: ${errData?.error?.message ?? axErr.message}`);
    }
  }
}

async function get(endpoint: string): Promise<any> {
  const url = `${GRAPH_URL}${endpoint}`;
  try {
    const res = await axios.get(url, { headers: authHeaders(), timeout: TIMEOUT_MS });
    return res.data;
  } catch (err) {
    const axErr = err as AxiosError<any>;
    const status = axErr.response?.status ?? 0;
    const errData = axErr.response?.data;
    console.error(`[MetaAPI] GET ${endpoint} falhou (${status}):`, JSON.stringify(errData));
    throw new Error(`MetaAPI error ${status}: ${errData?.error?.message ?? axErr.message}`);
  }
}

export const MetaAPI = {
  async sendText(to: string, body: string): Promise<any> {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendText → ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body },
    });
  },

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<any> {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendImage → ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    });
  },

  async sendDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<any> {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendDocument → ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'document',
      document: { link: documentUrl, filename, ...(caption ? { caption } : {}) },
    });
  },

  async sendAudio(to: string, audioUrl: string): Promise<any> {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendAudio → ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'audio',
      audio: { link: audioUrl },
    });
  },

  async sendTemplate(to: string, templateName: string, languageCode: string, components?: any[]): Promise<any> {
    const phone = normalizePhone(to);
    console.log(`[MetaAPI] sendTemplate '${templateName}' → ${phone}`);
    return post(`/${phoneNumberId()}/messages`, {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    });
  },

  async markAsRead(messageId: string): Promise<any> {
    try {
      return await post(`/${phoneNumberId()}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch (err) {
      // Non-fatal — log and continue
      console.warn(`[MetaAPI] markAsRead ${messageId} falhou:`, err);
      return null;
    }
  },

  async downloadMedia(mediaId: string): Promise<{ url: string; mimeType: string; fileSize: number } | null> {
    try {
      const info = await get(`/${mediaId}`);
      return { url: info.url, mimeType: info.mime_type, fileSize: info.file_size };
    } catch (err) {
      console.error(`[MetaAPI] downloadMedia ${mediaId} falhou:`, err);
      return null;
    }
  },

  async getPhoneNumberInfo(): Promise<any> {
    return get(`/${phoneNumberId()}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,throughput,webhook_configuration`);
  },

  async getProfile(wabaId?: string): Promise<any> {
    const id = wabaId ?? process.env.META_WABA_ID;
    if (!id) return null;
    return get(`/${id}?fields=id,name,timezone_id,currency,message_template_namespace`);
  },

  async validateToken(): Promise<{ valid: boolean; name?: string; id?: string; error?: string }> {
    try {
      const data = await get('/me');
      return { valid: true, name: data.name, id: data.id };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  },
};

function normalizePhone(phone: string): string {
  // Remove all non-digits and ensure it starts without +
  return phone.replace(/\D/g, '');
}
