// Single Vercel serverless function — all /api/* routes via Express
// Socket.IO not supported in serverless; emitToSession fails silently (optional chain)

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from 'express';
import axios from 'axios';

import evolutionSessionsHandler from './evolution/sessions.js';
import evolutionQrHandler from './evolution/qr.js';
import evolutionSendHandler from './evolution/send.js';
import evolutionSyncHandler from './evolution/sync.js';
import evolutionConversationHandler from './evolution/conversation.js';
import evolutionConversationsHandler from './evolution/conversations.js';
import evolutionMessagesHandler from './evolution/messages.js';
import evolutionReconcileHandler, { runReconcile } from './evolution/reconcile.js';
import evolutionMediaHandler from './evolution/media.js';
import evolutionStatsHandler from './evolution/stats.js';
import evolutionWebhookHandler from './webhook/evolution.js';
import whatsappWebhookHandler, { handleVerify, handleEvent } from './webhook/whatsapp.js';
import metaSendHandler from './meta/send.js';
import metaStatusHandler from './meta/status.js';

import emailAccountsHandler from './email/accounts.js';
import emailGmailAuthHandler from './email/auth/gmail.js';
import emailMicrosoftAuthHandler from './email/auth/microsoft.js';
import emailMessagesHandler from './email/messages.js';
import emailSendHandler from './email/send.js';
import emailActionHandler from './email/action.js';
import emailDraftHandler from './email/draft.js';
import emailSyncHandler from './email/sync.js';
import emailSearchHandler from './email/search.js';
import emailSettingsHandler from './email/settings.js';
import emailStatsHandler from './email/stats.js';
import { syncAllAccounts } from './lib/emailSync.js';

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

// Meta WhatsApp Cloud API
app.get('/api/webhook/whatsapp',  handleVerify);
app.post('/api/webhook/whatsapp', handleEvent);
app.get('/api/meta/status',       metaStatusHandler);
app.post('/api/meta/send',        metaSendHandler);

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
