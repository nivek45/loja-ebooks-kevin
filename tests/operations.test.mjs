import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, alice } from './fixture.mjs';
import { handle } from '../work/test-runtime/server/router.mjs';
import { inspectAuth, checkAuthConfig } from '../scripts/check-auth-config.mjs';

test('native CAPTCHA is required and passed to Supabase for all public credential flows', async () => {
  const f = await fixture(), saved = globalThis.fetch, seen = [];
  f.e.TURNSTILE_SITE_KEY = 'test-widget-key';
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ msg: 'captcha rejected', code: 'captcha_failed' }, { status: 400 });
  };
  const call = (mode, data) => handle(new Request(f.e.APP_ORIGIN + '/api/auth/' + mode, {
    method: 'POST', headers: { Origin: f.e.APP_ORIGIN }, body: JSON.stringify(data),
  }), f.e);
  try {
    for (const mode of ['login', 'signup', 'recover']) {
      const input = { email: 'fixture@example.test', ...(mode !== 'recover' ? { password: 'test-password-long' } : {}) };
      assert.equal((await call(mode, input)).status, 400);
      const before = seen.length;
      const rejected = await call(mode, { ...input, captchaToken: 'invalid-test-token' });
      assert.equal(seen.length, before + 1);
      assert.equal(seen.at(-1).body.gotrue_meta_security.captcha_token, 'invalid-test-token');
      assert.equal(rejected.headers.get('set-cookie'), null);
      if (mode === 'login') assert.equal(rejected.status, 401);
    }
    delete f.e.TURNSTILE_SITE_KEY;
    f.e.PAYMENT_MODE = 'production';
    assert.equal((await call('login', { email: 'fixture@example.test', password: 'test' })).status, 503);
    assert.equal((await (await f.call('config')).json()).salesEnabled, false);
  } finally { globalThis.fetch = saved; await f.mf.dispose(); }
});

test('alert delivery failure remains queued and retry uses the same idempotency key', async () => {
  const f = await fixture(), saved = globalThis.fetch, keys = [];
  let success = false;
  try {
    await f.DB.prepare('INSERT INTO alerts (id,kind,target,created_at) VALUES (?,?,?,?)').bind('delivery-test', 'test', '', Date.now()).run();
    globalThis.fetch = async (_url, init) => { keys.push(init.headers['Idempotency-Key']); return new Response(null, {status: success ? 204 : 503}); };
    const run = () => f.call('internal/maintenance', {}, alice, 'POST', {Authorization: 'Bearer ' + f.e.CRON_SECRET});
    assert.equal((await (await run()).json()).alertsSent, 0);
    assert.equal((await f.DB.prepare('SELECT sent_at FROM alerts WHERE id=?').bind('delivery-test').first()).sent_at, null);
    success = true;
    assert.equal((await (await run()).json()).alertsSent, 1);
    assert.equal((await (await run()).json()).alertsSent, 0);
    assert.deepEqual(keys, ['delivery-test', 'delivery-test']);
  } finally { globalThis.fetch = saved; await f.mf.dispose(); }
});

test('provider configuration inspector is read-only and never returns secrets', async () => {
  const report = await inspectAuth({ SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_MANAGEMENT_TOKEN: 'operator-secret', APP_ORIGIN: 'https://shop.example.test' }, async (url, init) => {
    assert.equal(init.method, undefined); assert.equal(init.redirect, 'error');
    assert.equal(url, 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth');
    return Response.json({ smtp_pass: 'smtp-secret', security_captcha_secret: 'captcha-secret', password_min_length: 6 });
  });
  assert.doesNotMatch(JSON.stringify(report), /operator-secret|smtp-secret|captcha-secret/);
  assert.ok(report.every(c => c.status === 'pendente'));
  assert.equal(checkAuthConfig({site_url:'https://shop.example.test',uri_allow_list:'https://shop.example.test/conta/confirmar,https://evil.test/**'},'https://shop.example.test')[0].status,'pendente');
});

test('MFA challenge contract rejects wrong codes and writes the provider session only on success', async () => {
  const f = await fixture(), saved = globalThis.fetch;
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = aal => b64({alg:'HS256',typ:'JWT'}) + '.' + b64({sub:alice.id,exp:Math.floor(Date.now()/1000)+3600,aal}) + '.dGVzdA';
  const factorId = '66666666-6666-4666-8666-666666666666';
  const user = {...alice, email_confirmed_at:new Date().toISOString(), factors:[{id:factorId,factor_type:'totp',status:'verified'}]};
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/challenge')) return Response.json({id:'challenge-test',type:'totp',expires_at:Math.floor(Date.now()/1000)+60});
    if (path.endsWith('/verify')) {
      const data = JSON.parse(init.body);
      assert.equal(data.challenge_id, 'challenge-test');
      return data.code === '123456'
        ? Response.json({access_token:jwt('aal2'),refresh_token:'rotated-test',expires_in:3600,token_type:'bearer',user})
        : Response.json({msg:'invalid code',code:'mfa_verification_failed'},{status:400});
    }
    if (path.endsWith('/factors')) return Response.json({id:factorId,totp:{secret:'test-secret',uri:'otpauth://totp/test'}});
    return Response.json(user);
  };
  const call = (mode, input) => handle(new Request(f.e.APP_ORIGIN + '/api/auth/' + mode, {
    method:'POST',headers:{Origin:f.e.APP_ORIGIN,Cookie:`__Host-access=${jwt('aal1')}; __Host-refresh=test`},body:JSON.stringify(input),
  }),f.e);
  try {
    assert.equal((await call('mfa-enroll',{})).status,200);
    assert.equal((await (await call('mfa-list',{})).json()).factors[0].id,factorId);
    const bad = await call('mfa-verify',{factorId,code:'000000'});
    assert.equal(bad.status,401); assert.equal(bad.headers.get('set-cookie'),null);
    const good = await call('mfa-verify',{factorId,code:'123456'});
    assert.equal(good.status,200); assert.match(good.headers.get('set-cookie'),/rotated-test/);
    assert.doesNotMatch(await good.text(),/rotated-test|access_token|test-secret/);
  } finally { globalThis.fetch=saved; await f.mf.dispose(); }
});

test('expired or reused recovery tokens rejected by provider never create a session', async () => {
  const f = await fixture(), saved = globalThis.fetch;
  globalThis.fetch = async () => Response.json({msg:'expired or used',code:'otp_expired'},{status:403});
  try {
    for(let i=0;i<2;i++) {
      const r=await handle(new Request(f.e.APP_ORIGIN+'/api/auth/verify',{method:'POST',headers:{Origin:f.e.APP_ORIGIN},body:JSON.stringify({type:'recovery',token_hash:'used-token-fixture'})}),f.e);
      assert.equal(r.status,400); assert.equal(r.headers.get('set-cookie'),null);
    }
  } finally {globalThis.fetch=saved;await f.mf.dispose();}
});
