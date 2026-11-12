import { pathToFileURL } from 'node:url';

// Read-only operator tool. Never print the provider response: it contains secrets.
export function checkAuthConfig(c, origin) {
  const redirects = String(c.uri_allow_list || '').split(',').map(s => s.trim()).filter(Boolean);
  return [
    ['Origem e redirects exatos', c.site_url === origin && redirects.includes(origin + '/conta/confirmar') && redirects.every(s => [origin, origin + '/conta/confirmar'].includes(s))],
    ['Confirmação de email', c.mailer_autoconfirm === false && c.mailer_allow_unverified_email_sign_ins !== true],
    ['Senha mínima de 12 caracteres', Number(c.password_min_length) >= 12],
    ['CAPTCHA nativo Turnstile', c.security_captcha_enabled === true && c.security_captcha_provider === 'turnstile'],
    ['SMTP próprio configurado (entrega não verificada)', !!(c.smtp_host && c.smtp_port && c.smtp_user && c.smtp_admin_email)],
    ['JWT com validade de até uma hora', Number(c.jwt_exp) > 0 && Number(c.jwt_exp) <= 3600],
    ['Rotação do refresh token', c.refresh_token_rotation_enabled === true],
    ['Expiração de email de até uma hora', Number(c.mailer_otp_exp) > 0 && Number(c.mailer_otp_exp) <= 3600],
    ['Limites de envio e verificação configurados', Number(c.rate_limit_email_sent) > 0 && Number(c.rate_limit_verify) > 0],
    ['Cadastro anônimo desativado', c.external_anonymous_users_enabled === false],
  ].map(([name, passed]) => ({ name, status: passed ? 'configurado' : 'pendente' }));
}
export async function inspectAuth(env, fetcher = fetch) {
  const { SUPABASE_PROJECT_REF: ref, SUPABASE_MANAGEMENT_TOKEN: token, APP_ORIGIN: origin } = env;
  if (!/^[a-z0-9]{20}$/.test(ref || '') || !token || !origin || new URL(origin).origin !== origin || !origin.startsWith('https://'))
    throw new Error('Defina SUPABASE_PROJECT_REF, SUPABASE_MANAGEMENT_TOKEN e APP_ORIGIN HTTPS no ambiente seguro do operador.');
  const response = await fetcher(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Não foi possível consultar as configurações. Verifique acesso e projeto.');
  return checkAuthConfig(await response.json(), origin);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const checks = await inspectAuth(process.env);
    console.log(JSON.stringify({ checks, limitation: 'Configuração não comprova entrega SMTP, MFA, rejeição direta de CAPTCHA, backup ou compra real. Execute o roteiro de homologação.' }, null, 2));
    if (checks.some(c => c.status === 'pendente')) process.exitCode = 1;
  } catch { console.error('Verificação não concluída. Configure as variáveis do operador e confirme acesso ao projeto; nenhum segredo foi exibido.'); process.exitCode = 1; }
}
