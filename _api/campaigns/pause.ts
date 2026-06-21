import { fsUpdate } from '../lib/adminFirebase.js';
import { setCampaignRunnerState } from './start.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { campaignId } = req.body ?? {};
  if (!campaignId) return res.status(400).json({ error: 'campaignId obrigatório' });

  setCampaignRunnerState(campaignId, 'paused');
  await fsUpdate('campaigns', campaignId, { status: 'paused', updatedAt: new Date().toISOString() });

  return res.status(200).json({ success: true });
}
