import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';
import { setIo } from './_api/lib/socketRegistry.js';
import { log, errCtx } from './_api/lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Process-level error guards ───────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  log.error('uncaughtException — processo pode encerrar', errCtx(err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', errCtx(reason));
});

// ── Request ID counter ───────────────────────────────────────────────────────
let reqCounter = 0;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 3000 : 3001);

  // CORS — permite Vercel frontend + localhost dev
  const corsOrigins = (process.env.CORS_ORIGIN || 'https://michelin-seguros.vercel.app,http://localhost:3000')
    .split(',').map(s => s.trim());
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && (corsOrigins.includes(origin) || corsOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-ID');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
  });

  const BODY_LIMIT = '25mb';
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
  log.info('Body parser configurado', { limit: BODY_LIMIT });
  log.info('Feature flag USE_POSTGRES', { value: process.env.USE_POSTGRES === 'true' });

  // Atribui X-Request-ID a cada requisição e loga slow/error requests
  app.use((req: any, res, next) => {
    const reqId = `r${++reqCounter}_${Date.now()}`;
    req.reqId = reqId;
    res.setHeader('X-Request-ID', reqId);

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      if (duration > 300 || status >= 400) {
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
          ?? req.socket?.remoteAddress
          ?? '?';
        const ctx = { reqId, method: req.method, path: req.url, status, duration_ms: duration, ip };
        if (status >= 500) log.error('Request com erro 5xx', ctx);
        else if (status >= 400) log.warn('Request com erro 4xx', ctx);
        else log.info('Request lento', ctx);
      }
    });
    next();
  });

  app.get('/api/health', async (req, res) => {
    let postgres = 'not_configured';

    if (process.env.DATABASE_URL) {
      try {
        const { getDb } = await import('./_api/lib/db.js');
        const { sql } = await import('drizzle-orm');
        await getDb().execute(sql`select 1`);
        postgres = 'online';
      } catch {
        postgres = 'offline';
      }
    }

    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'development',
      services: { postgres },
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
      log.warn('DD LLM Obs: falha ao repassar span', { dd_status: error?.response?.status, err_msg: error?.message });
      res.status(204).end();
    }
  });

  // ── API genérica de dados (Postgres/Neon) — migração gradual do Firestore ────
  const { dataRouter } = await import('./_api/data/router.js');
  app.use('/api/data', dataRouter);

  const { clientesRouter } = await import('./_api/data/clientesRouter.js');
  app.use('/api/data/clientes', clientesRouter);

  // Equivalente ao collectionGroup(db, 'apolices') — apólices de TODOS os clientes da
  // organização. Fora do clientesRouter porque não é aninhada sob um :clienteId.
  const { requireAuth: requireAuthForApolices } = await import('./_api/lib/authMiddleware.js');
  const { loadTenantContext: loadTenantForApolices } = await import('./_api/data/tenantMiddleware.js');
  const { getDb: getDbForApolices } = await import('./_api/lib/db.js');
  const { eq: eqForApolices, and: andForApolices, inArray: inArrayForApolices } = await import('drizzle-orm');
  const { clienteApolices: clienteApolicesTable, clientes: clientesTable } = await import('./_api/db/schema/index.js');

  const { normalizeTimestamps: normalizeTimestampsForApolices } = await import('./_api/lib/normalizeTimestamps.js');

  app.get('/api/data/apolices', requireAuthForApolices, loadTenantForApolices, async (req: any, res: any) => {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.split(',') : null;
    const orgClause = req.userSuperadmin ? undefined : eqForApolices(clientesTable.organizationId, req.organizationId);
    const statusClause = statusFilter ? inArrayForApolices(clienteApolicesTable.status, statusFilter) : undefined;
    const clauses = [orgClause, statusClause].filter(Boolean);
    const rows = await getDbForApolices().select().from(clienteApolicesTable)
      .innerJoin(clientesTable, eqForApolices(clienteApolicesTable.clienteId, clientesTable.id))
      .where(clauses.length ? andForApolices(...clauses) : undefined);
    res.json(normalizeTimestampsForApolices(rows.map((r: any) => r.cliente_apolices)));
  });

  log.info('API genérica de dados (Postgres) registrada em /api/data');

  // Body-parser error handler (catches 413 before routes see it)
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      log.error('413 PayloadTooLarge', { limit: BODY_LIMIT });
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
      log.error('OpenRouter proxy falhou', { endpoint, status: errorStatus, err_msg: error.message });
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
      log.error('OpenRouter auth falhou', { status: errorStatus, err_msg: error.message });
      res.status(errorStatus).json(errorData);
    }
  });

  // â”€â”€ Email Module routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { default: emailAccountsHandler }        = await import('./_api/email/accounts.js');
  const { default: emailGmailAuthHandler }        = await import('./_api/email/auth/gmail.js');
  const { default: emailMicrosoftAuthHandler }    = await import('./_api/email/auth/microsoft.js');
  const { default: emailGmailCalendarAuthHandler }     = await import('./_api/email/auth/gmail-calendar.js');
  const { default: emailMicrosoftCalendarAuthHandler } = await import('./_api/email/auth/microsoft-calendar.js');
  const { default: emailMessagesHandler }         = await import('./_api/email/messages.js');
  const { default: emailFoldersHandler }          = await import('./_api/email/folders.js');
  const { default: emailSendHandler }             = await import('./_api/email/send.js');
  const { default: emailActionHandler }           = await import('./_api/email/action.js');
  const { default: emailDraftHandler }            = await import('./_api/email/draft.js');
  const { default: emailSyncHandler }             = await import('./_api/email/sync.js');
  const { default: emailRulesRunHandler }         = await import('./_api/email/rules-run.js');
  const { default: emailSearchHandler }           = await import('./_api/email/search.js');
  const { default: emailSettingsHandler }         = await import('./_api/email/settings.js');
  const { default: emailStatsHandler }            = await import('./_api/email/stats.js');
  const { scheduleEmailSync }                     = await import('./_api/lib/emailSync.js');

  app.all('/api/email/accounts',            emailAccountsHandler);
  app.all('/api/email/auth/gmail/init',     emailGmailAuthHandler);
  app.all('/api/email/auth/gmail/callback', emailGmailAuthHandler);
  app.all('/api/email/auth/microsoft/init',     emailMicrosoftAuthHandler);
  app.all('/api/email/auth/microsoft/callback', emailMicrosoftAuthHandler);
  app.all('/api/email/auth/gmail/calendar-init',         emailGmailCalendarAuthHandler);
  app.all('/api/email/auth/gmail/calendar-callback',     emailGmailCalendarAuthHandler);
  app.all('/api/email/auth/microsoft/calendar-init',     emailMicrosoftCalendarAuthHandler);
  app.all('/api/email/auth/microsoft/calendar-callback', emailMicrosoftCalendarAuthHandler);
  app.all('/api/email/messages',            emailMessagesHandler);
  app.all('/api/email/messages/:id',        emailMessagesHandler);
  app.all('/api/email/folders',             emailFoldersHandler);
  app.all('/api/email/folders/:id',         emailFoldersHandler);
  app.all('/api/email/folders/:id/empty',   emailFoldersHandler);
  app.all('/api/email/folders/:id/read-all', emailFoldersHandler);
  app.all('/api/email/folders/:id/move-folder', emailFoldersHandler);
  app.all('/api/email/send',                emailSendHandler);
  app.all('/api/email/action',              emailActionHandler);
  app.all('/api/email/drafts',              emailDraftHandler);
  app.all('/api/email/draft',               emailDraftHandler);
  app.all('/api/email/draft/:id',           emailDraftHandler);
  app.all('/api/email/sync',                emailSyncHandler);
  app.all('/api/email/rules/run',           emailRulesRunHandler);
  app.all('/api/email/search',              emailSearchHandler);
  app.all('/api/email/settings',            emailSettingsHandler);
  app.all('/api/email/stats',               emailStatsHandler);

  scheduleEmailSync(5 * 60 * 1000);
  log.info('Email Module routes registradas');

  // ── Calendar Module routes ───────────────────────────────────────────────────
  const { default: calendarEventsHandler } = await import('./_api/calendar/events.js');
  app.all('/api/calendar/events',     calendarEventsHandler);
  app.all('/api/calendar/events/:id', calendarEventsHandler);
  log.info('Calendar Module routes registradas');

  // ── CNPJ lookup (BrasilAPI) ───────────────────────────────────────────────────
  const { requireAuth: requireAuthForCnpj } = await import('./_api/lib/authMiddleware.js');
  const { default: cnpjLookupHandler } = await import('./_api/cnpj/lookup.js');
  app.get('/api/cnpj/:cnpj', requireAuthForCnpj, cnpjLookupHandler);
  log.info('Rota de busca de CNPJ registrada');

  // ── Proxy de download de documentos (Firebase Storage não tem CORS liberado) ──
  const { default: documentsFetchHandler } = await import('./_api/documents/fetch.js');
  app.get('/api/documents/fetch', requireAuthForCnpj, documentsFetchHandler);
  log.info('Rota de proxy de documentos registrada');

  // ── Multicálculo / Seguradoras ────────────────────────────────────────────────
  const { insurersRouter } = await import('./_api/insurers/router.js');
  app.use('/api/insurers', insurersRouter);
  log.info('Rotas de multicálculo/seguradoras registradas');

  if (process.env.NODE_ENV === 'production' && process.env.SERVE_STATIC !== 'false') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    log.info('Servindo frontend estático', { distPath });
  }

  // ── Global Express error handler ──────────────────────────────────────────
  app.use((err: any, req: any, res: any, _next: any) => {
    const status: number = err.status ?? err.statusCode ?? 500;
    log.error('Erro Express não tratado', {
      method: req.method,
      path: req.path,
      reqId: req.reqId,
      status,
      ...errCtx(err),
    });
    if (res.headersSent) return;
    res.status(status).json({ error: err.message ?? 'Internal Server Error' });
  });

  // ── HTTP server + Socket.IO ────────────────────────────────────────────────
  const httpServer = createServer(app);

  // Log HTTP-level para diagnosticar se polling chega ao VPS (via Vercel rewrite)
  httpServer.prependListener('request', (req: any, _res: any) => {
    if (req.url?.startsWith('/socket.io')) {
      log.info('[DIAG] socket.io HTTP', {
        method: req.method,
        url: (req.url as string).substring(0, 150),
        origin: req.headers.origin,
        host: req.headers.host,
        fwd: req.headers['x-forwarded-for'],
      });
    }
  });

  const corsOriginList = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s: string) => s.trim())
    : ['*'];

  log.info('Socket.IO CORS config', { origins: corsOriginList });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOriginList.length === 1 && corsOriginList[0] === '*' ? '*' : corsOriginList,
      methods: ['GET', 'POST'],
      credentials: corsOriginList[0] !== '*',
    },
    transports: ['websocket', 'polling'],
  });

  setIo(io as any);

  // Engine.io nível mais baixo — para confirmar chegada antes do handshake Socket.IO
  (io.engine as any).on('connection', (rawSocket: any) => {
    log.info('[DIAG] engine.io raw connection', {
      id: rawSocket.id,
      transport: rawSocket.transport?.name,
      remoteAddress: rawSocket.remoteAddress,
    });
  });

  io.on('connection', socket => {
    log.info('Socket.IO client conectado', { socketId: socket.id, transport: socket.conn.transport.name, ip: socket.handshake.address });
    socket.on('join_session', (sessionName: string) => {
      socket.join(`session:${sessionName}`);
      log.info('Socket joined session', { socketId: socket.id, sessionName });
    });
    socket.on('leave_session', (sessionName: string) => {
      socket.leave(`session:${sessionName}`);
    });
    socket.on('join:org', (organizationId: string) => {
      socket.join(`org:${organizationId}`);
    });
    socket.on('disconnect', reason => {
      log.info('Socket.IO client desconectado', { socketId: socket.id, reason });
    });
  });

  log.info('Socket.IO inicializado');

  httpServer.listen(PORT, '0.0.0.0', () => {
    log.info('Servidor iniciado', { port: PORT, env: process.env.NODE_ENV ?? 'development' });
  });
}

startServer();
