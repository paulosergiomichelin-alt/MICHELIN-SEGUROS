import { dataApiClient } from './dataApiClient';

// Cache em memória dos logos de seguradora armazenados no sistema (Postgres + Storage,
// ver InsurerLogosSettings.tsx), carregado uma vez por sessão do navegador e mantido
// atualizado localmente quando o próprio usuário faz upload (setSeguradoraLogo).
type Listener = () => void;

let logos: Record<string, string> = {};
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(fn => fn());
}

export function getSeguradoraLogo(id: string): string | undefined {
  return logos[id];
}

export function getAllSeguradoraLogos(): Record<string, string> {
  return logos;
}

export function subscribeSeguradoraLogos(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function ensureSeguradorasLogosLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = dataApiClient.query('seguradoras', [])
    .then((rows: any[]) => {
      logos = Object.fromEntries((rows ?? []).filter(r => r.logoUrl).map(r => [r.id, r.logoUrl]));
      loaded = true;
      notify();
    })
    .catch(() => { loaded = true; });
  return loading;
}

export function setSeguradoraLogo(id: string, url: string | null) {
  logos = { ...logos };
  if (url) logos[id] = url; else delete logos[id];
  notify();
}
