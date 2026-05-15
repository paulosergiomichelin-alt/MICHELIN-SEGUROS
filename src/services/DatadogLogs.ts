import { datadogLogs } from '@datadog/browser-logs';

const DD_ENABLED = import.meta.env.VITE_DD_ENABLED === 'true';

export function initDatadogLogs(): void {
  if (!DD_ENABLED) return;

  datadogLogs.init({
    clientToken: import.meta.env.VITE_DD_RUM_CLIENT_TOKEN ?? '',
    site: (import.meta.env.VITE_DD_SITE as any) ?? 'us5.datadoghq.com',
    service: import.meta.env.VITE_DD_SERVICE ?? 'michelin-crm-frontend',
    env: import.meta.env.VITE_DD_ENV ?? 'production',
    version: import.meta.env.VITE_DD_VERSION,
    sessionSampleRate: 100,
    forwardErrorsToLogs: true,
    forwardConsoleLogs: 'all',
  });
}

export function ddLogInfo(message: string, context?: Record<string, unknown>): void {
  if (!DD_ENABLED) return;
  datadogLogs.logger.info(message, context);
}

export function ddLogWarn(message: string, context?: Record<string, unknown>): void {
  if (!DD_ENABLED) return;
  datadogLogs.logger.warn(message, context);
}

export function ddLogError(message: string, error?: Error, context?: Record<string, unknown>): void {
  if (!DD_ENABLED) return;
  datadogLogs.logger.error(message, {
    error_message: error?.message,
    error_stack: error?.stack,
    ...context,
  });
}
