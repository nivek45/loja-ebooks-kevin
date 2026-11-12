import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { handle } from '../work/test-runtime/server/router.mjs';
import { hmac } from '../work/test-runtime/server/security.mjs';
export const alice = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alice@example.test',
  aal: 'aal1',
  token: 'test-boundary',
};
export const bob = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'bob@example.test',
  aal: 'aal1',
  token: 'test-boundary',
};
export const productId = '33333333-3333-4333-8333-333333333333',
  fileId = '44444444-4444-4444-8444-444444444444',
  coverId = '55555555-5555-4555-8555-555555555555';
export async function fixture() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'test',
          modules: true,
          script: 'export default {fetch(){return new Response("test")}}',
          compatibilityDate: '2026-05-15',
          d1Databases: ['DB'],
          r2Buckets: ['FILES'],
        },
      ],
    }),
  );
  const DB = await mf.getD1Database('DB'),
    FILES = await mf.getR2Bucket('FILES');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync('drizzle/' + file, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean))
      await DB.prepare(sql).run();
  }
  const e = {
    DB,
    FILES,
    APP_ORIGIN: 'https://shop.example.test',
    STORE_NAME: 'TEST ONLY',
    SALES_ENABLED: 'true',
    PAYMENT_MODE: 'test',
    SUPABASE_URL: 'https://auth.example.test',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
    MP_ACCESS_TOKEN: 'test-only-not-a-real-credential',
    MP_WEBHOOK_SECRET: 'test-only-secret',
    MP_COLLECTOR_ID: '123',
    PII_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    RATE_LIMIT_SECRET: 'test-only-rate',
    CRON_SECRET: 'test-only-cron',
    SCANNER_URL: 'https://scanner.example.test',
    SCANNER_TOKEN: 'test-scanner',
    ALERT_URL: 'https://alerts.example.test',
    ALERT_TOKEN: 'test-alert',
    LEGAL_NAME: 'TEST',
    LEGAL_DOCUMENT: 'TEST',
    LEGAL_ADDRESS: 'TEST',
    CONTACT_EMAIL: 'example@example.test',
    LEGAL_REVIEWED: 'true',
  };
  await DB.prepare(
    'INSERT INTO files (id,key,kind,mime,size,sha256,created_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(
      fileId,
      'ebook/private.pdf',
      'ebook',
      'application/pdf',
      9,
      'fixture',
      Date.now(),
    )
    .run();
  await DB.prepare(
    'INSERT INTO files (id,key,kind,mime,size,sha256,created_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(
      coverId,
      'cover/cover.png',
      'cover',
      'image/png',
      9,
      'fixture',
      Date.now(),
    )
    .run();
  await FILES.put('ebook/private.pdf', '%PDF-1.7 fixture');
  await DB.prepare(
    'INSERT INTO products (id,title,description,price,published,cover_id,file_id,updated_at) VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(
      productId,
      'Ebook TESTE',
      'Produto exclusivo de teste automatizado.',
      2990,
      1,
      coverId,
      fileId,
      Date.now(),
    )
    .run();
  let payment,
    createCount = 0,
    fetchCount = 0,
    failProvider = false;
  const fetcher = async (url, init = {}) => {
    fetchCount++;
    if (failProvider) return new Response('{}', { status: 503 });
    if (init.method === 'POST') {
      createCount++;
      const p = JSON.parse(init.body);
      payment = {
        id: 991,
        external_reference: p.external_reference,
        metadata: p.metadata,
        transaction_amount: p.transaction_amount,
        currency_id: 'BRL',
        collector_id: 123,
        payment_method_id: 'pix',
        live_mode: false,
        status: 'pending',
        date_last_updated: new Date().toISOString(),
        date_of_expiration: p.date_of_expiration,
        point_of_interaction: {
          transaction_data: {
            qr_code: 'TEST-NON-PAYABLE',
            qr_code_base64: null,
          },
        },
      };
    }
    return Response.json(payment);
  };
  const call = (
    path,
    body,
    user = alice,
    method = body === undefined ? 'GET' : 'POST',
    extra = {},
  ) =>
    handle(
      new Request(e.APP_ORIGIN + '/api/' + path, {
        method,
        headers: {
          Origin: e.APP_ORIGIN,
          'Content-Type': 'application/json',
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      e,
      { identity: async () => user, fetcher },
    );
  const buy = async (key = crypto.randomUUID()) => {
    const response = await call('checkout', {
      productId,
      idempotencyKey: key,
      cpf: '52998224725',
      acceptTerms: true,
    });
    return { response, order: await response.json(), key };
  };
  const signedWebhook = async () => {
    const id = '991',
      ts = String(Math.floor(Date.now() / 1000)),
      rid = 'test-request';
    const signature = await hmac(
      e.MP_WEBHOOK_SECRET,
      `id:${id};request-id:${rid};ts:${ts};`,
    );
    return call(
      'webhooks/mercadopago?data.id=' + id,
      { untrusted: 'ignored' },
      alice,
      'POST',
      { 'x-request-id': rid, 'x-signature': `ts=${ts},v1=${signature}` },
    );
  };
  return {
    e,
    mf,
    DB,
    FILES,
    call,
    buy,
    signedWebhook,
    fetcher,
    get payment() {
      return payment;
    },
    setPayment(p) {
      payment = { ...payment, ...p };
    },
    approve() {
      payment = {
        ...payment,
        status: 'approved',
        date_last_updated: new Date(Date.now() + 1000).toISOString(),
      };
    },
    setFailure(v) {
      failProvider = v;
    },
    get createCount() {
      return createCount;
    },
    get fetchCount() {
      return fetchCount;
    },
  };
}
