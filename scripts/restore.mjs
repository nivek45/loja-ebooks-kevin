import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const [file] = process.argv.slice(2),
  database = process.env.RESTORE_DATABASE_NAME;
if (!database || !file || !database.endsWith('-restore'))
  throw new Error(
    'Defina RESTORE_DATABASE_NAME com sufixo -restore, exclusivo para restauração isolada, e informe o arquivo SQL.',
  );
const run = (args) => {
  const r = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'd1', ...args],
    { stdio: 'inherit' },
  );
  if (r.error || r.status !== 0) process.exit(r.status || 1);
};
run(['execute', database, '--remote', '--file', resolve(file)]);
run([
  'execute',
  database,
  '--remote',
  '--command',
  'PRAGMA integrity_check; PRAGMA foreign_key_check; SELECT COUNT(*) FROM orders; SELECT COUNT(*) FROM order_items;',
]);
console.log(
  'Confira integrity_check=ok, foreign_key_check sem linhas e contagens compatíveis. Teste arquivos e autenticação separadamente.',
);
