import { InputError } from './planner.mjs';

export const topupOptions = Object.freeze([
  { amountFen: 500, coins: 50 },
  { amountFen: 1000, coins: 100 },
  { amountFen: 2000, coins: 200 },
]);

export function paymentDb(env) {
  if (!env.DB) throw Error('付款记录数据库尚未连接。');
  return env.DB;
}

export async function walletFor(db, ownerId) {
  const row = await db.prepare('SELECT balance FROM coin_wallets WHERE owner_id = ?').bind(ownerId).first();
  return { balance: row?.balance ?? 0 };
}

export async function paymentsFor(db, ownerId, staff = false) {
  const query = staff
    ? db.prepare('SELECT * FROM payment_requests ORDER BY created_at DESC LIMIT 200')
    : db.prepare('SELECT * FROM payment_requests WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100').bind(ownerId);
  return (await query.all()).results.map(publicPayment);
}

export async function paymentFor(db, id, ownerId, staff = false) {
  const row = await db.prepare('SELECT * FROM payment_requests WHERE id = ?').bind(id).first();
  if (!row || (!staff && row.owner_id !== ownerId)) return null;
  return publicPayment(row);
}

function publicPayment(row) {
  return {
    id: row.id, ownerId: row.owner_id, kind: row.kind, orderId: row.order_id,
    amountFen: row.amount_fen, coins: row.coins, status: row.status,
    transactionRef: row.transaction_ref, staffNote: row.staff_note,
    createdAt: row.created_at, submittedAt: row.submitted_at, reviewedAt: row.reviewed_at,
  };
}

export async function createTopup(db, ownerId, amountFen) {
  const option = topupOptions.find(item => item.amountFen === amountFen);
  if (!option) throw new InputError('请选择页面上的充值档位。');
  const existing = await db.prepare("SELECT * FROM payment_requests WHERE owner_id = ? AND kind = 'topup' AND amount_fen = ? AND status IN ('awaiting_transfer', 'submitted') ORDER BY created_at DESC LIMIT 1")
    .bind(ownerId, amountFen).first();
  if (existing) return publicPayment(existing);
  return insertPayment(db, { ownerId, kind: 'topup', amountFen, coins: option.coins });
}

export async function createOrderPayment(db, order, ownerId) {
  if (order.ownerId !== ownerId) throw new InputError('只能支付自己的订单。');
  if (order.status !== 'reviewing' || !Number.isSafeInteger(order.quoteCny) || order.quoteCny < 1 || order.quoteCny > 50000) {
    throw new InputError('请等待工作人员确认型号、库存与最终报价。');
  }
  const existing = await db.prepare("SELECT * FROM payment_requests WHERE order_id = ? AND status IN ('awaiting_transfer', 'submitted', 'confirmed') ORDER BY created_at DESC LIMIT 1")
    .bind(order.id).first();
  if (existing) {
    if (existing.amount_fen !== order.quoteCny * 100) throw new InputError('报价已经变化，请联系工作人员处理原付款记录。');
    return publicPayment(existing);
  }
  return insertPayment(db, { ownerId, kind: 'order', orderId: order.id, amountFen: order.quoteCny * 100 });
}

async function insertPayment(db, { ownerId, kind, orderId = null, amountFen, coins = null }) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO payment_requests (id, owner_id, kind, order_id, amount_fen, coins, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, ownerId, kind, orderId, amountFen, coins, 'awaiting_transfer', createdAt).run();
  return { id, ownerId, kind, orderId, amountFen, coins, status: 'awaiting_transfer', transactionRef: null, staffNote: null, createdAt, submittedAt: null, reviewedAt: null };
}

export async function submitTransfer(db, payment, transactionRef) {
  if (payment.status !== 'awaiting_transfer' && payment.status !== 'submitted') throw new InputError('这笔付款已经处理，请创建新的付款申请。');
  const reference = typeof transactionRef === 'string' ? transactionRef.trim() : '';
  if (!/^[A-Za-z0-9-]{12,64}$/.test(reference)) throw new InputError('请填写支付宝账单中 12–64 位的交易号。');
  const duplicate = await db.prepare('SELECT id FROM payment_requests WHERE transaction_ref = ? AND id != ?').bind(reference, payment.id).first();
  if (duplicate) throw new InputError('这个交易号已被另一笔付款使用，请核对后再提交。');
  const now = new Date().toISOString();
  try {
    await db.prepare("UPDATE payment_requests SET transaction_ref = ?, status = 'submitted', submitted_at = ?, staff_note = NULL WHERE id = ? AND status IN ('awaiting_transfer', 'submitted')")
      .bind(reference, now, payment.id).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new InputError('这个交易号已被使用。');
    throw error;
  }
  return paymentFor(db, payment.id, payment.ownerId);
}

export async function reviewTransfer(db, payment, action, note, staffId) {
  if (payment.status !== 'submitted') throw new InputError('只能核对已提交交易号的付款。');
  if (!['confirm', 'reject'].includes(action)) throw new InputError('核对操作无效。');
  const staffNote = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  if (action === 'reject' && staffNote.length < 4) throw new InputError('驳回时请填写具体原因。');
  const now = new Date().toISOString();
  if (action === 'reject') {
    await db.prepare("UPDATE payment_requests SET status = 'rejected', staff_note = ?, reviewed_at = ? WHERE id = ? AND status = 'submitted'")
      .bind(staffNote, now, payment.id).run();
    return paymentFor(db, payment.id, staffId, true);
  }
  if (payment.kind === 'topup') {
    // The unique ledger entry makes a repeated staff click fail atomically, so coins cannot be issued twice.
    await db.batch([
      db.prepare("UPDATE payment_requests SET status = 'confirmed', staff_note = ?, reviewed_at = ? WHERE id = ? AND status = 'submitted'")
        .bind(`人工核对到账 · ${staffId}${staffNote ? ` · ${staffNote}` : ''}`.slice(0, 300), now, payment.id),
      db.prepare("INSERT INTO coin_ledger (id, owner_id, payment_id, delta, created_at) SELECT ?, owner_id, id, coins, ? FROM payment_requests WHERE id = ? AND status = 'confirmed' AND reviewed_at = ?")
        .bind(crypto.randomUUID(), now, payment.id, now),
      db.prepare("INSERT INTO coin_wallets (owner_id, balance, updated_at) SELECT owner_id, coins, ? FROM payment_requests WHERE id = ? AND status = 'confirmed' AND reviewed_at = ? ON CONFLICT(owner_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at")
        .bind(now, payment.id, now),
    ]);
  } else {
    await db.prepare("UPDATE payment_requests SET status = 'confirmed', staff_note = ?, reviewed_at = ? WHERE id = ? AND status = 'submitted'")
      .bind(`人工核对到账 · ${staffId}${staffNote ? ` · ${staffNote}` : ''}`.slice(0, 300), now, payment.id).run();
  }
  return paymentFor(db, payment.id, staffId, true);
}
