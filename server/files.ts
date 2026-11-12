// Uploads privados, verificação de arquivos e downloads autorizados em R2.
import { fileTypeFromBuffer } from 'file-type';
import {
  type Env,
  fail,
  uid,
  now,
  run,
  one,
  statement,
  auditStatement,
} from './base';
import { type Identity } from './auth';
import { rate, sha } from './security';
export async function upload(request: Request, e: Env, user: Identity) {
  await rate(e, `upload:${user.id}`, 20, 3600000);
  if (!e.SCANNER_URL || !e.SCANNER_TOKEN)
    fail(503, 'Verificação de arquivos ainda não configurada.');
  const scanner = new URL(e.SCANNER_URL);
  if (scanner.protocol !== 'https:' && scanner.hostname !== 'localhost')
    fail(503, 'Verificador precisa de HTTPS.');
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'ebook' && kind !== 'cover')
    fail(400, 'Tipo de arquivo inválido.');
  const max = kind === 'ebook' ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
  const length = Number(request.headers.get('content-length'));
  if (length > max) fail(413, 'Arquivo acima do limite.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Selecione um arquivo.');
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      fail(413, 'Arquivo acima do limite.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const type = await fileTypeFromBuffer(bytes);
  const name = decodeURIComponent(request.headers.get('x-file-name') || '');
  const ext = name.split('.').at(-1)?.toLowerCase();
  const valid =
    kind === 'ebook'
      ? type?.mime === 'application/pdf' && ext === 'pdf'
      : (type?.mime === 'image/png' && ext === 'png') ||
        (type?.mime === 'image/jpeg' && ['jpg', 'jpeg'].includes(ext || ''));
  if (!valid)
    fail(
      400,
      'Envie PDF para ebook e PNG ou JPEG para capa. O conteúdo deve corresponder à extensão.',
    );
  const hash = await sha(bytes);
  let result: any;
  try {
    const response = await fetch(scanner, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.SCANNER_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'X-Expected-Kind': kind,
      },
      body: bytes,
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) fail(422, 'Arquivo recusado pelo verificador.');
    result = await response.json();
  } catch {
    fail(
      422,
      'Não foi possível aprovar o arquivo. Tente novamente após verificar o serviço de segurança.',
    );
  }
  if (
    result.clean !== true ||
    result.sha256 !== hash ||
    result.mime !== type!.mime
  )
    fail(422, 'Arquivo não aprovado pelo verificador.');
  const id = uid(),
    key = `${kind}/${id}.${type!.ext}`;
  await e.FILES.put(key, bytes, { httpMetadata: { contentType: type!.mime } });
  try {
    await e.DB.batch([
      statement(
        e,
        'INSERT INTO files (id,key,kind,mime,size,sha256,created_at) VALUES (?,?,?,?,?,?,?)',
        id,
        key,
        kind,
        type!.mime,
        total,
        hash,
        now(),
      ),
      auditStatement(e, user.id, 'file.upload', id, {
        kind,
        size: total,
        sha256: hash,
      }),
    ]);
  } catch (error) {
    await e.FILES.delete(key);
    throw error;
  }
  return { id, kind, size: total };
}
export async function entitlement(e: Env, user: Identity, orderId: string) {
  const row = await one(
    e,
    `SELECT o.id,i.file_id,f.key,f.mime FROM orders o JOIN order_items i ON i.order_id=o.id JOIN files f ON f.id=i.file_id WHERE o.id=? AND o.user_id=? AND o.status='approved' AND o.mode=?`,
    orderId,
    user.id,
    e.PAYMENT_MODE || 'test',
  );
  if (!row) fail(404, 'Ebook não disponível para esta conta.');
  return row;
}
export async function downloadLink(e: Env, user: Identity, orderId: string) {
  await rate(e, `download:${user.id}`, 10, 3600000);
  await entitlement(e, user, orderId);
  const token = uid() + uid();
  await run(
    e,
    'INSERT INTO download_tokens (hash,user_id,order_id,expires_at) VALUES (?,?,?,?)',
    await sha(token),
    user.id,
    orderId,
    now() + 60000,
  );
  return { url: `/api/download/${token}`, expiresIn: 60 };
}
export async function download(e: Env, user: Identity, token: string) {
  await rate(e, `redeem:${user.id}`, 20, 3600000);
  const hash = await sha(token);
  const row = await one(
    e,
    'SELECT * FROM download_tokens WHERE hash=? AND user_id=? AND expires_at>? AND used_at IS NULL',
    hash,
    user.id,
    now(),
  );
  if (!row) fail(404, 'Link inválido, expirado ou já utilizado.');
  const allowed = await entitlement(e, user, row.order_id);
  const claimed = await one(
    e,
    `UPDATE download_tokens SET used_at=? WHERE hash=? AND user_id=? AND expires_at>? AND used_at IS NULL AND EXISTS (SELECT 1 FROM orders WHERE id=download_tokens.order_id AND user_id=? AND status='approved') RETURNING hash`,
    now(),
    hash,
    user.id,
    now(),
    user.id,
  );
  if (!claimed) fail(404, 'Link indisponível.');
  const file = await e.FILES.get(allowed.key);
  if (!file) fail(404, 'Arquivo indisponível. Entre em contato com a loja.');
  return new Response(file.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="ebook.pdf"',
      'Content-Length': String(file.size),
    },
  });
}
export async function cover(e: Env, id: string) {
  const f = await one(
    e,
    `SELECT f.key,f.mime FROM files f JOIN products p ON p.cover_id=f.id WHERE f.id=? AND f.kind='cover' AND p.published=1`,
    id,
  );
  if (!f) fail(404, 'Capa não encontrada.');
  const file = await e.FILES.get(f.key);
  if (!file) fail(404, 'Capa não encontrada.');
  return new Response(file.body, {
    headers: { 'Content-Type': f.mime, 'Content-Length': String(file.size) },
  });
}
