import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const paymentRequests = sqliteTable('payment_requests', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  kind: text('kind').notNull(),
  orderId: text('order_id'),
  amountFen: integer('amount_fen').notNull(),
  coins: integer('coins'),
  status: text('status').notNull(),
  transactionRef: text('transaction_ref'),
  staffNote: text('staff_note'),
  createdAt: text('created_at').notNull(),
  submittedAt: text('submitted_at'),
  reviewedAt: text('reviewed_at'),
}, table => [uniqueIndex('payment_requests_transaction_ref_unique').on(table.transactionRef)]);

export const coinWallets = sqliteTable('coin_wallets', {
  ownerId: text('owner_id').primaryKey(),
  balance: integer('balance').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const coinLedger = sqliteTable('coin_ledger', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  paymentId: text('payment_id').notNull(),
  delta: integer('delta').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [uniqueIndex('coin_ledger_payment_id_unique').on(table.paymentId)]);
