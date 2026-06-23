/**
 * Script de inicialização do ambiente de desenvolvimento.
 * Inicia: ngrok → Express (tsx watch) + Vite (concurrently)
 * Depois verifica se tudo está acessível e funcionando.
 *
 * Ao usar ngrok, atualiza automaticamente o webhook da Evolution API
 * para apontar ao servidor local, e restaura a URL de produção ao encerrar.
 */
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Aceitar cert auto-assinado do VPS Evolution API
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Lê .env ──────────────────────────────────────────────────────────────────

function readEnv() {
  const env = {};
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#') || !line.includes('=')) continue;
      const [key, ...rest] = line.split('=');
      if (key) env[key.trim()] = rest.join('=').trim();
    }
  } catch {}
  return env;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

// ── ngrok ─────────────────────────────────────────────────────────────────────

async function isNgrokRunning() {
  const d = await fetchJSON('http://127.0.0.1:4040/api/tunnels', 1000);
  return d?.tunnels?.length > 0 ? d.tunnels[0].public_url : null;
}

async function waitForNgrok(maxMs = 15000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const url = await isNgrokRunning();
    if (url) return url;
    await sleep(400);
  }
  return null;
}

// ── Evolution API webhook management ─────────────────────────────────────────

const WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE',
  'MESSAGES_SET', 'SEND_MESSAGE', 'QRCODE_UPDATED',
  'CONNECTION_UPDATE', 'CONTACTS_UPDATE', 'CONTACTS_UPSERT',
  'PRESENCE_UPDATE', 'CHATS_UPDATE', 'CHATS_UPSERT',
  'CHATS_DELETE', 'GROUPS_UPDATE', 'GROUPS_UPSERT',
  'GROUP_PARTICIPANTS_UPDATE', 'CALL', 'LABELS_EDIT',
  'LABELS_ASSOCIATION', 'TYPEBOT_RESULT',
];

async function fetchInstances(evolutionUrl, apiKey) {
  try {
    const r = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function setInstanceWebhook(evolutionUrl, apiKey, instanceName, webhookUrl) {
  try {
    const r = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: 'PUT',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: true,
          base64: false,
          events: WEBHOOK_EVENTS,
        },
      }),
      signal: AbortSignal.timeout(6000),
    });
    return r.ok || r.status === 201;
  } catch {
    return false;
  }
}

async function updateAllWebhooks(evolutionUrl, apiKey, webhookUrl, label) {
  process.stdout.write(`[webhook] ${label} → ${webhookUrl}\n`);
  const instances = await fetchInstances(evolutionUrl, apiKey);
  if (instances.length === 0) {
    console.log('  ⚠ Nenhuma instância encontrada na Evolution API');
    return;
  }
  for (const inst of instances) {
    const name = inst.name ?? inst.instance?.instanceName ?? inst.instanceName;
    if (!name) continue;
    const ok = await setInstanceWebhook(evolutionUrl, apiKey, name, webhookUrl);
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }
}

// ── Verificação de saúde ──────────────────────────────────────────────────────

