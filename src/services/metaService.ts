import axios from 'axios';

export interface MetaMessage {
  canal: 'whatsapp' | 'instagram' | 'messenger';
  to: string;
  message: string;
  templateName?: string;
  languageCode?: string;
}

class MetaService {
  private accessToken: string;
  private whatsappId: string;

  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN || '';
    this.whatsappId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  /**
   * Unified Message Sender with Rate Limit handling
   */
  async sendMessage(config: MetaMessage) {
    try {
      switch (config.canal) {
        case 'whatsapp':
          return await this.sendWhatsApp(config);
        case 'instagram':
        case 'messenger':
          return await this.sendGraphMessage(config);
        default:
          throw new Error('Unsupported channel');
      }
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  private async sendWhatsApp(config: MetaMessage) {
    const url = `https://graph.facebook.com/v18.0/${this.whatsappId}/messages`;
    const payload = config.templateName 
      ? {
          messaging_product: "whatsapp",
          to: config.to,
          type: "template",
          template: {
            name: config.templateName,
            language: { code: config.languageCode || 'pt_BR' }
          }
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: config.to,
          type: "text",
          text: { preview_url: false, body: config.message }
        };

    const response = await axios.post(url, payload, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    this.logUsage(response.headers);
    return response.data;
  }

  private async sendGraphMessage(config: MetaMessage) {
    const url = `https://graph.facebook.com/v18.0/me/messages`;
    const payload = {
      recipient: { id: config.to },
      message: { text: config.message },
      messaging_type: "RESPONSE"
    };

    const response = await axios.post(url, payload, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    this.logUsage(response.headers);
    return response.data;
  }

  private logUsage(headers: any) {
    // Monitor Meta Rate Limits (Scalability Pillar)
    const appUsage = headers['x-app-usage'];
    if (appUsage) {
      console.log('Meta App Usage:', appUsage);
    }
  }

  private handleApiError(error: any) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data;
      console.error('Meta API Error:', JSON.stringify(data, null, 2));
      
      // Auto-Retry logic for rate limits or transient errors
      if (error.response?.status === 429) {
          console.warn('Rate limit hit. Implement backoff or queueing.');
      }
    }
  }
}

export const metaService = new MetaService();
