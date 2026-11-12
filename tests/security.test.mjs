import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, alice, bob, productId } from './fixture.mjs';
let f;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f?.mf.dispose();
});
test('price injection is rejected; legitimate amount comes from DB and is snapshotted', async () => {
  const r = await f.call('checkout', {
    productId,
    idempotencyKey: crypto.randomUUID(),
    cpf: '52998224725',
    acceptTerms: true,
    price: 1,
    status: 'approved',
  });
  assert.equal(r.status, 400);
  assert.equal(f.createCount, 0);
  const { order } = await f.buy();
  assert.equal(order.amount, 2990);
  assert.equal(f.payment.transaction_amount, 29.9);
  await f.DB.prepare('UPDATE products SET price=9990 WHERE id=?')
    .bind(productId)
    .run();
  const r2 = await f.call('orders/' + order.id);
  assert.equal((await r2.json()).amount, 2990);
});
test('one customer cannot read or reconcile another customer order', async () => {
  const { order } = await f.buy();
  for (const [path, body] of [
    ['orders/' + order.id, undefined],
    ['orders/' + order.id + '/reconcile', {}],
    ['orders/' + order.id + '/download', {}],
  ])
    assert.equal((await f.call(path, body, bob)).status, 404);
  assert.deepEqual(
    (await (await f.call('orders', undefined, bob)).json()).orders,
    [],
  );
});
test('every administrative action refuses ordinary users, even aal2 and supplied admin fields', async () => {
  for (const u of [alice, { ...alice, aal: 'aal2' }])
    for (const [path, body] of [
      ['products', undefined],
      ['products', { role: 'admin' }],
      ['upload', {}],
      ['orders', undefined],
      ['audit', undefined],
      ['readiness', undefined],
      ['reconcile', { id: crypto.randomUUID() }],
    ])
      assert.equal((await f.call('admin/' + path, body, u)).status, 403);
  assert.equal(
    (await f.DB.prepare('SELECT COUNT(*) n FROM admins').first()).n,
    0,
  );
});
test('administrator needs both allowlist and verified MFA', async () => {
  await f.DB.prepare('INSERT INTO admins VALUES (?,?,?)')
    .bind(alice.id, Date.now(), 'operator')
    .run();
  assert.equal((await f.call('admin/products')).status, 403);
  assert.equal(
    (await f.call('admin/products', undefined, { ...alice, aal: 'aal2' }))
      .status,
    200,
  );
});
test('fake webhook never queries provider or releases a file', async () => {
  const { order } = await f.buy();
  const count = f.fetchCount;
  const r = await f.call(
    'webhooks/mercadopago?data.id=991',
    { status: 'approved' },
    alice,
    'POST',
    {
      'x-signature': 'ts=1234567890,v1=' + 'a'.repeat(64),
      'x-request-id': 'fake',
    },
  );
  assert.equal(r.status, 401);
  assert.equal(f.fetchCount, count);
  assert.equal(
    (await f.call('orders/' + order.id + '/download', {})).status,
    404,
  );
});
for (const mismatch of [
  { transaction_amount: 0.01 },
  { currency_id: 'USD' },
  { collector_id: 666 },
  { live_mode: true },
  { external_reference: 'wrong' },
  { metadata: { order_id: 'wrong' } },
  { payment_method_id: 'credit_card' },
  { id: 992 },
])
  test(
    'mismatched provider record blocked ' + JSON.stringify(mismatch),
    async () => {
      const { order } = await f.buy();
      f.approve();
      f.setPayment(mismatch);
      const r = await f.call('orders/' + order.id + '/reconcile', {});
      assert.equal(r.status, 422);
      assert.equal(
        (await f.call('orders/' + order.id + '/download', {})).status,
        404,
      );
    },
  );
