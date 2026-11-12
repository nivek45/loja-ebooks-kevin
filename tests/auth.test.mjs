import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { handle } from '../work/test-runtime/server/router.mjs';
// Auth provider is deliberately replaced at the HTTP boundary. No real emails are sent.
test('Supabase SDK signup/login/recovery/verification/logout contract and HttpOnly cookies', async () => {
  const f = await fixture();
  const savedFetch = globalThis.fetch;
  const calls = [];
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'auth@example.test',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: 'test-access',
    refresh_token: 'test-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  };
  globalThis.fetch = async (url, options = {}) => {
    const p = String(url);
    calls.push(p);
    if (p.includes('/signup')) return Response.json({ user, session: null });
    if (p.includes('/recover')) return Response.json({});
    if (p.includes('/verify')) return Response.json(session);
    if (p.includes('/logout')) return new Response(null, { status: 204 });
    if (p.includes('/token')) {
      const data = JSON.parse(options.body);
      return data.password === 'Valid-test-password-123'
        ? Response.json(session)
        : Response.json(
            { msg: 'Invalid login credentials', code: 'invalid_credentials' },
            { status: 400 },
          );
    }
    return Response.json({ user });
  };
  const call = (path, input) =>
    handle(
      new Request(f.e.APP_ORIGIN + '/api/auth/' + path, {
        method: 'POST',
        headers: { Origin: f.e.APP_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
      f.e,
    );
  try {
    assert.equal(
      (
        await call('signup', {
          email: user.email,
          password: 'Valid-test-password-123',
        })
      ).status,
      200,
    );
    assert.equal(
      (await call('login', { email: user.email, password: 'bad' })).status,
      401,
    );
    const login = await call('login', {
      email: user.email,
      password: 'Valid-test-password-123',
    });
    assert.equal(login.status, 200);
    const cookies = login.headers.get('set-cookie');
    assert.match(cookies, /HttpOnly/);
    assert.match(cookies, /Secure/);
    assert.match(cookies, /SameSite=Strict/);
    assert.doesNotMatch(await login.text(), /test-access|test-refresh/);
    const recoveryA = await call('recover', { email: user.email }),
      recoveryB = await call('recover', { email: 'missing@example.test' });
    assert.deepEqual(await recoveryA.json(), await recoveryB.json());
    const verify = await call('verify', {
      token_hash: 'test-email-token-hash',
      type: 'signup',
    });
    assert.equal(verify.status, 200);
    assert.ok(calls.some((p) => p.includes('/verify')));
    const logout = await call('logout', {});
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  } finally {
    globalThis.fetch = savedFetch;
    await f.mf.dispose();
  }
});
