import { useEffect, useState } from 'react';

export const EXTENSION_ID = 'mbfiemeaedojpfcpegodpaepknbmogil';

// Mantidos por compatibilidade com AggerInstallBanner / AggerToolSettings
export const AGGER_USERSCRIPT_URL = '/agger-userscript.user.js';
export const TAMPERMONKEY_CHROME = 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo';
export const TAMPERMONKEY_FIREFOX = 'https://addons.mozilla.org/firefox/addon/tampermonkey/';

const MANUAL_OVERRIDE_KEY = 'michelin_agger_manual_install';

function getChromeRuntime(): any {
  return (window as any).chrome?.runtime;
}

export function pingExtension(): Promise<{ ok: boolean; version?: string }> {
  return new Promise((resolve) => {
    const rt = getChromeRuntime();
    if (!rt?.sendMessage) return resolve({ ok: false });
    try {
      rt.sendMessage(EXTENSION_ID, { acao: 'ping' }, (response: any) => {
        // Acessar lastError é obrigatório para suprimir o erro interno do Chrome
        const err = rt.lastError;
        if (!err && response?.ok === true) {
          resolve({ ok: true, version: response.version });
        } else {
          resolve({ ok: false });
        }
      });
    } catch {
      resolve({ ok: false });
    }
  });
}

// Cache síncrono atualizado pelo hook — permite leitura instantânea nos handlers
let _cachedVersion: string | null = null;

export function readInstalledVersion(): string | null {
  return _cachedVersion;
}

export function getManualOverride(): boolean {
  try { return localStorage.getItem(MANUAL_OVERRIDE_KEY) === '1'; } catch { return false; }
}

export function setManualOverride(value: boolean): void {
  try {
    if (value) localStorage.setItem(MANUAL_OVERRIDE_KEY, '1');
    else localStorage.removeItem(MANUAL_OVERRIDE_KEY);
    window.dispatchEvent(new CustomEvent('michelin-agger:override-changed'));
  } catch {}
}

export function useAggerUserscriptInstalled(): {
  installed: boolean;
  version: string | null;
  manualOverride: boolean;
} {
  const [version, setVersion] = useState<string | null>(null);
  const [manualOverride, setManualOverrideState] = useState<boolean>(() => getManualOverride());

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const result = await pingExtension();
      if (cancelled) return;
      const v = result.ok ? (result.version ?? '?') : null;
      _cachedVersion = v;
      setVersion(v);
    };

    check();
    const id = window.setInterval(check, 8000);

    const onOverride = () => setManualOverrideState(getManualOverride());
    window.addEventListener('michelin-agger:override-changed', onOverride);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('michelin-agger:override-changed', onOverride);
    };
  }, []);

  return { installed: !!version || manualOverride, version, manualOverride };
}