test('duplicate signed notifications do not duplicate events or delivery', async () => {
  const { order } = await f.buy();
  f.approve();
  assert.equal((await f.signedWebhook()).status, 200);
  const n = (
    await f.DB.prepare('SELECT COUNT(*) n FROM payment_events').first()
  ).n;
  assert.equal((await f.signedWebhook()).status, 200);
  assert.equal(
    (await f.DB.prepare('SELECT COUNT(*) n FROM payment_events').first()).n,
    n,
  );
  assert.equal(
    (await f.call('orders/' + order.id + '/download', {})).status,
    200,
  );
});
test('creation idempotency avoids duplicate charges and orders', async () => {
  const key = crypto.randomUUID();
  const a = await f.buy(key),
    b = await f.buy(key);
  assert.equal(a.order.id, b.order.id);
  assert.equal(f.createCount, 1);
  assert.equal(
    (await f.DB.prepare('SELECT COUNT(*) n FROM orders').first()).n,
    1,
  );
});
for (const status of ['pending', 'cancelled', 'expired'])
  test(status + ' does not allow downloads', async () => {
    const { order } = await f.buy();
    if (status !== 'pending') {
      f.setPayment({
        status: status === 'expired' ? 'cancelled' : status,
        status_detail: status === 'expired' ? 'expired' : 'by_user',
        date_last_updated: new Date(Date.now() + 1000).toISOString(),
      });
      await f.signedWebhook();
    }
    assert.equal(
      (await f.call('orders/' + order.id + '/download', {})).status,
      404,
    );
  });
