import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createTopup, createOrderPayment, paymentFor, reviewTransfer, submitTransfer, walletFor } from '../lib/payments.mjs';

function localD1() {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../drizzle/0000_mean_salo.sql', import.meta.url), 'utf8');
  sqlite.exec(migration.replaceAll('--> statement-breakpoint', ''));
  const statement = (sql, values = []) => ({
    bind(...next) { return statement(sql, next); },
    first() { return sqlite.prepare(sql).get(...values) || null; },
    all() { return { results: sqlite.prepare(sql).all(...values) }; },
    run() { return sqlite.prepare(sql).run(...values); },
  });
  return {
    prepare: statement,
    batch(items) {
      sqlite.exec('BEGIN');
      try { const result = items.map(item => item.run()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

test('manual top-up credits coins once only after staff approval', async () => {
  const db = localD1();
  const requested = await createTopup(db, 'player-a', 500);
  assert.equal((await walletFor(db, 'player-a')).balance, 0);
  const submitted = await submitTransfer(db, requested, 'LOCALTX202610070001');
  assert.equal(submitted.status, 'submitted');
  const approved = await reviewTransfer(db, submitted, 'confirm', '', 'staff-a');
  assert.equal(approved.status, 'confirmed');
  assert.equal((await walletFor(db, 'player-a')).balance, 50);
  await reviewTransfer(db, submitted, 'confirm', '', 'staff-a').catch(() => {});
  assert.equal((await walletFor(db, 'player-a')).balance, 50);
});

test('the same Alipay transaction number cannot fund two requests', async () => {
  const db = localD1();
  const first = await createTopup(db, 'player-a', 500);
  const second = await createTopup(db, 'player-b', 1000);
  await submitTransfer(db, first, 'LOCALTX202610070002');
  await assert.rejects(() => submitTransfer(db, second, 'LOCALTX202610070002'), /已被/);
});

test('an order cannot request payment before staff fixes the final quote', async () => {
  const db = localD1();
  const order = { id: crypto.randomUUID(), ownerId: 'player-a', status: 'pending_review', quoteCny: null };
  await assert.rejects(() => createOrderPayment(db, order, 'player-a'), /等待工作人员/);
  order.status = 'reviewing'; order.quoteCny = 129;
  const payment = await createOrderPayment(db, order, 'player-a');
  assert.equal(payment.amountFen, 12900);
  assert.equal((await paymentFor(db, payment.id, 'player-a')).status, 'awaiting_transfer');
  assert.equal((await createOrderPayment(db, order, 'player-a')).id, payment.id);
});
