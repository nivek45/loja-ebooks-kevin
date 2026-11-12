// Esquema das tabelas do banco Cloudflare D1 (SQLite) usando Drizzle.
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  kind: text('kind').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    price: integer('price').notNull(),
    published: integer('published').notNull().default(0),
    coverId: text('cover_id').references(() => files.id),
    fileId: text('file_id').references(() => files.id),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [check('positive_price', sql`${t.price} BETWEEN 100 AND 1000000`)],
);
export const admins = sqliteTable('admins', {
  userId: text('user_id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('pending'),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('BRL'),
    mode: text('mode').notNull(),
    paymentId: text('payment_id').unique(),
    requestCipher: text('request_cipher').notNull(),
    qrCode: text('qr_code'),
    qrImage: text('qr_image'),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    providerUpdated: integer('provider_updated').notNull().default(0),
    reconciledAt: integer('reconciled_at').notNull().default(0),
  },
  (t) => [
    uniqueIndex('orders_user_key').on(t.userId, t.idempotencyKey),
    index('orders_user_created').on(t.userId, t.createdAt),
    index('orders_reconcile').on(t.reconciledAt),
  ],
);
export const items = sqliteTable('order_items', {
  orderId: text('order_id')
    .primaryKey()
    .references(() => orders.id),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  title: text('title').notNull(),
  price: integer('price').notNull(),
  fileId: text('file_id')
    .notNull()
    .references(() => files.id),
});
export const events = sqliteTable('payment_events', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  detail: text('detail').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const limits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const downloads = sqliteTable('download_tokens', {
  hash: text('hash').primaryKey(),
  userId: text('user_id').notNull(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
});
export const alerts = sqliteTable('alerts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  target: text('target').notNull(),
  createdAt: integer('created_at').notNull(),
  sentAt: integer('sent_at'),
});
export const privacyRequests = sqliteTable('privacy_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  createdAt: integer('created_at').notNull(),
});
