import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('work/test-runtime/server', { recursive: true });
for (const f of readdirSync('server').filter((f) => f.endsWith('.ts'))) {
  let code = ts.transpileModule(readFileSync('server/' + f, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  code = code.replace(
    /from (['"])(\.[^'"]+)\1/g,
    (_, q, p) => `from ${q}${p}.mjs${q}`,
  );
  writeFileSync('work/test-runtime/server/' + f.replace(/\.ts$/, '.mjs'), code);
}
writeFileSync('work/client-test.mjs', ts.transpileModule(readFileSync('app/client.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText);
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    'tests/security.test.mjs',
    'tests/auth.test.mjs',
    'tests/client.test.mjs',
    'tests/audit.test.mjs',
    'tests/operations.test.mjs',
  ],
  { stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
);
process.exit(result.status ?? 1);
