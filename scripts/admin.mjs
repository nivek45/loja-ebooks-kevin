import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const [operation, id] = process.argv.slice(2);
if (
  !['grant', 'revoke'].includes(operation) ||
  !/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/i.test(id || '')
)
  throw new Error('Uso: node scripts/admin.mjs grant|revoke UUID_DO_SUPABASE');
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  OPERATOR_ID,
  CLOUDFLARE_DATABASE_NAME,
} = process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !OPERATOR_ID ||
  !CLOUDFLARE_DATABASE_NAME
)
  throw new Error(
    'Configure as variáveis operacionais indicadas em docs/OPERACAO.md.',
  );
if (!/^[a-z0-9._@-]{3,100}$/i.test(OPERATOR_ID))
  throw new Error('OPERATOR_ID inválido');
const response = await fetch(
  new URL('/auth/v1/admin/users/' + id, SUPABASE_URL),
  {
    headers: {
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  },
);
if (!response.ok)
  throw new Error('Conta não encontrada no serviço de autenticação.');
const user = await response.json();
if (!user.email_confirmed_at) throw new Error('O email deve estar verificado.');
if (
  operation === 'grant' &&
  !user.factors?.some(
    (f) => f.status === 'verified' && f.factor_type === 'totp',
  )
)
  throw new Error('Cadastre e confirme TOTP antes da concessão.');
const sql =
  (operation === 'grant'
    ? `INSERT INTO admins (user_id,created_at,created_by) VALUES ('${id}',${Date.now()},'${OPERATOR_ID}') ON CONFLICT(user_id) DO NOTHING;`
    : `DELETE FROM admins WHERE user_id='${id}';`) +
  `\nINSERT INTO audit (id,actor,action,target,detail,created_at) VALUES ('${randomUUID()}','${OPERATOR_ID}','permission.${operation}','${id}','{}',${Date.now()});`;
mkdirSync('work', { recursive: true });
writeFileSync('work/admin-operation.sql', sql);
const config = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (!config.d1) throw new Error('Banco não configurado.');
const r = spawnSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'execute',
    CLOUDFLARE_DATABASE_NAME,
    '--remote',
    '--file',
    'work/admin-operation.sql',
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
