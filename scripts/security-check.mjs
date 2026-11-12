import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import assert from 'node:assert/strict';
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = dir + '/' + f;
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk('dist/client').filter((p) => /\.(js|html|json)$/.test(p));
const forbidden =
  /MP_ACCESS_TOKEN|MP_WEBHOOK_SECRET|PII_ENCRYPTION_KEY|SUPABASE_SERVICE_ROLE_KEY|request_cipher/;
for (const p of files)
  assert.ok(
    !forbidden.test(readFileSync(p, 'utf8')),
    'Server-only identifier in client build: ' + p,
  );
for (const p of walk('app').filter((p) => /\.tsx?$/.test(p)))
  assert.ok(
    !/dangerouslySetInnerHTML|\beval\s*\(/.test(readFileSync(p, 'utf8')),
    'Unsafe rendering pattern: ' + p,
  );
const publicFiles = walk('public');
assert.ok(
  !publicFiles.some((p) => /\.(pdf|epub|env|sql|sqlite|db)$/i.test(p)),
  'Private document in public/',
);
const manifest = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
assert.equal(manifest.r2, 'FILES');
assert.equal(manifest.d1, 'DB');
mkdirSync('work', { recursive: true });
const report = {
  date: new Date().toISOString(),
  clientAssetsInspected: files.length,
  publicFiles: publicFiles.length,
  checks: [
    'no server secret names or encrypted payer payload in client assets',
    'no eval/dangerouslySetInnerHTML in application pages',
    'no private ebook/database/environment files in public',
    'D1 and private R2 binding present',
  ],
  limitations:
    'Pattern scan, not penetration testing or a guarantee of absence of vulnerabilities.',
};
writeFileSync('work/source-security.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
