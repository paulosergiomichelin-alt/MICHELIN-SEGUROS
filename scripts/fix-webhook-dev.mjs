/**
 * Atualiza o webhook da Evolution API para o domínio ngrok (dev)
 * ou restaura para produção (Vercel).
 *
 * Uso:
 *   node scripts/fix-webhook-dev.mjs         → troca para ngrok (dev)
 *   node scripts/fix-webhook-dev.mjs --prod  → restaura URL de produção
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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

const WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE',
  'MESSAGES_SET', 'SEND_MESSAGE', 'QRCODE_UPDATED',
  'CONNECTION_UPDATE', 'CONTACTS_UPDATE', 'CONTACTS_UPSERT',
  'PRESENCE_UPDATE', 'CHATS_UPDATE', 'CHATS_UPSERT',
  'CHATS_DELETE', 'GROUPS_UPDATE', 'GROUPS_UPSERT',
  'GROUP_PARTICIPANTS_UPDATE', 'CALL', 'LABELS_EDIT',
  'LABELS_ASSOCIATION', 'TYPEBOT_RESULT',
];

async function fetchInstances(url, key) {
  const r = await fetch(`${url}/instance/fetchInstances`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`fetchInstances HTTP ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function setWebhook(url, key, instance, webhookUrl) {
  const r = await fetch(`${url}/webhook/set/${instance}`, {
    method: 'PUT',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhook: { enabled: true, url: webhookUrl, byEvents: true, base64: false, events: WEBHOOK_EVENTS },
    }),
    signal: AbortSignal.timeout(8000),
  });
  return r.ok || r.status === 201;
}

async function main() {
  const env = readEnv();
  const evolutionUrl = (env.EVOLUTION_API_URL ?? '').replace(/\/$/, '');
  const evolutionKey = env.EVOLUTION_API_KEY ?? '';
  const ngrokDomain = env.NGROK_DOMAIN?.trim() ?? '';
  const prodWebhookUrl = env.EVOLUTION_WEBHOOK_URL ?? '';

  if (!evolutionUrl || !evolutionKey) {
    console.error('❌ EVOLUTION_API_URL ou EVOLUTION_API_KEY não definidos no .env');
    process.exit(1);
  }

  const useProd = process.argv.includes('--prod');
  let targetUrl;

  if (useProd) {
    if (!prodWebhookUrl) {
      console.error('❌ EVOLUTION_WEBHOOK_URL não definida no .env');
      process.exit(1);
    }
    targetUrl = prodWebhookUrl;
    console.log(`\n🔄 Restaurando webhook de PRODUÇÃO: ${targetUrl}`);
  } else {
    if (!ngrokDomain) {
      console.error('❌ NGROK_DOMAIN não definido no .env');
      console.error('   Defina NGROK_DOMAIN=seu-dominio.ngrok-free.dev no .env');
      process.exit(1);
    }
    targetUrl = `https://${ngrokDomain}/api/webhook/evolution`;
    console.log(`\n🔄 Atualizando webhook para DEV (ngrok): ${targetUrl}`);
    console.log('   Certifique-se que ngrok está rodando: ngrok http --domain=' + ngrokDomain + ' 3001\n');
  }

  console.log('📡 Buscando instâncias...');
  let instances;
  try {
    instances = await fetchInstances(evolutionUrl, evolutionKey);
  } catch (err) {
    console.error('❌ Falha ao buscar instâncias:', err.message);
    process.exit(1);
  }

  if (instances.length === 0) {
    console.log('⚠  Nenhuma instância encontrada');
    process.exit(0);
  }

  for (const inst of instances) {
    const name = inst.name ?? inst.instance?.instanceName ?? inst.instanceName;
    if (!name) continue;
    process.stdout.write(`   ${name} ... `);
    const ok = await setWebhook(evolutionUrl, evolutionKey, name, targetUrl);
    console.log(ok ? '✓' : '✗ falhou');
  }

  console.log('\n✅ Pronto!');
  if (!useProd) {
    console.log('   Mensagens agora chegam ao servidor local via ngrok.');
    console.log('   Ao encerrar o dev server, rode:');
    console.log('   node scripts/fix-webhook-dev.mjs --prod');
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
