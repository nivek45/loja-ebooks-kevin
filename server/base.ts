export interface Env {
// Tipos de ambiente, acesso ao banco D1 e utilitários comuns das rotas.
  DB: D1Database;
  FILES: R2Bucket;
  APP_ORIGIN?: string;
  STORE_NAME?: string;
  SALES_ENABLED?: string;
  PAYMENT_MODE?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  MP_ACCESS_TOKEN?: string;
  MP_WEBHOOK_SECRET?: string;
  MP_COLLECTOR_ID?: string;
  PII_ENCRYPTION_KEY?: string;
  RATE_LIMIT_SECRET?: string;
  CRON_SECRET?: string;
  SCANNER_URL?: string;
  SCANNER_TOKEN?: string;
  ALERT_URL?: string;
  ALERT_TOKEN?: string;
  LEGAL_NAME?: string;
  LEGAL_DOCUMENT?: string;
  LEGAL_ADDRESS?: string;
  CONTACT_EMAIL?: string;
  LEGAL_REVIEWED?: string;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status });
export const one = <T = Record<string, any>>(
  e: Env,
  sql: string,
  ...args: any[]
) =>
  e.DB.prepare(sql)
    .bind(...args)
    .first<T>();
export const all = async <T = Record<string, any>>(
  e: Env,
  sql: string,
  ...args: any[]
) =>
  (
    await e.DB.prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
export const run = (e: Env, sql: string, ...args: any[]) =>
  e.DB.prepare(sql)
    .bind(...args)
    .run();
export const statement = (e: Env, sql: string, ...args: any[]) =>
  e.DB.prepare(sql).bind(...args);
export function origin(e: Env) {
  const value = e.APP_ORIGIN;
  if (!value) return fail(503, 'A loja ainda está em configuração.');
  const u = new URL(value);
  if (
    u.origin !== value ||
    (u.protocol !== 'https:' && u.hostname !== 'localhost')
  )
    fail(503, 'Configuração de origem inválida.');
  return value;
}
export async function alert(e: Env, kind: string, target = '') {
  await run(
    e,
    'INSERT INTO alerts (id,kind,target,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
    kind + ':' + target + ':' + Math.floor(now() / 300000),
    kind,
    target,
    now(),
  );
}
export function auditStatement(
  e: Env,
  actor: string,
  action: string,
  target: string,
  detail: unknown = {},
) {
  return statement(
    e,
    'INSERT INTO audit (id,actor,action,target,detail,created_at) VALUES (?,?,?,?,?,?)',
    uid(),
    actor,
    action,
    target,
    JSON.stringify(detail),
    now(),
  );
}
export function salesReady(e: Env) {
  return (
    e.SALES_ENABLED === 'true' &&
    (e.PAYMENT_MODE !== 'production' || !!e.TURNSTILE_SITE_KEY) &&
    e.LEGAL_REVIEWED === 'true' &&
    [
      e.MP_ACCESS_TOKEN,
      e.MP_WEBHOOK_SECRET,
      e.MP_COLLECTOR_ID,
      e.SUPABASE_URL,
      e.SUPABASE_PUBLISHABLE_KEY,
      e.PII_ENCRYPTION_KEY,
      e.RATE_LIMIT_SECRET,
      e.SCANNER_URL,
      e.SCANNER_TOKEN,
      e.CRON_SECRET,
      e.ALERT_URL,
      e.ALERT_TOKEN,
      e.LEGAL_NAME,
      e.LEGAL_DOCUMENT,
      e.LEGAL_ADDRESS,
      e.CONTACT_EMAIL,
      e.APP_ORIGIN,
    ].every(Boolean) &&
    ['test', 'production'].includes(e.PAYMENT_MODE || '')
  );
}
export function authReady(e: Env) {
  try {
    origin(e);
    return !!(e.SUPABASE_URL && e.SUPABASE_PUBLISHABLE_KEY && e.RATE_LIMIT_SECRET && (e.PAYMENT_MODE !== 'production' || e.TURNSTILE_SITE_KEY));
  } catch { return false; }
}
