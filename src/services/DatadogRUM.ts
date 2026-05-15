import { datadogRum } from '@datadog/browser-rum';

const DD_ENABLED = import.meta.env.VITE_DD_ENABLED === 'true';

export function initDatadogRUM(): void {
  if (!DD_ENABLED) return;

  datadogRum.init({
    applicationId: import.meta.env.VITE_DD_RUM_APP_ID ?? '',
    clientToken: import.meta.env.VITE_DD_RUM_CLIENT_TOKEN ?? '',
    site: (import.meta.env.VITE_DD_SITE as any) ?? 'us5.datadoghq.com',
    service: import.meta.env.VITE_DD_SERVICE ?? 'michelin-crm-frontend',
    env: import.meta.env.VITE_DD_ENV ?? 'production',
    version: import.meta.env.VITE_DD_VERSION,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask-user-input',
  });

  datadogRum.startSessionReplayRecording();
}

export function setRUMUser(userId: string, name: string, email: string): void {
  if (!DD_ENABLED) return;
  datadogRum.setUser({ id: userId, name, email });
}

export function clearRUMUser(): void {
  if (!DD_ENABLED) return;
  datadogRum.clearUser();
}

export function addRUMAction(name: string, context?: Record<string, unknown>): void {
  if (!DD_ENABLED) return;
  datadogRum.addAction(name, context);
}

export function addRUMError(error: Error, context?: Record<string, unknown>): void {
  if (!DD_ENABLED) return;
  datadogRum.addError(error, context);
}