test('paid flow produces an authenticated one-use download; other accounts and expired links fail', async () => {
  const { order } = await f.buy();
  f.approve();
  await f.signedWebhook();
  const link = await (
    await f.call('orders/' + order.id + '/download', {})
  ).json();
  const path = link.url.slice(5);
  assert.equal((await f.call(path, undefined, bob)).status, 404);
  const content = await f.call(path);
  assert.equal(content.status, 200);
  assert.equal(await content.text(), '%PDF-1.7 fixture');
  assert.equal(
    content.headers.get('content-disposition'),
    'attachment; filename="ebook.pdf"',
  );
  assert.equal((await f.call(path)).status, 404);
  const link2 = await (
    await f.call('orders/' + order.id + '/download', {})
  ).json();
  await f.DB.prepare('UPDATE download_tokens SET expires_at=0').run();
  assert.equal((await f.call(link2.url.slice(5))).status, 404);
  assert.equal((await f.call('files/ebook/private.pdf')).status, 404);
});
test('refund revokes already issued links and out-of-order approval cannot restore access', async () => {
  const { order } = await f.buy();
  f.approve();
  await f.signedWebhook();
  const link = await (
    await f.call('orders/' + order.id + '/download', {})
  ).json();
  f.setPayment({
    status: 'refunded',
    date_last_updated: new Date(Date.now() + 3000).toISOString(),
  });
  await f.signedWebhook();
  assert.equal((await f.call(link.url.slice(5))).status, 404);
  f.setPayment({
    status: 'approved',
    date_last_updated: new Date(Date.now() + 1000).toISOString(),
  });
  await f.signedWebhook();
  assert.equal(
    (await (await f.call('orders/' + order.id)).json()).status,
    'refunded',
  );
});
test('provider outage never marks a payment approved and retry reuses the original idempotency key', async () => {
  f.setFailure(true);
  const { order, key, response } = await f.buy();
  assert.equal(response.status, 502);
  assert.ok(order.error);
  const row = await f.DB.prepare('SELECT * FROM orders').first();
  assert.equal(row.status, 'pending');
  f.setFailure(false);
  const retry = await f.buy(key);
  assert.equal(retry.order.id, row.id);
  assert.equal(retry.order.status, 'pending');
});
test('cross-origin mutations are rejected, and raw private fields are not returned', async () => {
  assert.equal(
    (
      await f.call('checkout', {}, alice, 'POST', {
        Origin: 'https://attacker.test',
      })
    ).status,
    403,
  );
  const { order } = await f.buy();
  assert.equal('requestCipher' in order, false);
  assert.equal('request_cipher' in order, false);
  assert.equal('user_id' in order, false);
});
test('download issuance has a persistent quota', async () => {
  const { order } = await f.buy();
  f.approve();
  await f.signedWebhook();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await f.call('orders/' + order.id + '/download', {})).status,
      200,
    );
  assert.equal(
    (await f.call('orders/' + order.id + '/download', {})).status,
    429,
  );
});
test('upload is fail-closed when scanner is not configured', async () => {
  await f.DB.prepare('INSERT INTO admins VALUES (?,?,?)')
    .bind(alice.id, Date.now(), 'operator')
    .run();
  delete f.e.SCANNER_URL;
  assert.equal(
    (await f.call('admin/upload', {}, { ...alice, aal: 'aal2' })).status,
    503,
  );
});
test('local D1 fixture export restores relational data and PDF checksum', async () => {
  await f.buy();
  const { exportFixture } = await import('./export-fixture.mjs');
  const { DatabaseSync } = await import('node:sqlite');
  const { readFile, mkdtemp, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { createHash } = await import('node:crypto');
  const temp = await mkdtemp(join(process.cwd(), 'work/restore-'));
  try {
    const file = join(temp, 'backup.sql');
    await exportFixture(f.DB, file);
    const db = new DatabaseSync(':memory:');
    db.exec(await readFile(file, 'utf8'));
    assert.equal(
      db.prepare('PRAGMA integrity_check').get().integrity_check,
      'ok',
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(
      db
        .prepare(
          'SELECT COUNT(*) n FROM orders JOIN order_items ON orders.id=order_items.order_id',
        )
        .get().n,
      1,
    );
    const original = await (
      await f.FILES.get('ebook/private.pdf')
    ).arrayBuffer();
    await f.FILES.put('restore/private.pdf', original);
    const restored = await (
      await f.FILES.get('restore/private.pdf')
    ).arrayBuffer();
    assert.equal(
      createHash('sha256').update(Buffer.from(original)).digest('hex'),
      createHash('sha256').update(Buffer.from(restored)).digest('hex'),
    );
    db.close();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test('unauthenticated API request and forged session cannot download', async () => {
  const { handle } = await import('../work/test-runtime/server/router.mjs');
  const { order } = await f.buy();
  f.approve();
  await f.signedWebhook();
  const r = await handle(
    new Request(f.e.APP_ORIGIN + '/api/orders/' + order.id + '/download', {
      method: 'POST',
      headers: { Origin: f.e.APP_ORIGIN },
      body: '{}',
    }),
    f.e,
  );
  assert.equal(r.status, 401);
});
test('parallel checkout retries have one database order and one provider idempotency key', async () => {
  const key = crypto.randomUUID();
  const [a, b] = await Promise.all([f.buy(key), f.buy(key)]);
  assert.equal(a.response.status, 201);
  assert.equal(b.response.status, 201);
  assert.equal(a.order.id, b.order.id);
  assert.equal(
    (await f.DB.prepare('SELECT COUNT(*) n FROM orders').first()).n,
    1,
  );
});
test('authoritative cancellation after approval revokes access', async () => {
  const { order } = await f.buy();
  f.approve();
  await f.signedWebhook();
  f.setPayment({
    status: 'cancelled',
    date_last_updated: new Date(Date.now() + 4000).toISOString(),
  });
  await f.signedWebhook();
  assert.equal(
    (await f.call('orders/' + order.id + '/download', {})).status,
    404,
  );
});
test('refund at the same provider timestamp is conservative and terminal', async () => {
  const { order } = await f.buy();
  f.approve();
  await f.signedWebhook();
  f.setPayment({ status: 'refunded' });
  await f.signedWebhook();
  assert.equal(
    (await f.call('orders/' + order.id + '/download', {})).status,
    404,
  );
});
test('older purchases remain reachable through owner-scoped pagination', async () => {
  const { order } = await f.buy();
  for (let n = 0; n < 100; n++) {
    const id = crypto.randomUUID();
    await f.DB.batch([
      f.DB.prepare(
        "INSERT INTO orders (id,user_id,idempotency_key,status,amount,currency,mode,request_cipher,expires_at,created_at,provider_updated,reconciled_at) SELECT ?,user_id,?,'pending',amount,currency,mode,'',expires_at,created_at-?,0,0 FROM orders WHERE id=?",
      ).bind(id, id, n + 1, order.id),
      f.DB.prepare(
        'INSERT INTO order_items SELECT ?,product_id,title,price,file_id FROM order_items WHERE order_id=?',
      ).bind(id, order.id),
    ]);
  }
  const first = await (await f.call('orders')).json();
  const second = await (await f.call('orders?page=2')).json();
  assert.equal(first.orders.length, 100);
  assert.equal(first.hasMore, true);
  assert.equal(second.orders.length, 1);
  assert.equal(second.hasMore, false);
  assert.equal(
    (await (await f.call('orders?page=2', undefined, bob)).json()).orders
      .length,
    0,
  );
});

test('expired pending payment advances even when provider timestamp is unchanged', async () => {
  const { order } = await f.buy();
  f.setPayment({date_of_expiration: new Date(Date.now() - 1000).toISOString()});
  assert.equal((await f.call('orders/' + order.id + '/reconcile', {})).status, 200);
  assert.equal((await f.DB.prepare('SELECT status FROM orders WHERE id=?').bind(order.id).first()).status, 'expired');
  assert.equal((await f.call('orders/' + order.id + '/download', {})).status, 404);
});

test('expired failed creation is closed by maintenance without another charge', async () => {
  f.setFailure(true);
  await f.buy();
  const order = await f.DB.prepare('SELECT * FROM orders LIMIT 1').first();
  await f.DB.prepare('UPDATE orders SET expires_at=? WHERE id=?').bind(Date.now()-1000, order.id).run();
  const count = f.fetchCount;
  const result = await f.call('internal/maintenance', {}, alice, 'POST', {Authorization: 'Bearer ' + f.e.CRON_SECRET});
  assert.equal(result.status, 200);
  assert.equal(f.fetchCount, count);
  const stored = await f.DB.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first();
  assert.equal(stored.status, 'expired');
  assert.equal(stored.request_cipher, '');
});

test('login readiness requires rate limiting and a valid configured origin', async () => {
  assert.equal((await (await f.call('config')).json()).authReady, true);
  f.e.RATE_LIMIT_SECRET = '';
  assert.equal((await (await f.call('config')).json()).authReady, false);
  f.e.RATE_LIMIT_SECRET = 'test';
  f.e.APP_ORIGIN = 'https://shop.example.test/path';
  const {handle} = await import('../work/test-runtime/server/router.mjs');
  assert.equal((await (await handle(new Request('https://shop.example.test/api/config'), f.e)).json()).authReady, false);
});

test('admin readiness returns configuration presence without credential values', async () => {
  await f.DB.prepare('INSERT INTO admins (user_id,created_at,created_by) VALUES (?,?,?)').bind(alice.id, Date.now(), 'test-operator').run();
  const result = await f.call('admin/readiness', undefined, {...alice, aal:'aal2'});
  assert.equal(result.status, 200);
  const text = await result.text();
  assert.doesNotMatch(text, /test-only|test-publishable|example\.test/);
  assert.equal(JSON.parse(text).checks.length, 6);
});

test('invalid CPF has actionable message without creating a charge', async () => {
  const r = await f.call('checkout', {productId, idempotencyKey:crypto.randomUUID(), cpf:'11111111111', acceptTerms:true});
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /CPF válido/);
  assert.equal(f.createCount, 0);
});
