import { EvolutionAPI } from '../lib/evolutionApi.js';
import { getConversations } from '../lib/conversationCache.js';

export interface WAContactResult {
  phone: string;
  name: string;
  picture?: string;
  hasChat: boolean;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();

  const { session } = req.query ?? {};
  if (!session) return res.status(400).json({ error: 'session é obrigatório' });

  const sessionName = String(session);

  try {
    const rawContacts = await EvolutionAPI.findContacts(sessionName);
    const conversations = getConversations(sessionName);
    const convPhones = new Set(conversations.map(c => c.phone));

    const result: WAContactResult[] = rawContacts
      .filter(c => {
        const jid: string = c.remoteJid ?? c.id ?? '';
        return jid && !jid.includes('@g.us') && !jid.startsWith('cm') && !jid.includes('@lid');
      })
      .map(c => {
        const jid: string = c.remoteJid ?? c.id ?? '';
        const phone = jid
          .replace(/@s\.whatsapp\.net$|@c\.us$|@g\.us$/, '')
          .replace(/:\d+$/, '');
        const name: string = c.pushName || c.notify || c.name || phone;
        const picture: string | undefined = c.profilePicUrl ?? c.profilePictureUrl ?? undefined;
        return { phone, name, picture, hasChat: convPhones.has(phone) };
      })
      .filter(c => c.phone && c.phone.length >= 8)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    return res.json(result);
  } catch (err: any) {
    console.error('[EVOLUTION/contacts] erro:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
}
