// Allow self-signed TLS certs (Evolution API VPS uses one). Safe in dev; production should use a valid cert.
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';
import { setIo } from './_api/lib/socketRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;

  const BODY_LIMIT = '25mb';
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
  console.log(`[SERVER] Body parser limit set to ${BODY_LIMIT} (was 100KB default)`);

  // Log only slow (>300ms) or error (4xx/5xx) requests
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (duration > 300 || res.statusCode >= 400) {
        console.log(`${new Date().toISOString()} [SERVER] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });

  app.get('/api/health', async (req, res) => {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;

    let evolution = 'not_configured';
    let postgres = 'not_configured';
    let redis = 'not_configured';

    if (evolutionUrl && evolutionKey) {
      try {
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(`${evolutionUrl.replace(/\/$/, '')}/instance/fetchInstances`, {
          headers: { apikey: evolutionKey },
          signal: ctrl.signal,
        }).finally(() => clearTimeout(id));
        if (r.ok || r.status === 401) {
          evolution = 'online';
          postgres = 'online';
          redis = 'online';
        } else {
          evolution = `error_${r.status}`;
        }
      } catch {
        evolution = 'offline';
      }
    }

    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'development',
      services: { evolution, postgres, redis },
    });
  });

  app.get('/favicon.ico', (req, res) => res.status(204).end());

  // â”€â”€ Datadog LLM Observability proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.post('/api/datadog/llm-obs', async (req, res) => {
    const apiKey = process.env.DD_API_KEY;
    const site   = process.env.DD_SITE || 'us5.datadoghq.com';

    if (!apiKey) return res.status(204).end();

    try {
      const response = await axios.post(
        `https://api.${site}/api/intake/llm-observability/v1/api/traces`,
        req.body,
        {
          headers: { 'DD-API-KEY': apiKey, 'Content-Type': 'application/json' },
          timeout: 5000,
        }
      );
      res.status(response.status).end();
    } catch (error: any) {
      console.error('[DD_LLM_OBS] Failed to forward span:', error?.response?.status, error?.message);
      res.status(204).end();
    }
  });

  // ── Meta / WhatsApp Cloud API routes ─────────────────────────────────────────
  const { handleVerify: metaVerify, handleEvent: metaEvent } = await import('./_api/webhook/whatsapp.js');
  const { default: metaSendHandler }          = await import('./_api/meta/send.js');
  const { default: metaStatusHandler }        = await import('./_api/meta/status.js');
  const { default: metaMessagesHandler }      = await import('./_api/meta/messages.js');
  const { default: metaConversationsHandler } = await import('./_api/meta/conversations.js');

  app.get('/api/webhook/whatsapp',   metaVerify);
  app.post('/api/webhook/whatsapp',  metaEvent);
  app.all('/api/meta/send',          metaSendHandler);
  app.all('/api/meta/status',        metaStatusHandler);
  app.all('/api/meta/messages',      metaMessagesHandler);
  app.all('/api/meta/conversations', metaConversationsHandler);
  console.log('[SERVER] Meta WhatsApp routes registradas');

  // ── Campaign routes ───────────────────────────────────────────────────────
  const { default: campaignsStartHandler } = await import('./_api/campaigns/start.js');
  const { default: campaignsPauseHandler } = await import('./_api/campaigns/pause.js');
  app.all('/api/campaigns/start', campaignsStartHandler);
  app.all('/api/campaigns/pause', campaignsPauseHandler);

  // Body-parser error handler (catches 413 before routes see it)
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      console.error(`[SERVER] 413 PayloadTooLarge â€” bumping body limit failed? Current=${BODY_LIMIT}`);
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', limit: BODY_LIMIT });
    }
    next(err);
  });

  // â”€â”€ OpenRouter Proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.post('/api/proxy/openrouter/request', async (req, res) => {
    const { apiKey, method, endpoint, data } = req.body;
    const bodySize = JSON.stringify(req.body || {}).length;
    console.log(`[PROXY-REQ] Endpoint=${endpoint} bytes=${bodySize}`);

    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });

    try {
      const host = req.get('host');
      const protocol = req.protocol;
      const referer = `${protocol}://${host}`;

      const response = await axios({
        method: method || 'GET',
        url: `https://openrouter.ai/api/v1${endpoint}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-OpenRouter-Title': 'Michelin Seguros CRM',
        },
        data: data || undefined,
        timeout: 30000,
        maxBodyLength: 15 * 1024 * 1024,
        maxContentLength: 15 * 1024 * 1024,
      });
      res.status(response.status).json(response.data);
    } catch (error: any) {
      const errorStatus = error.response?.status || 500;
      const errorData = error.response?.data || { error: error.message || 'Internal Server Error' };
      console.error(`[PROXY-REQ] Erro OpenRouter (${errorStatus}) em ${endpoint}:`, errorData);
      res.status(errorStatus).json(errorData);
    }
  });

  app.post('/api/proxy/openrouter/auth', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });

    try {
      const host = req.get('host');
      const protocol = req.protocol;
      const response = await axios.get('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': `${protocol}://${host}`,
          'X-OpenRouter-Title': 'Michelin Seguros CRM',
        },
        timeout: 10000,
      });
      res.json(response.data);
    } catch (error: any) {
      const errorStatus = error.response?.status || 500;
      const errorData = error.response?.data || { error: error.message || 'Internal Server Error' };
      console.error(`[PROXY] Erro OpenRouter (${errorStatus}):`, errorData);
      res.status(errorStatus).json(errorData);
    }
  });

  // â”€â”€ Evolution API routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { default: evolutionSessionsHandler }        = await import('./_api/evolution/sessions.js');
  const { default: evolutionQrHandler }              = await import('./_api/evolution/qr.js');
  const { default: evolutionSendHandler }            = await import('./_api/evolution/send.js');
  const { default: evolutionSyncHandler }            = await import('./_api/evolution/sync.js');
  const { default: evolutionConversationHandler }    = await import('./_api/evolution/conversation.js');
  const { default: evolutionConversationsHandler }   = await import('./_api/evolution/conversations.js');
  const { default: evolutionMessagesHandler }        = await import('./_api/evolution/messages.js');
  const { default: evolutionReconcileHandler, scheduleReconcile } = await import('./_api/evolution/reconcile.js');
  const { default: evolutionMediaHandler }            = await import('./_api/evolution/media.js');
  const { default: evolutionStatsHandler }           = await import('./_api/evolution/stats.js');
  const { default: evolutionWebhookHandler }         = await import('./_api/webhook/evolution.js');

  app.all('/api/evolution/sessions',      evolutionSessionsHandler);
  app.all('/api/evolution/qr',            evolutionQrHandler);
  app.all('/api/evolution/send',          evolutionSendHandler);
  app.all('/api/evolution/sync',          evolutionSyncHandler);
  app.all('/api/evolution/conversation',  evolutionConversationHandler);
  app.all('/api/evolution/conversations', evolutionConversationsHandler);
  app.all('/api/evolution/messages',      evolutionMessagesHandler);
  app.all('/api/evolution/reconcile',     evolutionReconcileHandler);
  app.all('/api/evolution/media',         evolutionMediaHandler);
  app.all('/api/evolution/stats',         evolutionStatsHandler);
  // byEvents:true faz a Evolution API enviar para sub-caminhos (ex: /messages-upsert)
  app.all('/api/webhook/evolution', evolutionWebhookHandler);
  app.all('/api/webhook/evolution/:event', evolutionWebhookHandler);

  scheduleReconcile(5 * 60 * 1000);
  console.log('[SERVER] Evolution API routes registradas');

  // â”€â”€ Email Module routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { default: emailAccountsHandler }        = await import('./_api/email/accounts.js');
  const { default: emailGmailAuthHandler }        = await import('./_api/email/auth/gmail.js');
  const { default: emailMicrosoftAuthHandler }    = await import('./_api/email/auth/microsoft.js');
  const { default: emailMessagesHandler }         = await import('./_api/email/messages.js');
  const { default: emailSendHandler }             = await import('./_api/email/send.js');
  const { default: emailActionHandler }           = await import('./_api/email/action.js');
  const { default: emailDraftHandler }            = await import('./_api/email/draft.js');
  const { default: emailSyncHandler }             = await import('./_api/email/sync.js');
  const { default: emailSearchHandler }           = await import('./_api/email/search.js');
  const { default: emailSettingsHandler }         = await import('./_api/email/settings.js');
  const { default: emailStatsHandler }            = await import('./_api/email/stats.js');
  const { scheduleEmailSync }                     = await import('./_api/lib/emailSync.js');

  app.all('/api/email/accounts',            emailAccountsHandler);
  app.all('/api/email/auth/gmail/init',     emailGmailAuthHandler);
  app.all('/api/email/auth/gmail/callback', emailGmailAuthHandler);
  app.all('/api/email/auth/microsoft/init',     emailMicrosoftAuthHandler);
  app.all('/api/email/auth/microsoft/callback', emailMicrosoftAuthHandler);
  app.all('/api/email/messages',            emailMessagesHandler);
  app.all('/api/email/messages/:id',        emailMessagesHandler);
  app.all('/api/email/send',                emailSendHandler);
  app.all('/api/email/action',              emailActionHandler);
  app.all('/api/email/drafts',              emailDraftHandler);
  app.all('/api/email/draft',               emailDraftHandler);
  app.all('/api/email/draft/:id',           emailDraftHandler);
  app.all('/api/email/sync',                emailSyncHandler);
  app.all('/api/email/search',              emailSearchHandler);
  app.all('/api/email/settings',            emailSettingsHandler);
  app.all('/api/email/stats',               emailStatsHandler);

  scheduleEmailSync(5 * 60 * 1000);
  console.log('[SERVER] Email Module routes registradas');

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // â”€â”€ HTTP server + Socket.IO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  setIo(io as any);

  io.on('connection', socket => {
    socket.on('join_session', (sessionName: string) => {
      socket.join(`session:${sessionName}`);
      console.log(`[SOCKET] ${socket.id} joined session:${sessionName}`);
    });
    socket.on('leave_session', (sessionName: string) => {
      socket.leave(`session:${sessionName}`);
    });
  });

  console.log('[SERVER] Socket.IO inicializado');

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
