/**
 * Deploy do servidor CRM para o VPS.
 *
 * O que faz:
 * 1. Cria um tarball com os arquivos necessários
 * 2. Envia para o VPS via SFTP
 * 3. Executa docker build + restart no VPS
 *
 * Uso:
 *   node scripts/deploy-vps.mjs
 */
import { createWriteStream, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const VPS_HOST = '143.95.211.30';
const VPS_PORT = 22022;
const VPS_USER = 'root';
const VPS_PASS = 'Bw8ygomm@';
const VPS_DIR  = '/opt/evolution-api';
const IMAGE    = 'michelin-crm';

// ── SSH helper ─────────────────────────────────────────────────────────────────

async function ssh(commands) {
  const { Client } = await import('ssh2').catch(() => {
    throw new Error('ssh2 não instalado. Rode: npm install ssh2');
  });

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';

    conn.on('ready', () => {
      const cmd = Array.isArray(commands) ? commands.join(' && ') : commands;
      conn.exec(cmd, (err, stream) => {
        if (err) { conn.end(); reject(err); return; }
        stream.on('data', d => { process.stdout.write(d); output += d; });
        stream.stderr.on('data', d => { process.stderr.write(d); });
        stream.on('close', (code) => { conn.end(); resolve({ code, output }); });
      });
    }).on('error', reject);

    conn.connect({ host: VPS_HOST, port: VPS_PORT, username: VPS_USER, password: VPS_PASS, readyTimeout: 20000 });
  });
}

// ── SFTP upload de arquivo ─────────────────────────────────────────────────────

async function sftpUpload(localPath, remotePath) {
  const { Client } = await import('ssh2');
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); reject(err); return; }
        sftp.fastPut(localPath, remotePath, {}, (err2) => {
          conn.end();
          err2 ? reject(err2) : resolve();
        });
      });
    }).on('error', reject);
    conn.connect({ host: VPS_HOST, port: VPS_PORT, username: VPS_USER, password: VPS_PASS, readyTimeout: 20000 });
  });
}

// ── Cria tarball dos arquivos do servidor ─────────────────────────────────────

async function createTarball() {
  const { tar } = await import('tar').catch(() => {
    throw new Error('tar não instalado. Rode: npm install tar');
  });

  const outPath = resolve(ROOT, 'crm-server.tar.gz');
  await tar.create(
    { gzip: true, file: outPath, cwd: ROOT },
    [
      'package.json', 'package-lock.json',
      'server.ts', 'tsconfig.json', 'tsconfig.node.json',
      '_api',
      'Dockerfile',
    ]
  );
  return outPath;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Michelin CRM — Deploy VPS             ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Criar tarball
  console.log('[1/4] Criando pacote de deploy...');
  let tarPath;
  try {
    tarPath = await createTarball();
    console.log(`  ✓ ${tarPath}`);
  } catch (err) {
    console.error('  ✗ Falha ao criar tarball:', err.message);
    console.log('\n  Alternativa: envie os arquivos manualmente via git clone no VPS');
    process.exit(1);
  }

  // 2. Enviar para VPS
  console.log('[2/4] Enviando para VPS...');
  try {
    await ssh(`mkdir -p ${VPS_DIR}/crm`);
    await sftpUpload(tarPath, `${VPS_DIR}/crm/crm-server.tar.gz`);
    console.log('  ✓ Upload concluído');
  } catch (err) {
    console.error('  ✗ Falha no upload:', err.message);
    process.exit(1);
  }

  // 3. Extrair e build no VPS
  console.log('[3/4] Construindo imagem Docker no VPS...');
  try {
    await ssh([
      `cd ${VPS_DIR}/crm`,
      'tar xzf crm-server.tar.gz',
      `docker build -t ${IMAGE} . 2>&1`,
    ]);
    console.log('  ✓ Imagem construída');
  } catch (err) {
    console.error('  ✗ Falha no build:', err.message);
    process.exit(1);
  }

  // 4. Restart do serviço
  console.log('[4/4] Reiniciando serviço CRM...');
  try {
    await ssh([
      `cd ${VPS_DIR}`,
      'docker compose up -d --force-recreate crm-server 2>&1',
    ]);
    console.log('  ✓ Serviço reiniciado');
  } catch (err) {
    console.error('  ✗ Falha ao reiniciar:', err.message);
    process.exit(1);
  }

  console.log('\n✅ Deploy concluído!');
  console.log(`   Verificar: https://api.michelin-seguros.com.br/api/health\n`);
}

main().catch(err => {
  console.error('[deploy] Erro fatal:', err);
  process.exit(1);
});
