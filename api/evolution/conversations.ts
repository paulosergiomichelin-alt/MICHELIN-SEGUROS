import { getConversations, cacheStats } from '../lib/conversationCache.js';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session } = req.query ?? {};
  if (!session) {
    return res.status(400).json({ error: 'session é obrigatório' });
  }

  const convs = getConversations(String(session));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(convs);
}
