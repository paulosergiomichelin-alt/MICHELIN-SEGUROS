// Allow self-signed TLS certs (Evolution API VPS uses one). Safe in dev; production should use a valid cert.
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;

  // Image OCR payloads carry JPEG base64 (~150-300KB). Default 100KB limit caused HTTP 413.
  // Bumped to 25MB to comfortably fit any document image; refuses larger payloads outright.
  const BODY_LIMIT = '25mb';
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
  console.log(`[SERVER] Body parser limit set to ${BODY_LIMIT} (was 100KB default)`);

  // Log only slow (>300ms) or error (4xx/5xx) requests to reduce noise
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
          // If Evolution API is responding, its dependencies are up
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

  // ── Datadog LLM Observability proxy ────────────────────────────────────────
  // Forwards browser-collected LLM spans to Datadog without exposing the API key.
  app.post('/api/datadog/llm-obs', async (req, res) => {
    const apiKey = process.env.DD_API_KEY;
    const site   = process.env.DD_SITE || 'us5.datadoghq.com';

    if (!apiKey) {
      // DD not configured — silently drop the span so the app keeps working
      return res.status(204).end();
    }

    try {
      const response = await axios.post(
        `https://api.${site}/api/intake/llm-observability/v1/api/traces`,
        req.body,
        {
          headers: {
            'DD-API-KEY':   apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
      res.status(response.status).end();
    } catch (error: any) {
      // Never propagate DD errors to the client
      console.error('[DD_LLM_OBS] Failed to forward span:', error?.response?.status, error?.message);
      res.status(204).end();
    }
  });

  // ── WhatsApp Webhook ───────────────────────────────────────────────────────
  // GET: verificação de propriedade pelo Meta (chamado 1x ao cadastrar o webhook)
  app.get('/api/webhook/whatsapp', (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WHATSAPP_WEBHOOK] Verificação concluída com sucesso');
      res.status(200).send(challenge); // Meta exige a resposta como texto simples
    } else {
      console.warn('[WHATSAPP_WEBHOOK] Falha na verificação — token inválido');
      res.sendStatus(403);
    }
  });

  // POST: recebe mensagens e eventos do WhatsApp em tempo real
  app.post('/api/webhook/whatsapp', (req, res) => {
    const body = req.body;

    if (body?.object === 'whatsapp_business_account') {
      const entries = body.entry ?? [];
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          if (change.field === 'messages') {
            const messages = change.value?.messages ?? [];
            const statuses = change.value?.statuses ?? [];

            for (const msg of messages) {
              console.log('[WHATSAPP_WEBHOOK] Mensagem recebida:', JSON.stringify(msg));
              // TODO: processar mensagem recebida (ex: criar lead, responder via IA)
            }

            for (const status of statuses) {
              console.log('[WHATSAPP_WEBHOOK] Status de entrega:', status.id, '->', status.status);
            }
          }
        }
      }
      res.sendStatus(200); // Meta exige 200 em até 20s ou vai retentar
    } else {
      res.sendStatus(404);
    }
  });

  // Body-parser error handler (catches 413 before routes see it).
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      console.error(`[SERVER] 413 PayloadTooLarge — bumping body limit failed? Current=${BODY_LIMIT}`);
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', limit: BODY_LIMIT });
    }
    next(err);
  });

  // Proxy Genérico para OpenRouter (suporta validação completa)
  app.post('/api/proxy/openrouter/request', async (req, res) => {
    const { apiKey, method, endpoint, data } = req.body;
    const bodySize = JSON.stringify(req.body || {}).length;
    console.log(`[PROXY-REQ] Endpoint=${endpoint} bytes=${bodySize}`);

    if (!apiKey) {
      return res.status(400).json({ error: 'API Key is required' });
    }

    try {
      const host = req.get('host');
      const protocol = req.protocol;
      const referer = `${protocol}://${host}`;

      const config = {
        method: method || 'GET',
        url: `https://openrouter.ai/api/v1${endpoint}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-OpenRouter-Title': 'Michelin Seguros CRM'
        },
        data: data || undefined,
        timeout: 30000,
        maxBodyLength: 15 * 1024 * 1024,
        maxContentLength: 15 * 1024 * 1024
      };

      const response = await axios(config);
      res.status(response.status).json(response.data);
    } catch (error: any) {
      const errorStatus = error.response?.status || 500;
      const errorData = error.response?.data || { error: error.message || 'Internal Server Error' };
      console.error(`[PROXY-REQ] Erro OpenRouter (${errorStatus}) em ${endpoint}:`, errorData);
      res.status(errorStatus).json(errorData);
    }
  });

  // Proxy para OpenRouter Auth/Usage
  app.post('/api/proxy/openrouter/auth', async (req, res) => {
    console.log('[PROXY] Recebida requisição de autenticação OpenRouter');
    const { apiKey } = req.body;

    if (!apiKey) {
      console.warn('[PROXY] API Key ausente na requisição');
      return res.status(400).json({ error: 'API Key is required' });
    }

    try {
      const host = req.get('host');
      const protocol = req.protocol;
      const referer = `${protocol}://${host}`;
      
      console.log(`[PROXY] Chamando OpenRouter API com referer: ${referer}`);
      
      const response = await axios.get('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-OpenRouter-Title': 'Michelin Seguros CRM'
        },
        timeout: 10000 // 10s timeout
      });
      console.log('[PROXY] Resposta OpenRouter recebida com sucesso');
      res.json(response.data);
    } catch (error: any) {
      const errorStatus = error.response?.status || 500;
      const errorData = error.response?.data || { error: error.message || 'Internal Server Error' };
      console.error(`[PROXY] Erro OpenRouter (${errorStatus}):`, errorData);
      res.status(errorStatus).json(errorData);
    }
  });

  // ── Evolution API routes ────────────────────────────────────────────────────
  // Handlers are imported dynamically (ESM) to share the same module instances
  // as the Vercel serverless functions in the api/ directory.
  const { default: evolutionSessionsHandler }        = await import('./api/evolution/sessions.js');
  const { default: evolutionQrHandler }              = await import('./api/evolution/qr.js');
  const { default: evolutionSendHandler }            = await import('./api/evolution/send.js');
  const { default: evolutionSyncHandler }            = await import('./api/evolution/sync.js');
  const { default: evolutionConversationHandler }    = await import('./api/evolution/conversation.js');
  const { default: evolutionConversationsHandler }   = await import('./api/evolution/conversations.js');
  const { default: evolutionMessagesHandler }        = await import('./api/evolution/messages.js');
  const { default: evolutionReconcileHandler, scheduleReconcile } = await import('./api/evolution/reconcile.js');
  const { default: evolutionStatsHandler }           = await import('./api/evolution/stats.js');
  const { default: evolutionWebhookHandler }         = await import('./api/webhook/evolution.js');

  app.all('/api/evolution/sessions',      evolutionSessionsHandler);
  app.all('/api/evolution/qr',            evolutionQrHandler);
  app.all('/api/evolution/send',          evolutionSendHandler);
  app.all('/api/evolution/sync',          evolutionSyncHandler);
  app.all('/api/evolution/conversation',  evolutionConversationHandler);
  app.all('/api/evolution/conversations', evolutionConversationsHandler);
  app.all('/api/evolution/messages',      evolutionMessagesHandler);
  app.all('/api/evolution/reconcile',     evolutionReconcileHandler);
  app.all('/api/evolution/stats',         evolutionStatsHandler);
  app.all('/api/webhook/evolution',       evolutionWebhookHandler);

  // Reconciliação automática a cada 5 minutos (começa após 2 min para não sobrecarregar o boot)
  scheduleReconcile(5 * 60 * 1000);

  console.log('[SERVER] Evolution API routes registradas');

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
