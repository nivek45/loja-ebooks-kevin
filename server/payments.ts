// Fluxo Pix: criação de pedidos, conferência no Mercado Pago e webhooks.
import { z } from 'zod';
import {
  type Env,
  fail,
  one,
  run,
  statement,
  uid,
  now,
  alert,
  salesReady,
} from './base';
import { encrypt, decrypt, hmac, same, rate } from './security';
import type { Identity } from './auth';
export type ProviderFetch = typeof fetch;
const api = 'https://api.mercadopago.com';
export async function provider(
  e: Env,
  path: string,
  init: RequestInit = {},
  fetcher: ProviderFetch = fetch,
) {
  if (!e.MP_ACCESS_TOKEN) fail(503, 'Pix ainda não configurado.');
  let response: Response;
  try {
    response = await fetcher(api + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${e.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    fail(502, 'O provedor de pagamentos está indisponível. Tente novamente.');
  }
  if (!response.ok)
    fail(
      502,
      'Não foi possível consultar ou criar o Pix. Tente novamente usando o mesmo pedido.',
    );
  return response.json() as Promise<any>;
}
const cpfValid = (s: string) => {
  if (!/^\d{11}$/.test(s) || /^(\d)\1+$/.test(s)) return false;
  for (let n = 9; n <= 10; n++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(s[i]) * (n + 1 - i);
    const v = (sum * 10) % 11;
    if (Number(s[n]) !== (v === 10 ? 0 : v)) return false;
  }
  return true;
};
export const checkoutSchema = z
  .object({
    productId: z.uuid(),
    idempotencyKey: z.uuid(),
    cpf: z
      .string()
      .transform((v) => v.replace(/\D/g, ''))
      .refine(cpfValid, 'CPF inválido'),
    acceptTerms: z.literal(true),
  })
  .strict();
export async function createOrder(
  e: Env,
  user: Identity,
  input: unknown,
  fetcher: ProviderFetch = fetch,
) {
  if (!salesReady(e)) fail(503, 'Vendas ainda não disponíveis.');
  const data = checkoutSchema.parse(input);
  await rate(e, `checkout:${user.id}`, 15, 3600000);
  let order = await one(
    e,
    'SELECT * FROM orders WHERE user_id=? AND idempotency_key=?',
    user.id,
    data.idempotencyKey,
  );
  if (order) {
    const item = await one(
      e,
      'SELECT product_id FROM order_items WHERE order_id=?',
      order.id,
    );
    if (item?.product_id !== data.productId)
      fail(409, 'A tentativa já pertence a outro produto.');
    return ensurePayment(e, order, fetcher);
  }
  const product = await one(
    e,
    'SELECT * FROM products WHERE id=? AND published=1 AND file_id IS NOT NULL AND cover_id IS NOT NULL',
    data.productId,
  );
  if (!product) fail(404, 'Ebook indisponível.');
  const id = uid(),
    timestamp = now(),
    expiry = timestamp + 1800000;
  const payload = {
    transaction_amount: product.price / 100,
    description: product.title,
    payment_method_id: 'pix',
    payer: {
      email: user.email,
      identification: { type: 'CPF', number: data.cpf },
    },
    external_reference: id,
    metadata: { order_id: id },
    date_of_expiration: new Date(expiry).toISOString(),
    notification_url: new URL('/api/webhooks/mercadopago', e.APP_ORIGIN).href,
  };
  const cipher = await encrypt(e, payload);
  // Both statements run in the same D1 transaction; each snapshot is read from the database.
  await e.DB.batch([
    statement(
      e,
      `INSERT INTO orders (id,user_id,idempotency_key,status,amount,currency,mode,request_cipher,expires_at,created_at,provider_updated,reconciled_at) SELECT ?,?,?,'pending',price,'BRL',?,?,?, ?,0,0 FROM products WHERE id=? AND published=1 AND price=? AND file_id=? ON CONFLICT(user_id,idempotency_key) DO NOTHING`,
      id,
      user.id,
      data.idempotencyKey,
      e.PAYMENT_MODE,
      cipher,
      expiry,
      timestamp,
      product.id,
      product.price,
      product.file_id,
    ),
    statement(
      e,
      `INSERT INTO order_items (order_id,product_id,title,price,file_id) SELECT o.id,p.id,p.title,p.price,p.file_id FROM products p JOIN orders o ON o.id=? WHERE p.id=? ON CONFLICT(order_id) DO NOTHING`,
      id,
      product.id,
    ),
  ]);
  order = await one(
    e,
    'SELECT * FROM orders WHERE user_id=? AND idempotency_key=?',
    user.id,
    data.idempotencyKey,
  );
  if (!order) fail(409, 'O produto mudou. Atualize o resumo antes de comprar.');
  const saved = await one(
    e,
    'SELECT product_id FROM order_items WHERE order_id=?',
    order.id,
  );
  if (saved?.product_id !== data.productId)
    fail(409, 'Tentativa já utilizada.');
  return ensurePayment(e, order, fetcher);
}
export async function ensurePayment(
  e: Env,
  order: any,
  fetcher: ProviderFetch = fetch,
) {
  if (order.mode !== e.PAYMENT_MODE)
    fail(409, 'Pedido pertence a outro ambiente.');
  if (order.payment_id) return order;
  if (order.expires_at <= now()) {
    await run(e, "UPDATE orders SET status='expired',request_cipher='' WHERE id=? AND payment_id IS NULL AND status='pending'", order.id);
    return (await one(e, 'SELECT * FROM orders WHERE id=?', order.id))!;
  }
  try {
    const p = await provider(
      e,
      '/v1/payments',
      {
        method: 'POST',
        headers: { 'X-Idempotency-Key': order.id },
        body: JSON.stringify(await decrypt(e, order.request_cipher)),
      },
      fetcher,
    );
    validatePayment(e, order, p);
    await run(
      e,
      'UPDATE orders SET payment_id=?,qr_code=?,qr_image=? WHERE id=? AND (payment_id IS NULL OR payment_id=?)',
      String(p.id),
      p.point_of_interaction?.transaction_data?.qr_code || null,
      p.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      order.id,
      String(p.id),
    );
    await reconcile(e, order.id, fetcher);
    return (await one(e, 'SELECT * FROM orders WHERE id=?', order.id))!;
  } catch (error) {
    await alert(e, 'payment_creation_failed', order.id);
    throw error;
  }
}
export function validatePayment(e: Env, order: any, p: any) {
  const cents = Number(p.transaction_amount) * 100;
  if (
    !p.id ||
    !/^[0-9]+$/.test(String(p.id)) ||
    p.external_reference !== order.id ||
    p.metadata?.order_id !== order.id ||
    p.currency_id !== 'BRL' ||
    Math.abs(cents - order.amount) > 0.000001 ||
    !Number.isFinite(cents) ||
    String(p.collector_id) !== e.MP_COLLECTOR_ID ||
    p.payment_method_id !== 'pix' ||
    p.live_mode !== (order.mode === 'production') ||
    (order.payment_id && String(p.id) !== order.payment_id)
  )
    fail(422, 'Dados do pagamento não correspondem ao pedido.');
}
export function mapStatus(p: any) {
  if (
    p.status === 'refunded' ||
    p.status === 'charged_back' ||
    Number(p.transaction_amount_refunded) > 0
  )
    return 'refunded';
  if (p.status === 'approved') return 'approved';
  if (p.status === 'cancelled')
    return p.status_detail === 'expired' ? 'expired' : 'cancelled';
  if (p.status === 'rejected') return 'cancelled';
  if (
    p.status === 'pending' ||
    p.status === 'in_process' ||
    p.status === 'authorized'
  )
    return Date.parse(p.date_of_expiration) <= now() ? 'expired' : 'pending';
  return 'pending';
}
export async function reconcile(
  e: Env,
  id: string,
  fetcher: ProviderFetch = fetch,
) {
  let o = await one(e, 'SELECT * FROM orders WHERE id=?', id);
  if (!o) fail(404, 'Pedido não encontrado.');
  if (o.mode !== e.PAYMENT_MODE) fail(409, 'Ambiente incompatível.');
  if (!o.payment_id) {
    o = await ensurePayment(e, o, fetcher);
    return o;
  }
  const p = await provider(
    e,
    `/v1/payments/${encodeURIComponent(o.payment_id)}`,
    {},
    fetcher,
  );
  try {
    validatePayment(e, o, p);
  } catch (error) {
    await alert(e, 'payment_mismatch', o.id);
    throw error;
  }
  const updated = Date.parse(p.date_last_updated);
  if (!Number.isFinite(updated))
    fail(422, 'Pagamento sem data de atualização válida.');
  const status = mapStatus(p);
  const eventId = `${p.id}:${updated}:${status}`;
  // Unique event plus conditional monotonic update in one atomic batch. Refund is terminal.
  await e.DB.batch([
    statement(
      e,
      'INSERT INTO payment_events (id,order_id,status,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
      eventId,
      o.id,
      status,
      now(),
    ),
    statement(
      e,
      `UPDATE orders SET status=?,provider_updated=?,reconciled_at=?,request_cipher=CASE WHEN ? IN ('approved','refunded','cancelled','expired') THEN '' ELSE request_cipher END WHERE id=? AND (provider_updated<? OR (provider_updated=? AND (?='refunded' OR (?='expired' AND status='pending')))) AND (status!='refunded' OR ?='refunded')`,
      status,
      updated,
      now(),
      status,
      o.id,
      updated,
      updated,
      status,
      status,
      status,
    ),
    statement(e, 'UPDATE orders SET reconciled_at=? WHERE id=?', now(), o.id),
  ]);
  return (await one(e, 'SELECT * FROM orders WHERE id=?', o.id))!;
}
export async function webhook(
  request: Request,
  e: Env,
  fetcher: ProviderFetch = fetch,
) {
  if (!e.MP_WEBHOOK_SECRET) fail(503, 'Webhook não configurado.');
  const id = new URL(request.url).searchParams.get('data.id');
  const requestId = request.headers.get('x-request-id');
  const sig = request.headers.get('x-signature') || '';
  const parts = Object.fromEntries(
    sig.split(',').map((s) => s.trim().split('=')),
  );
  if (
    !id ||
    !/^\d+$/.test(id) ||
    !requestId ||
    !parts.ts ||
    !/^\d{10,13}$/.test(parts.ts) ||
    !parts.v1 ||
    !/^[a-f0-9]{64}$/i.test(parts.v1)
  )
    fail(401, 'Notificação inválida.');
  const expected = await hmac(
    e.MP_WEBHOOK_SECRET,
    `id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`,
  );
  if (!same(expected, parts.v1.toLowerCase())) {
    await alert(e, 'invalid_webhook');
    fail(401, 'Notificação inválida.');
  }
  // Signature may be retried later: no narrow clock window. Replays only re-fetch authoritative data.
  const p = await provider(
    e,
    `/v1/payments/${encodeURIComponent(id)}`,
    {},
    fetcher,
  );
  const o = await one(
    e,
    'SELECT * FROM orders WHERE id=?',
    String(p.external_reference || ''),
  );
  if (!o) return;
  validatePayment(e, o, p);
  await run(
    e,
    'UPDATE orders SET payment_id=? WHERE id=? AND payment_id IS NULL',
    id,
    o.id,
  );
  await reconcile(e, o.id, fetcher);
}
export function publicOrder(o: any) {
  return {
    id: o.id,
    status:
      o.status === 'pending' && o.expires_at <= now() ? 'expired' : o.status,
    amount: o.amount,
    currency: o.currency,
    mode: o.mode,
    qrCode: o.qr_code,
    qrImage: o.qr_image,
    expiresAt: o.expires_at,
    createdAt: o.created_at,
  };
}
