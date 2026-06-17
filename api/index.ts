// Single Vercel serverless function — all /api/* routes via Express
// Socket.IO not supported in serverless; emitToSession fails silently (optional chain)

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from 'express';
import axios from 'axios';

import evolutionSessionsHandler from '../_api/evolution/sessions.js';
import evolutionQrHandler from '../_api/evolution/qr.js';
import evolutionSendHandler from '../_api/evolution/send.js';
import evolutionSyncHandler from '../_api/evolution/sync.js';
import evolutionConversationHandler from '../_api/evolution/conversation.js';
import evolutionConversationsHandler from '../_api/evolution/conversations.js';
import evolutionMessagesHandler from '../_api/evolution/messages.js';
import evolutionReconcileHandler, { runReconcile } from '../_api/evolution/reconcile.js';
import evolutionMediaHandler from '../_api/evolution/media.js';
import evolutionStatsHandler from '../_api/evolution/stats.js';
import evolutionWebhookHandler from '../_api/webhook/evolution.js';

import emailAccountsHandler from '../_api/email/accounts.js';
import emailGmailAuthHandler from '../_api/email/auth/gmail.js';
import emailMicrosoftAuthHandler from '../_api/email/auth/microsoft.js';
import emailMessagesHandler from '../_api/email/messages.js';
import emailSendHandler from '../_api/email/send.js';
import emailActionHandler from '../_api/email/action.js';
import emailDraftHandler from '../_api/email/draft.js';
import emailSyncHandler from '../_api/email/sync.js';
import emailSearchHandler from '../_api/email/search.js';
import emailSettingsHandler from '../_api/email/settings.js';
import emailStatsHandler from '../_api/email/stats.js';
import { syncAllAccounts } from '../_api/lib/emailSync.js';

const app = express();
const BODY_LIMIT = '25mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

app.use((err: any, _req: any, res: any, next: any) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
  }
  next(err);
});

app.get('/api/health', (_req: any, res: any) =>
  res.json({ status: 'ok', time: new Date().toISOString() }));

app.get('/favicon.ico', (_req: any, res: any) => res.status(204).end());

// Datadog proxy
app.post('/api/datadog/llm-obs', async (req: any, res: any) => {
  const apiKey = process.env.DD_API_KEY;
  const site = process.env.DD_SITE || 'us5.datadoghq.com';
  if (!apiKey) return res.status(204).end();
  try {
    const r = await axios.post(
      `https://api.${site}/api/intake/llm-observability/v1/api/traces`,
      req.body,
      { headers: { 'DD-API-KEY': apiKey, 'Content-Type': 'application/json' }, timeout: 5000 },
    );
    res.status(r.status).end();
  } catch { res.status(204).end(); }
});

// WhatsApp Webhook
app.get('/api/webhook/whatsapp', (req: any, res: any) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) res.status(200).send(challenge);
  else res.sendStatus(403);
});
app.post('/api/webhook/whatsapp', (req: any, res: any) => {
  if (req.body?.object === 'whatsapp_business_account') res.sendStatus(200);
  else res.sendStatus(404);
});

// OpenRouter proxy
app.post('/api/proxy/openrouter/request', async (req: any, res: any) => {
  const { apiKey, method, endpoint, data } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key is required' });
  try {
    const r = await axios({
      method: method || 'GET',
      url: `https://openrouter.ai/api/v1${endpoint}`,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        'HTTP-Referer': `https://${req.get('host')}`, 'X-OpenRouter-Title': 'Michelin Seguros CRM' },
      data: data || undefined, timeout: 30000,
      maxBodyLength: 15 * 1024 * 1024, maxContentLength: 15 * 1024 * 1024,
    });
    res.status(r.status).json(r.data);
  } catch (e: any) { res.status(e.response?.status || 500).json(e.response?.data || { error: e.message }); }
});

app.post('/api/proxy/openrouter/auth', async (req: any, res: any) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key is required' });
  try {
    const r = await axios.get('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': `https://${req.get('host')}`,
        'X-OpenRouter-Title': 'Michelin Seguros CRM' }, timeout: 10000,
    });
    res.json(r.data);
  } catch (e: any) { res.status(e.response?.status || 500).json(e.response?.data || { error: e.message }); }
});

// Evolution routes
app.all('/api/evolution/sessions',       evolutionSessionsHandler);
app.all('/api/evolution/qr',             evolutionQrHandler);
app.all('/api/evolution/send',           evolutionSendHandler);
app.all('/api/evolution/sync',           evolutionSyncHandler);
app.all('/api/evolution/conversation',   evolutionConversationHandler);
app.all('/api/evolution/conversations',  evolutionConversationsHandler);
app.all('/api/evolution/messages',       evolutionMessagesHandler);
app.all('/api/evolution/reconcile',      evolutionReconcileHandler);
app.all('/api/evolution/media',          evolutionMediaHandler);
app.all('/api/evolution/stats',          evolutionStatsHandler);
app.all('/api/webhook/evolution',        evolutionWebhookHandler);
app.all('/api/webhook/evolution/:event', evolutionWebhookHandler);

app.post('/api/cron/reconcile',  async (_req: any, res: any) => { runReconcile().catch(console.error); res.json({ ok: true }); });
app.post('/api/cron/email-sync', async (_req: any, res: any) => { syncAllAccounts().catch(console.error); res.json({ ok: true }); });

// Email routes
app.all('/api/email/accounts',                emailAccountsHandler);
app.all('/api/email/auth/gmail/init',         emailGmailAuthHandler);
app.all('/api/email/auth/gmail/callback',     emailGmailAuthHandler);
app.all('/api/email/auth/microsoft/init',     emailMicrosoftAuthHandler);
app.all('/api/email/auth/microsoft/callback', emailMicrosoftAuthHandler);
app.all('/api/email/messages',                emailMessagesHandler);
app.all('/api/email/messages/:id',            emailMessagesHandler);
app.all('/api/email/send',                    emailSendHandler);
app.all('/api/email/action',                  emailActionHandler);
app.all('/api/email/drafts',                  emailDraftHandler);
app.all('/api/email/draft',                   emailDraftHandler);
app.all('/api/email/draft/:id',               emailDraftHandler);
app.all('/api/email/sync',                    emailSyncHandler);
app.all('/api/email/search',                  emailSearchHandler);
app.all('/api/email/settings',                emailSettingsHandler);
app.all('/api/email/stats',                   emailStatsHandler);

export default app;
