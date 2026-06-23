/**
 * Lightweight structured logger for the server-side API.
 *
 * Dev  → colored text lines:  [ERROR] 2026-06-23T... [ns] msg  key=val
 * Prod → JSON lines:           {"ts":"...","level":"error","ns":"ns","msg":"msg","key":val}
 *
 * Errors are forwarded fire-and-forget to Datadog Logs API when DD_API_KEY is set.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const IS_PROD = process.env.NODE_ENV === 'production';

function minLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? '').toLowerCase() as LogLevel;
  return LEVEL_RANK[env] !== undefined ? env : IS_PROD ? 'info' : 'debug';
}

// ANSI colours — stripped automatically when stdout is not a TTY
const CLR: Record<LogLevel, string> = {
  debug: '\x1b[37m',  // white
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
};
const RST = '\x1b[0m';
const DIM = '\x1b[90m';

function devLine(level: LogLevel, ns: string, msg: string, ctx: LogContext): string {
  const ts = new Date().toISOString();
  const ctxStr = Object.keys(ctx).length
    ? ' ' + Object.entries(ctx).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')
    : '';
  return `${CLR[level]}[${level.toUpperCase().padEnd(5)}]${RST} ${DIM}${ts}${RST} [${ns}] ${msg}${ctxStr}`;
}

function prodLine(level: LogLevel, ns: string, msg: string, ctx: LogContext): string {
  return JSON.stringify({ ts: new Date().toISOString(), level, ns, msg, ...ctx });
}

function writeLine(level: LogLevel, ns: string, msg: string, ctx: LogContext): void {
  const line = IS_PROD
    ? prodLine(level, ns, msg, ctx)
    : devLine(level, ns, msg, ctx);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ── Datadog Logs HTTP intake ─────────────────────────────────────────────────

function ddForward(level: LogLevel, ns: string, msg: string, ctx: LogContext): void {
  const apiKey = process.env.DD_API_KEY;
  const site   = process.env.DD_SITE ?? 'us5.datadoghq.com';
  if (!apiKey) return;

  const payload = [{
    ddsource: 'nodejs',
    ddtags:   `env:${process.env.NODE_ENV ?? 'development'},service:michelin-crm-api,ns:${ns}`,
    service:  'michelin-crm-api',
    level,
    message:  msg,
    ...ctx,
    ts: new Date().toISOString(),
  }];

  fetch(`https://http-intake.logs.${site}/api/v2/logs`, {
    method:  'POST',
    headers: { 'DD-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  }).catch(() => {}); // fire-and-forget, never throws
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface Logger {
  debug: (msg: string, ctx?: LogContext) => void;
  info:  (msg: string, ctx?: LogContext) => void;
  warn:  (msg: string, ctx?: LogContext) => void;
  error: (msg: string, ctx?: LogContext) => void;
}

export function createLogger(namespace: string): Logger {
  const ns = namespace;

  function log(level: LogLevel, msg: string, ctx: LogContext = {}): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;
    writeLine(level, ns, msg, ctx);
    if (level === 'error') ddForward(level, ns, msg, ctx);
  }

  return {
    debug: (msg, ctx) => log('debug', msg, ctx),
    info:  (msg, ctx) => log('info',  msg, ctx),
    warn:  (msg, ctx) => log('warn',  msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
  };
}

/**
 * Converts an unknown thrown value into a flat context object safe to log.
 * Includes up to 6 stack frames.
 */
export function errCtx(err: unknown, extra?: LogContext): LogContext {
  const base: LogContext = extra ?? {};
  if (err instanceof Error) {
    return {
      ...base,
      err_type:  err.constructor.name,
      err_msg:   err.message,
      stack:     err.stack?.split('\n').slice(1, 7).map(s => s.trim()).join(' | '),
    };
  }
  return { ...base, err_msg: String(err) };
}

/** Convenience: root-level logger (namespace = 'server') */
export const log = createLogger('server');
