// Sessões, identidade do usuário e validação de permissões via Supabase Auth.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type Env, fail, one, json, origin, alert } from './base';
import { body, rate } from './security';
export interface Identity {
  id: string;
  email: string;
  aal: string;
  token: string;
}
export function authClient(e: Env, signal?: AbortSignal): SupabaseClient {
  if (!e.SUPABASE_URL || !e.SUPABASE_PUBLISHABLE_KEY)
    fail(503, 'Cadastro e login ainda não foram configurados.');
  return createClient(e.SUPABASE_URL, e.SUPABASE_PUBLISHABLE_KEY, {
    ...(signal ? { global: { fetch: (url: RequestInfo | URL, init?: RequestInit) => fetch(url, { ...init, signal }) } } : {}),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export function cookie(request: Request, name: string) {
  const part = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='));
  try { return part ? decodeURIComponent(part.slice(name.length + 1)) : ''; }
  catch { return ''; }
}
function names(e: Env) {
  return e.APP_ORIGIN?.startsWith('https:')
    ? ['__Host-access', '__Host-refresh']
    : ['dev-access', 'dev-refresh'];
}
function setCookies(r: Response, e: Env, session: any) {
  const secure = e.APP_ORIGIN?.startsWith('https:') ? '; Secure' : '';
  const [a, b] = names(e);
  for (const [name, value, age] of [
    [
      a,
      session?.access_token || '',
      session ? Math.min(session.expires_in || 3600, 3600) : 0,
    ],
    [b, session?.refresh_token || '', session ? 604800 : 0],
  ])
    r.headers.append(
      'Set-Cookie',
      `${name}=${encodeURIComponent(String(value))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`,
    );
  return r;
}
export async function identity(request: Request, e: Env): Promise<Identity> {
  const token = cookie(request, names(e)[0]);
  if (!token) fail(401, 'Entre na sua conta para continuar.');
  const auth = authClient(e);
  const [{ data, error }, claims] = await Promise.all([
    auth.auth.getUser(token),
    auth.auth.getClaims(token),
  ]);
  if (
    error ||
    !data.user ||
    !data.user.email_confirmed_at ||
    claims.error ||
    !claims.data
  )
    fail(401, 'Sua sessão expirou. Entre novamente.');
  return {
    id: data.user.id,
    email: data.user.email!,
    aal: String(claims.data.claims.aal || 'aal1'),
    token,
  };
}
export async function admin(user: Identity, e: Env) {
  if (
    user.aal !== 'aal2' ||
    !(await one(e, 'SELECT user_id FROM admins WHERE user_id=?', user.id))
  )
    fail(403, 'Administração exige uma conta autorizada e segundo fator.');
}
export async function sessionClient(request: Request, e: Env, signal?: AbortSignal) {
  const client = authClient(e, signal);
  const { error } = await client.auth.setSession({
    access_token: cookie(request, names(e)[0]),
    refresh_token: cookie(request, names(e)[1]),
  });
  if (error) fail(401, 'Entre novamente.');
  return client;
}
// CSRF is enforced by the router before this function. Remote failure must never
// prevent clearing this browser's cookies or masquerade as global revocation.
async function endSession(request: Request, e: Env, passwordChanged = false, existingClient?: SupabaseClient) {
  const hasSession = names(e).some(name => !!cookie(request, name));
  if (!hasSession && !passwordChanged)
    return setCookies(json({ localSignedOut: true, remoteRevoked: null, message: 'Você saiu desta conta neste navegador.' }), e, null);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await rate(e, `logout:${request.headers.get('cf-connecting-ip') || 'local'}`, 10, 60000);
    await Promise.race([
      (async () => {
        const client = existingClient || await sessionClient(request, e, controller.signal);
        const { error } = await client.auth.signOut({ scope: 'global' });
        if (error) throw new Error('revocation_failed');
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('revocation_timeout')); }, 10000);
      }),
    ]);
    return setCookies(json({ localSignedOut: true, remoteRevoked: true, message: passwordChanged ? 'Senha alterada e sessões encerradas. Entre novamente.' : 'Você saiu da conta. As sessões foram encerradas no provedor.' }), e, null);
  } catch {
    try { await alert(e, passwordChanged ? 'password_revocation_failed' : 'logout_revocation_failed'); }
    catch { console.error(JSON.stringify({ event: 'session_revocation_alert_failed' })); }
    return setCookies(json({ localSignedOut: true, remoteRevoked: false, warning: true,
      message: (passwordChanged ? 'Senha alterada. ' : '') + 'Você saiu deste navegador, mas não foi possível confirmar o encerramento das outras sessões. Entre novamente e tente sair mais uma vez. Se o aviso persistir, contate a loja.' }, 202), e, null);
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
}
const credentials = z
  .object({ email: z.email().max(254), password: z.string().min(12).max(128), captchaToken: z.string().min(1).max(2048).optional() })
  .strict();
