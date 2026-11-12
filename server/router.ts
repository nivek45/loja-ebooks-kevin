import { z } from 'zod';
// Roteador principal: valida solicitações e direciona cada endpoint para o módulo responsável.
import {
  type Env,
  fail,
  all,
  one,
  json,
  uid,
  now,
  statement,
  auditStatement,
  run,
  alert,
  HttpError,
  salesReady,
  authReady,
} from './base';
import { identity, admin, authRoute } from './auth';
import { body, csrf, protect, rate, same } from './security';
import {
  createOrder,
  publicOrder,
  reconcile,
  webhook,
  type ProviderFetch,
} from './payments';
import { upload, downloadLink, download, cover } from './files';
const idSchema = z.uuid();
const productSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(20).max(10000),
    price: z.number().int().min(100).max(1000000),
    published: z.boolean(),
    coverId: z.uuid().nullable(),
    fileId: z.uuid().nullable(),
  })
  .strict();
export interface Deps {
  identity?: typeof identity;
  fetcher?: ProviderFetch;
}
export async function handle(request: Request, e: Env, deps: Deps = {}) {
  try {
    return protect(await route(request, e, deps), e);
  } catch (error) {
    if (error instanceof z.ZodError)
      return protect(
        json(
          {
            error: error.issues.some(i => i.path[0] === 'cpf')
              ? 'Informe um CPF válido com 11 dígitos.'
              : 'Confira os campos obrigatórios e seus limites. Remova campos não solicitados e tente novamente.',
          },
          400,
        ),
        e,
      );
    if (error instanceof HttpError)
      return protect(json({ error: error.message }, error.status), e);
    console.error(JSON.stringify({ event: 'request_failed', trace: uid() }));
    return protect(
      json(
        { error: 'Não foi possível concluir. Tente novamente mais tarde.' },
        500,
      ),
      e,
    );
  }
}
async function route(request: Request, e: Env, deps: Deps) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = request.method;
  const parts = path.split('/');
  if (path === 'webhooks/mercadopago' && method === 'POST') {
    await webhook(request, e, deps.fetcher);
    return json({ ok: true });
  }
  if (path === 'internal/maintenance' && method === 'POST') {
    const expected = e.CRON_SECRET;
    if (
      !expected ||
      !same(request.headers.get('authorization') || '', `Bearer ${expected}`)
    )
      fail(401, 'Não autorizado.');
    return maintenance(e, deps.fetcher);
  }
  if (!['GET', 'HEAD'].includes(method)) csrf(request, e);
  if (path === 'config' && method === 'GET')
    return json({
      name: e.STORE_NAME || 'Sua Livraria',
      salesEnabled: salesReady(e),
      mode: e.PAYMENT_MODE || 'test',
      authReady: authReady(e),
      captchaSiteKey: e.TURNSTILE_SITE_KEY || '',
      legal: {
        name: e.LEGAL_NAME || '',
        document: e.LEGAL_DOCUMENT || '',
        address: e.LEGAL_ADDRESS || '',
        email: e.CONTACT_EMAIL || '',
        reviewed: e.LEGAL_REVIEWED === 'true',
      },
    });
  if (path === 'products' && method === 'GET')
    return json({
      products: await all(
        e,
        'SELECT id,title,description,price,cover_id FROM products WHERE published=1 ORDER BY updated_at DESC LIMIT 100',
      ),
    });
  if (parts[0] === 'products' && parts.length === 2 && method === 'GET') {
    const p = await one(
      e,
      'SELECT id,title,description,price,cover_id FROM products WHERE id=? AND published=1',
      idSchema.parse(parts[1]),
    );
    if (!p) fail(404, 'Ebook não encontrado.');
    return json(p);
  }
  if (parts[0] === 'covers' && method === 'GET')
    return cover(e, idSchema.parse(parts[1]));
  if (parts[0] === 'auth' && method === 'POST')
    return authRoute(request, e, parts[1]);
  const user = await (deps.identity || identity)(request, e);
  if (path === 'me' && method === 'GET') {
    const isAdmin = !!(await one(
      e,
      'SELECT user_id FROM admins WHERE user_id=?',
      user.id,
    ));
    return json({ email: user.email, admin: isAdmin, aal: user.aal });
  }
  if (path === 'orders' && method === 'GET') {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(url.searchParams.get('page') || '1');
    const orders = await all(
      e,
      'SELECT o.*,i.title,i.product_id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE user_id=? ORDER BY created_at DESC,o.id DESC LIMIT 101 OFFSET ?',
      user.id,
      (page - 1) * 100,
    );
    return json({
      page,
      hasMore: orders.length > 100,
      orders: orders.slice(0, 100).map((o) => ({
        ...publicOrder(o),
        title: o.title,
        productId: o.product_id,
      })),
    });
  }
  if (path === 'checkout' && method === 'POST')
    return json(
      publicOrder(
        await createOrder(e, user, await body(request), deps.fetcher),
      ),
      201,
    );
  if (parts[0] === 'orders' && parts[1]) {
    const id = idSchema.parse(parts[1]);
    const o = await one(
      e,
      'SELECT o.*,i.title FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.id=? AND user_id=?',
      id,
      user.id,
    );
    if (!o) fail(404, 'Pedido não encontrado.');
    if (parts.length === 2 && method === 'GET')
      return json({ ...publicOrder(o), title: o.title });
    if (parts[2] === 'reconcile' && method === 'POST') {
      await rate(e, `reconcile:${user.id}`, 12, 60000);
      return json(publicOrder(await reconcile(e, id, deps.fetcher)));
    }
    if (parts[2] === 'download' && method === 'POST')
      return json(await downloadLink(e, user, id));
  }
  if (parts[0] === 'download' && method === 'GET')
    return download(e, user, z.string().max(80).parse(parts[1]));
  if (path === 'privacy/export' && method === 'POST') {
    await rate(e, `privacy:${user.id}`, 5, 3600000);
    return json({
      email: user.email,
      orders: await all(
        e,
        'SELECT o.id,o.status,o.amount,o.currency,o.created_at,i.title FROM orders o JOIN order_items i ON i.order_id=o.id WHERE user_id=?',
        user.id,
      ),
      requests: await all(
        e,
        'SELECT id,kind,created_at FROM privacy_requests WHERE user_id=?',
        user.id,
      ),
    });
  }
  if (path === 'privacy/request' && method === 'POST') {
    await rate(e, `privacy:${user.id}`, 5, 3600000);
    const p = z
      .object({ kind: z.enum(['delete', 'correct', 'information']) })
      .strict()
      .parse(await body(request));
    const id = uid();
    await e.DB.batch([
      statement(
        e,
        'INSERT INTO privacy_requests (id,user_id,kind,created_at) VALUES (?,?,?,?)',
        id,
        user.id,
        p.kind,
        now(),
      ),
      statement(
        e,
        'INSERT INTO alerts (id,kind,target,created_at) VALUES (?,?,?,?)',
        uid(),
        'privacy_request',
        id,
        now(),
      ),
    ]);
    return json({
      message:
        'Solicitação registrada. A loja deverá avaliar os dados e eventuais obrigações de retenção.',
      id,
    });
  }
  if (parts[0] === 'admin') {
    await admin(user, e);
    await rate(e, `admin:${user.id}`, 100, 60000);
    if (path === 'admin/readiness' && method === 'GET')
      return json({
        salesEnabled: salesReady(e),
        mode: e.PAYMENT_MODE || 'test',
        checks: [
          { label: 'Cadastro e login', configured: authReady(e) },
          { label: 'Pagamento Pix', configured: !!(e.MP_ACCESS_TOKEN && e.MP_WEBHOOK_SECRET && e.MP_COLLECTOR_ID) },
          { label: 'Proteção dos dados de cobrança', configured: !!e.PII_ENCRYPTION_KEY },
          { label: 'Verificação de arquivos', configured: !!(e.SCANNER_URL && e.SCANNER_TOKEN) },
          { label: 'Manutenção e alertas', configured: !!(e.CRON_SECRET && e.ALERT_URL && e.ALERT_TOKEN) },
          { label: 'Dados do vendedor e revisão dos documentos', configured: !!(e.LEGAL_NAME && e.LEGAL_DOCUMENT && e.LEGAL_ADDRESS && e.CONTACT_EMAIL && e.LEGAL_REVIEWED === 'true') },
        ],
      });
    if (path === 'admin/products' && method === 'GET')
      return json({
        products: await all(
          e,
          'SELECT * FROM products ORDER BY updated_at DESC LIMIT 100',
        ),
      });
    if (path === 'admin/products' && method === 'POST') {
      const p = productSchema.parse(await body(request));
      const id = p.id || uid();
      for (const [fid, kind] of [
        [p.coverId, 'cover'],
        [p.fileId, 'ebook'],
      ]) {
        if (
          fid &&
          !(await one(
            e,
            'SELECT id FROM files WHERE id=? AND kind=?',
            fid,
            kind,
          ))
        )
          fail(400, 'Arquivo não aprovado ou de tipo incompatível.');
      }
      if (p.published && (!p.coverId || !p.fileId))
        fail(400, 'Adicione capa e arquivo antes de publicar.');
      const before = await one(
        e,
        'SELECT price,published FROM products WHERE id=?',
        id,
      );
      await e.DB.batch([
        statement(
          e,
          `INSERT INTO products (id,title,description,price,published,cover_id,file_id,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,price=excluded.price,published=excluded.published,cover_id=excluded.cover_id,file_id=excluded.file_id,updated_at=excluded.updated_at`,
          id,
          p.title,
          p.description,
          p.price,
          Number(p.published),
          p.coverId,
          p.fileId,
          now(),
        ),
        auditStatement(e, user.id, 'product.save', id, {
          before,
          after: { price: p.price, published: p.published },
        }),
      ]);
      return json({ id });
    }
    if (path === 'admin/upload' && method === 'POST')
      return json(await upload(request, e, user));
    if (path === 'admin/orders' && method === 'GET')
      return json({
        orders: await all(
          e,
          'SELECT o.id,o.status,o.amount,o.currency,o.mode,o.created_at,o.payment_id,i.title FROM orders o JOIN order_items i ON i.order_id=o.id ORDER BY created_at DESC LIMIT 100',
        ),
        sales: await one(
          e,
          "SELECT COUNT(*) as count,COALESCE(SUM(amount),0) as total FROM orders WHERE status='approved' AND mode=?",
          e.PAYMENT_MODE || 'test',
        ),
      });
    if (path === 'admin/reconcile' && method === 'POST') {
      const p = z
        .object({ id: z.uuid() })
        .strict()
        .parse(await body(request));
      const o = await reconcile(e, p.id, deps.fetcher);
      await e.DB.batch([auditStatement(e, user.id, 'payment.reconcile', p.id)]);
      return json(publicOrder(o));
    }
    if (path === 'admin/audit' && method === 'GET')
      return json({
        audit: await all(
          e,
          'SELECT * FROM audit ORDER BY created_at DESC LIMIT 100',
        ),
        alerts: await all(
          e,
          'SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100',
        ),
        privacyRequests: await all(
          e,
          'SELECT id,kind,created_at FROM privacy_requests ORDER BY created_at DESC LIMIT 100',
        ),
      });
  }
  fail(404, 'Página não encontrada.');
}
async function maintenance(e: Env, fetcher?: ProviderFetch) {
  const pending = await all(
    e,
    "SELECT id FROM orders WHERE mode=? AND status!='refunded' AND (payment_id IS NOT NULL OR status='pending') ORDER BY reconciled_at ASC LIMIT 20",
    e.PAYMENT_MODE || 'test',
  );
  let succeeded = 0,
    failed = 0;
  for (const o of pending) {
    try {
      await reconcile(e, o.id, fetcher);
      succeeded++;
    } catch {
      failed++;
      await alert(e, 'reconciliation_failed', o.id);
    }
  }
  const unsent = await all(
    e,
    'SELECT id,kind,target,created_at FROM alerts WHERE sent_at IS NULL ORDER BY created_at LIMIT 50',
  );
  let sent = 0;
  if (
    e.ALERT_URL &&
    e.ALERT_TOKEN &&
    new URL(e.ALERT_URL).protocol === 'https:'
  ) {
    for (const a of unsent) {
      try {
        const r = await fetch(e.ALERT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${e.ALERT_TOKEN}`,
            'Idempotency-Key': a.id,
          },
          body: JSON.stringify(a),
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          await run(e, 'UPDATE alerts SET sent_at=? WHERE id=?', now(), a.id);
          sent++;
        }
      } catch {
        /* Retain outbox for the next job. */
      }
    }
  }
  await e.DB.batch([
    statement(
      e,
      'DELETE FROM rate_limits WHERE expires_at<?',
      now() - 86400000,
    ),
    statement(
      e,
      'DELETE FROM download_tokens WHERE expires_at<?',
      now() - 86400000,
    ),
    statement(
      e,
      "UPDATE orders SET request_cipher='' WHERE expires_at<? AND request_cipher!=''",
      now() - 86400000,
    ),
  ]);
  return json({ succeeded, failed, alertsSent: sent });
}
