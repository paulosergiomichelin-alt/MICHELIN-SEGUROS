import { build } from 'esbuild';
import { mkdir } from 'fs/promises';

await mkdir('api', { recursive: true });

const result = await build({
  entryPoints: ['_api/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  outfile: 'api/index.js',
  logLevel: 'info',
});

console.log('Server bundle complete.');
