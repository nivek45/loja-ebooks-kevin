import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const database = process.env.CLOUDFLARE_DATABASE_NAME;
if (!database)
  throw new Error(
    'Configure CLOUDFLARE_DATABASE_NAME. Use credencial com escopo somente ao banco.',
  );
const dir = resolve('backups');
mkdirSync(dir, { recursive: true });
const file = resolve(
  dir,
  new Date().toISOString().replace(/[:.]/g, '-') + '.sql',
);
const r = spawnSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'export',
    database,
    '--remote',
    '--output',
    file,
  ],
  { stdio: 'inherit' },
);
if (r.error || r.status !== 0) process.exit(r.status || 1);
console.log(
  'Backup local criado. Cifre e copie para armazenamento separado:',
  file,
);
