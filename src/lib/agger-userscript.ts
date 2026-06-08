import { useEffect, useState } from 'react';

export const AGGER_USERSCRIPT_URL = '/agger-userscript.user.js';
export const TAMPERMONKEY_CHROME = 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo';
export const TAMPERMONKEY_FIREFOX = 'https://addons.mozilla.org/firefox/addon/tampermonkey/';

const ATTR = 'data-michelin-agger-installed';
const MANUAL_OVERRIDE_KEY = 'michelin_agger_manual_install';

export function readInstalledVersion(): string | null {
  if (typeof document === 'undefined') return null;
  const v = document.documentElement.getAttribute(ATTR);
  return v && v.length > 0 ? v : null;
}

export function getManualOverride(): boolean {
  try { return localStorage.getItem(MANUAL_OVERRIDE_KEY) === '1'; }
  catch { return false; }
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
  const [version, setVersion] = useState<string | null>(() => readInstalledVersion());
  const [manualOverride, setManualOverrideState] = useState<boolean>(() => getManualOverride());

  useEffect(() => {
    const sync = () => {
      const v = readInstalledVersion();
      setVersion((prev) => (prev === v ? prev : v));
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ATTR],
    });

    const onInstalled = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.version) setVersion(detail.version);
      else sync();
    };
    window.addEventListener('michelin-agger:installed', onInstalled);

    const onOverride = () => setManualOverrideState(getManualOverride());
    window.addEventListener('michelin-agger:override-changed', onOverride);

    let polls = 0;
    const id = window.setInterval(() => {
      polls++;
      sync();
      if (polls > 40) window.clearInterval(id);
    }, 250);

    sync();

    return () => {
      observer.disconnect();
      window.removeEventListener('michelin-agger:installed', onInstalled);
      window.removeEventListener('michelin-agger:override-changed', onOverride);
      window.clearInterval(id);
    };
  }, []);

  return {
    installed: !!version || manualOverride,
    version,
    manualOverride,
  };
}