function captcha(e: Env, token?: string) {
  if (e.PAYMENT_MODE === 'production' && !e.TURNSTILE_SITE_KEY)
    fail(503, 'A proteção de acesso ainda está em configuração.');
  if (e.TURNSTILE_SITE_KEY && !token)
    fail(400, 'Conclua a verificação de segurança e tente novamente.');
  // Supabase validates the token once. Do not consume it with Siteverify here.
  return token;
}
export async function authRoute(request: Request, e: Env, action: string) {
  if (action === 'logout') return endSession(request, e);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  await rate(e, `auth:${ip}`, 30, 900000);
  const input = await body(request);
  const c = authClient(e);
  if (action === 'signup') {
    const p = credentials.parse(input);
    await rate(e, `signup:${p.email.toLowerCase()}`, 4, 3600000);
    const { error } = await c.auth.signUp({
      email: p.email, password: p.password,
      options: { emailRedirectTo: origin(e) + '/conta/confirmar', captchaToken: captcha(e, p.captchaToken) },
    });
    if (error && error.status && error.status >= 500)
      fail(503, 'Não foi possível enviar o email agora.');
    return json({
      message:
        'Se o endereço puder ser cadastrado, você receberá um email de confirmação.',
    });
  }
  if (action === 'login') {
    const p = z
      .object({ email: z.email().max(254), password: z.string().max(128), captchaToken: z.string().min(1).max(2048).optional() })
      .strict()
      .parse(input);
    await rate(e, `login:${p.email.toLowerCase()}`, 10, 900000);
    const { data, error } = await c.auth.signInWithPassword({ email: p.email, password: p.password, options: { captchaToken: captcha(e, p.captchaToken) } });
    if (error || !data.session || !data.user?.email_confirmed_at)
      fail(401, 'Email ou senha inválidos, ou email ainda não confirmado.');
    return setCookies(json({ ok: true }), e, data.session);
  }
  if (action === 'recover') {
    const p = z
      .object({ email: z.email().max(254), captchaToken: z.string().min(1).max(2048).optional() })
      .strict()
      .parse(input);
    await rate(e, `recover:${p.email.toLowerCase()}`, 4, 3600000);
    await c.auth.resetPasswordForEmail(p.email, {
      redirectTo: origin(e) + '/conta/confirmar',
      captchaToken: captcha(e, p.captchaToken),
    });
    return json({
      message:
        'Se houver uma conta elegível, enviaremos as instruções de recuperação.',
    });
  }
  if (action === 'verify') {
    const p = z
      .object({
        token_hash: z.string().min(10).max(512),
        type: z.enum(['signup', 'recovery', 'email']),
      })
      .strict()
      .parse(input);
    const { data, error } = await c.auth.verifyOtp(p);
    if (error || !data.session)
      fail(400, 'Link inválido ou expirado. Solicite um novo email.');
    return setCookies(json({ ok: true, type: p.type }), e, data.session);
  }
  if (action === 'refresh') {
    const { data, error } = await c.auth.refreshSession({
      refresh_token: cookie(request, names(e)[1]),
    });
    if (error || !data.session)
      return setCookies(json({ error: 'Entre novamente.' }, 401), e, null);
    return setCookies(json({ ok: true }), e, data.session);
  }
  const client = await sessionClient(request, e);
  if (action === 'password') {
    const p = z
      .object({ password: z.string().min(12).max(128) })
      .strict()
      .parse(input);
    const { error } = await client.auth.updateUser(p);
    if (error)
      fail(
        400,
        'Não foi possível atualizar a senha. Use um link de recuperação válido.',
      );
    return endSession(request, e, true, client);
  }
  if (action === 'mfa-enroll') {
    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Loja de ebooks',
    });
    if (error) fail(400, 'Não foi possível cadastrar o segundo fator.');
    return json({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
  }
  if (action === 'mfa-list') {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) fail(401, 'Entre novamente.');
    return json({
      factors: data.totp.map((f) => ({ id: f.id, status: f.status })),
    });
  }
  if (action === 'mfa-verify') {
    const p = z
      .object({ factorId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(input);
    const { data, error } = await client.auth.mfa.challengeAndVerify(p);
    if (error) fail(401, 'Código inválido ou expirado.');
    return setCookies(json({ ok: true }), e, data);
  }
  fail(404, 'Página não encontrada.');
}
