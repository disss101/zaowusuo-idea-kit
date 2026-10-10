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

export const employees = sqliteTable('employees', {
  email: text('email').primaryKey(), userId: text('user_id'), rolesJson: text('roles_json').notNull(),
  active: integer('active').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const adminAudit = sqliteTable('admin_audit', {
  id: text('id').primaryKey(), actorId: text('actor_id').notNull(), actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(), subjectType: text('subject_type').notNull(), subjectId: text('subject_id').notNull(),
  detailsJson: text('details_json').notNull(), createdAt: text('created_at').notNull(),
});
export const planReviews = sqliteTable('plan_reviews', {
  projectId: text('project_id').primaryKey(), revision: integer('revision').notNull(), changeToken: text('change_token').notNull(), status: text('status').notNull(),
  name: text('name'), description: text('description'), featuresJson: text('features_json'), bomJson: text('bom_json'),
  engineeringNote: text('engineering_note'), physicalTest: text('physical_test'), reason: text('reason'),
  actorId: text('actor_id').notNull(), updatedAt: text('updated_at').notNull(),
});
export const components = sqliteTable('components', {
  sku: text('sku').primaryKey(), name: text('name').notNull(), model: text('model'), category: text('category'),
  description: text('description'), costFen: integer('cost_fen').notNull().default(0), priceFen: integer('price_fen').notNull().default(0),
  supplier: text('supplier'), stock: integer('stock').notNull().default(0), reserved: integer('reserved').notNull().default(0),
  minimumStock: integer('minimum_stock').notNull().default(0), specsJson: text('specs_json').notNull().default('{}'),
  verified: integer('verified').notNull().default(0), revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const inventoryMovements = sqliteTable('inventory_movements', {
  id: text('id').primaryKey(), sku: text('sku').notNull(), delta: integer('delta').notNull(),
  balanceAfter: integer('balance_after').notNull(), kind: text('kind').notNull(), reason: text('reason').notNull(),
  actorId: text('actor_id').notNull(), createdAt: text('created_at').notNull(),
});
export const kits = sqliteTable('kits', {
  id: text('id').primaryKey(), name: text('name').notNull(), description: text('description').notNull(),
  priceFen: integer('price_fen').notNull().default(0), difficulty: text('difficulty'), buildTime: text('build_time'),
  projectId: text('project_id'), bomJson: text('bom_json').notNull().default('[]'), instructions: text('instructions'),
  codeUrl: text('code_url'), imageUrl: text('image_url'), verificationStatus: text('verification_status').notNull().default('unverified'),
  status: text('status').notNull().default('draft'), revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const supportTickets = sqliteTable('support_tickets', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), projectId: text('project_id'), orderId: text('order_id'),
  step: integer('step'), description: text('description').notNull(), status: text('status').notNull().default('open'),
  priority: text('priority').notNull().default('normal'), assignee: text('assignee'), publicReply: text('public_reply'),
  internalNote: text('internal_note'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