async function healthCheck(localUrl, ngrokDomain, webhookUrl) {
  console.log('\n────────────────────────────────────────────');
  console.log('  Verificação de conectividade');
  console.log('────────────────────────────────────────────');

  // Servidor local
  const local = await fetchJSON(`${localUrl}/api/health`, 5000);
  if (local) {
    const evo = local.services?.evolution ?? '?';
    console.log(`  ${evo === 'online' ? '✓' : '⚠'} Servidor Express  → ${localUrl} (Evolution: ${evo})`);
  } else {
    console.log(`  ✗ Servidor Express  → ${localUrl} — sem resposta`);
  }

  // Vite (retorna HTML — só verifica status 200)
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 2000);
  const viteOk = await fetch('http://localhost:3000', { signal: ctrl.signal })
    .then(r => r.ok).catch(() => false).finally(() => clearTimeout(id));
  console.log(`  ${viteOk ? '✓' : '⚠'} Vite frontend     → http://localhost:3000`);

  // Webhook configurado
  if (webhookUrl) {
    console.log(`  ✓ Webhook ativo    → ${webhookUrl}`);
  }

  // ngrok (opcional — para testes locais de webhook)
  if (ngrokDomain) {
    const remote = await fetchJSON(`https://${ngrokDomain}/api/health`, 8000);
    if (remote) {
      console.log(`  ✓ ngrok (dev)      → https://${ngrokDomain}`);
    } else {
      console.log(`  ⚠ ngrok (dev)      → https://${ngrokDomain} — inacessível`);
    }
  }

  // Stats
  const stats = await fetchJSON(`${localUrl}/api/evolution/stats`, 5000);
  if (stats) {
    const sessions = stats.sessions?.active ?? 0;
    const lastWh = stats.webhook?.lastWebhookAt;
    console.log(`  ✓ WhatsApp         → ${sessions} sessão(ões) ativa(s)${lastWh ? ` | último webhook: ${new Date(lastWh).toLocaleTimeString('pt-BR')}` : ' | aguardando eventos'}`);
  }

  console.log('────────────────────────────────────────────\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const env = readEnv();
  const prodWebhookUrl = env.EVOLUTION_WEBHOOK_URL ?? '';
  const isNgrokUrl = prodWebhookUrl.includes('ngrok');
  const ngrokDomain =
    env.NGROK_DOMAIN?.trim() ||
    (isNgrokUrl ? prodWebhookUrl.match(/https?:\/\/([^/]+)/)?.[1] : null) ||
    null;
  const evolutionUrl = (env.EVOLUTION_API_URL ?? '').replace(/\/$/, '');
  const evolutionKey = env.EVOLUTION_API_KEY ?? '';
  const localPort = 3001;
  const localUrl = `http://localhost:${localPort}`;

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      Michelin CRM — Dev Environment     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── 1. ngrok ────────────────────────────────────────────────────────────────
  let ngrokProc = null;
  let ngrokSpawnedByUs = false;
  let activeWebhookUrl = prodWebhookUrl;

  if (ngrokDomain) {
    const already = await isNgrokRunning();
    if (already) {
      console.log(`[ngrok] Já rodando → ${already}`);
    } else {
      process.stdout.write(`[ngrok] Iniciando → https://${ngrokDomain} ... `);
      ngrokProc = spawn(
        'ngrok',
        ['http', `--domain=${ngrokDomain}`, String(localPort), '--log=false'],
        { stdio: 'ignore', cwd: ROOT },
      );
      ngrokProc.on('error', (err) => {
        process.stdout.write(`\n[ngrok] Falha ao iniciar: ${err.message}\n`);
      });
      ngrokSpawnedByUs = true;

      const tunnelUrl = await waitForNgrok(15000);
      if (tunnelUrl) {
        process.stdout.write(`✓\n`);
      } else {
        process.stdout.write(`⚠ timeout (servidor ainda iniciará)\n`);
      }
    }

    activeWebhookUrl = `https://${ngrokDomain}/api/webhook/evolution`;
  } else {
    console.log('[ngrok] NGROK_DOMAIN não definido — usando webhook de produção');
  }

  // ── 2. Express + Vite ───────────────────────────────────────────────────────
  console.log('[dev]   Iniciando Express + Vite...\n');

  const devProc = spawn(
    'npx',
    [
      'concurrently', '--kill-others', '--kill-others-on-fail',
      '-n', 'server,vite',
      '-c', 'blue,green',
      'tsx watch --env-file=.env server.ts',
      'vite',
    ],
    { stdio: 'inherit', shell: true, cwd: ROOT },
  );

  // ── 3. Health check + atualização do webhook ───────────────────────────────
  setTimeout(async () => {
    await healthCheck(localUrl, ngrokDomain, activeWebhookUrl);

    // Se há ngrok e Evolution API configurada, atualiza webhook para dev
    if (ngrokDomain && evolutionUrl && evolutionKey && activeWebhookUrl !== prodWebhookUrl) {
      await updateAllWebhooks(evolutionUrl, evolutionKey, activeWebhookUrl, 'Trocando para ngrok (dev)');
    }
  }, 9000);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  let cleaningUp = false;
  const cleanup = async (signal) => {
    if (cleaningUp) return;
    cleaningUp = true;

    // Restaurar URL de produção antes de encerrar
    if (ngrokDomain && evolutionUrl && evolutionKey && prodWebhookUrl && activeWebhookUrl !== prodWebhookUrl) {
      console.log('');
      await updateAllWebhooks(evolutionUrl, evolutionKey, prodWebhookUrl, 'Restaurando webhook de produção');
    }

    if (ngrokSpawnedByUs && ngrokProc && !ngrokProc.killed) {
      process.stdout.write('[ngrok] Encerrando...\n');
      ngrokProc.kill();
    }
    devProc.kill(signal);
  };

  process.on('SIGINT',  () => cleanup('SIGINT').then(() => process.exit(0)));
  process.on('SIGTERM', () => cleanup('SIGTERM').then(() => process.exit(0)));

  devProc.on('exit', (code) => {
    cleanup('SIGTERM').then(() => process.exit(code ?? 0));
  });
}

main().catch(err => {
  console.error('[dev-start] Erro fatal:', err);
  process.exit(1);
});
