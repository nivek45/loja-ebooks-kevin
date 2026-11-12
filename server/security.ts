// Camada comum de segurança: rate limit, CSRF, criptografia e respostas HTTP.
import { fail, type Env, one, now } from './base';
const encoder = new TextEncoder();
export async function sha(value: string | Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof value === 'string'
          ? encoder.encode(value)
          : (value as BufferSource),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function hmac(key: string, value: string) {
  const k = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode(value))),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function rate(e: Env, key: string, max: number, windowMs: number) {
  if (!e.RATE_LIMIT_SECRET)
    fail(503, 'Limites de acesso ainda não configurados.');
  const bucket = Math.floor(now() / windowMs);
  const hash = await hmac(e.RATE_LIMIT_SECRET, `${key}:${bucket}`);
  const r = await one(
    e,
    'INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    hash,
    (bucket + 1) * windowMs,
  );
  if (!r || r.count > max)
    fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}
export function csrf(request: Request, e: Env) {
  if (request.headers.get('origin') !== e.APP_ORIGIN)
    fail(403, 'Origem não permitida.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    fail(403, 'Origem não permitida.');
}
function encryptionKey(e: Env) {
  if (!e.PII_ENCRYPTION_KEY) fail(503, 'Proteção de dados não configurada.');
  const raw = Uint8Array.from(atob(e.PII_ENCRYPTION_KEY), (c) =>
    c.charCodeAt(0),
  );
  if (raw.length !== 32) fail(503, 'Proteção de dados não configurada.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function encrypt(e: Env, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await encryptionKey(e),
      encoder.encode(JSON.stringify(value)),
    ),
  );
  return (
    btoa(String.fromCharCode(...iv)) + '.' + btoa(String.fromCharCode(...bytes))
  );
}
export async function decrypt(e: Env, value: string) {
  const [iv, data] = value
    .split('.')
    .map((v) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0)));
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        await encryptionKey(e),
        data,
      ),
    ),
  );
}
export async function body(request: Request, max = 16384) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    length += r.value.length;
    if (length > max) {
      await reader.cancel();
      fail(413, 'Conteúdo muito grande.');
    }
    chunks.push(r.value);
  }
  const bytes = new Uint8Array(length);
  let p = 0;
  for (const c of chunks) {
    bytes.set(c, p);
    p += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, 'Dados inválidos.');
  }
}
export function protect(response: Response, e: Env) {
  const r = new Response(response.body, response);
  r.headers.set('Cache-Control', 'no-store');
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Referrer-Policy', 'no-referrer');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  r.headers.set(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; sandbox",
  );
  if (e.APP_ORIGIN?.startsWith('https:'))
    r.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  return r;
}
