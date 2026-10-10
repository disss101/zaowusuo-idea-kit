import { can, paginate, planStatuses, nextPlanStatus, applyReview, roles, ticketStatuses } from './admin-core.mjs';
import { paymentFor, paymentsFor, reviewTransfer } from './payments.mjs';

const uuid = /^[a-f0-9-]{36}$/i;
const skuPattern = /^[A-Za-z0-9_-]{2,40}$/;
const now = () => new Date().toISOString();
const fail = (message, status = 400) => { const error = Error(message); error.status = status; throw error; };
const text = (value, label, max = 500, min = 1) => {
  const result = String(value ?? '').trim();
  if (result.length < min || result.length > max) fail(`${label}需要 ${min}–${max} 个字。`);
  return result;
};
const int = (value, label, min = 0, max = 1_000_000_000) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) fail(`${label}需要为 ${min}–${max} 的整数。`);
  return number;
};
const parse = value => { try { return JSON.parse(value); } catch { return null; } };
const response = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function adminIdentity(env, request) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!id || !email || !env.DB) return null;
  const record = await env.DB.prepare('SELECT * FROM employees WHERE email = ?').bind(email).first();
  if (record?.active === 0) return null;
  if (record) {
    if (record.user_id && record.user_id !== id) return null;
    if (!record.user_id) {
      await env.DB.prepare('UPDATE employees SET user_id = ?, updated_at = ? WHERE email = ? AND user_id IS NULL').bind(id, now(), email).run();
      const bound = await env.DB.prepare('SELECT user_id FROM employees WHERE email = ?').bind(email).first();
      if (bound?.user_id !== id) return null;
    }
    return { id, email, roles: parse(record.roles_json) || [], active: true };
  }
  const bootstrap = String(env.ADMIN_EMAIL || '').split(',').map(item => item.trim().toLowerCase()).includes(email);
  return bootstrap ? { id, email, roles: ['super_admin'], active: true, bootstrap: true } : null;
}

export async function audit(env, actor, action, subjectType, subjectId, details = {}) {
  await env.DB.prepare('INSERT INTO admin_audit (id, actor_id, actor_email, action, subject_type, subject_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), actor.id, actor.email, action, subjectType, String(subjectId), JSON.stringify(details), now()).run();
}

async function allObjects(bucket, prefix, cap = 5000, withKey = false) {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: 1000, cursor });
    keys.push(...page.objects.map(item => item.key));
    if (keys.length >= cap) return { items: (await Promise.all(keys.slice(0, cap).map(async key => { const item = await bucket.get(key); const value = await item?.json(); return value && withKey ? { ...value, storageKey: key } : value; }))).filter(Boolean), truncated: true };
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { items: (await Promise.all(keys.map(async key => { const item = await bucket.get(key); const value = await item?.json(); return value && withKey ? { ...value, storageKey: key } : value; }))).filter(Boolean), truncated: false };
}
async function plans(env) {
  const source = await allObjects(env.BUCKET, 'ai-projects/');
  const reviews = (await env.DB.prepare('SELECT * FROM plan_reviews').all()).results;
  const byId = new Map(reviews.map(row => [row.project_id, row]));
  return { items: source.items.map(project => applyReview({ ...project, status: 'generated' }, byId.get(project.id))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), truncated: source.truncated };
}
async function orders(env) {
  const source = await allObjects(env.BUCKET, 'orders/');
  return { items: source.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), truncated: source.truncated };
}
async function aiLogs(env) {
  const source = await allObjects(env.BUCKET, 'ai-model-usage/', 5000, true);
  return { items: source.items.map(({ storageKey, ...item }) => ({ ...item, ownerHash: storageKey.split('/')[1] })).sort((a, b) => b.at.localeCompare(a.at)), truncated: source.truncated };
}
function list(records, params, fields) {
  const q = (params.get('q') || '').trim().toLowerCase();
  const status = params.get('status');
  const filtered = records.filter(row => (!q || fields.some(field => String(row[field] || '').toLowerCase().includes(q))) && (!status || row.status === status));
  return paginate(filtered, params);
}
function requirePermission(actor, permission) { if (!can(actor, permission)) fail('没有此操作的员工权限。', 403); }
function db(env) { if (!env.DB || !env.BUCKET) fail('后台数据服务尚未连接。', 503); return env.DB; }
function rowComponent(row) { return { ...row, specs: parse(row.specs_json) || {}, available: row.stock - row.reserved }; }
function rowKit(row) { return { ...row, bom: parse(row.bom_json) || [] }; }

async function get(env, actor, path, params) {
  const database = db(env);
  if (path.length === 1 && path[0] === 'me') return response({ email: actor.email, roles: actor.roles, bootstrap: !!actor.bootstrap, permissions: Object.fromEntries(['overview','plans','kits','components','inventory','orders','users','tickets','ai_logs','employees','audit','finance'].map(key => [key, can(actor, key)])) });
  if (path[0] === 'overview') {
    requirePermission(actor, 'overview');
    const [projectData, orderData, logs, tickets, components] = await Promise.all([
      plans(env), orders(env), aiLogs(env), database.prepare('SELECT * FROM support_tickets').all(), database.prepare('SELECT * FROM components').all(),
    ]);
    const days = Math.max(1, Math.min(30, Number(params.get('days') || 1)));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const recentOrders = orderData.items.filter(item => item.createdAt >= since);
    const recentLogs = logs.items.filter(item => item.at >= since);
    const pendingPlans = projectData.items.filter(item => ['generated','pending_review','in_review','needs_changes'].includes(item.status));
    const openTickets = tickets.results.filter(item => !['resolved','closed'].includes(item.status));
    const lowStock = components.results.filter(item => item.stock - item.reserved <= item.minimum_stock);
    const payments = await database.prepare("SELECT COALESCE(SUM(amount_fen),0) AS amount FROM payment_requests WHERE kind = 'order' AND status = 'confirmed' AND reviewed_at >= ?").bind(since).first();
    return response({ days, metrics: { orders: recentOrders.length, confirmedSalesFen: payments?.amount || 0, pendingOrders: orderData.items.filter(item => !['closed','shipped'].includes(item.status) && item.fulfillmentStatus !== 'shipped').length,
      pendingPlans: pendingPlans.length, openTickets: openTickets.length, lowStock: lowStock.length, aiCalls: recentLogs.length,
      estimatedAiCostCny: Number(recentLogs.reduce((sum, item) => sum + (item.estimatedCostCny || 0), 0).toFixed(4)), completedProjects: projectData.items.filter(item => item.step >= (item.plan?.assemblySteps?.length || 4) - 1).length,
      totalProjects: projectData.items.length },
      todos: { plans: pendingPlans.slice(0, 5).map(item => ({ id: item.id, name: item.plan?.name })), orders: orderData.items.filter(item => ['pending_review','reviewing'].includes(item.status)).slice(0, 5).map(item => ({ id: item.id, name: item.title })), tickets: openTickets.slice(0, 5).map(item => ({ id: item.id, name: item.description.slice(0, 60) })), components: lowStock.slice(0, 5).map(item => ({ id: item.sku, name: item.name })) },
      truncated: projectData.truncated || orderData.truncated || logs.truncated });
  }
  if (path[0] === 'plans') {
    requirePermission(actor, 'plans');
    const source = await plans(env);
    if (path[1]) {
      const item = source.items.find(record => record.id === path[1]);
      if (!item) fail('方案不存在。', 404);
      await audit(env, actor, 'view', 'plan', item.id);
      return response(item);
    }
    return response({ ...list(source.items.map(item => ({ id: item.id, ownerId: item.ownerId, name: item.plan?.name, idea: item.plan?.request?.idea, budget: item.plan?.request?.budget, estimate: item.plan?.total, status: item.status, createdAt: item.createdAt, source: item.plan?.source, step: item.step })), params, ['id','name','idea','ownerId']), truncated: source.truncated });
  }
  if (path[0] === 'kits') {
    requirePermission(actor, 'kits');
    const rows = (await database.prepare('SELECT * FROM kits ORDER BY updated_at DESC').all()).results.map(rowKit);
    const costs = new Map((await database.prepare('SELECT sku, cost_fen FROM components').all()).results.map(item => [item.sku, item.cost_fen]));
    const calculated = rows.map(item => ({ ...item, bomCostFen: item.bom.reduce((sum, part) => sum + (costs.get(part.sku) || 0) * part.quantity, 0) }));
    if (path[1]) { const found = calculated.find(item => item.id === path[1]); if (!found) fail('Kit 不存在。', 404); return response(found); }
    return response(list(calculated, params, ['id','name','description']));
  }
  if (path[0] === 'components') {
    requirePermission(actor, 'components'); const rows = (await database.prepare('SELECT * FROM components ORDER BY updated_at DESC').all()).results.map(rowComponent);
    if (path[1] && path[2] === 'movements') { const history = await database.prepare('SELECT * FROM inventory_movements WHERE sku = ? ORDER BY created_at DESC LIMIT 100').bind(path[1]).all(); return response({ items: history.results }); }
    if (path[1]) { const found = rows.find(item => item.sku === path[1]); if (!found) fail('零件不存在。', 404); return response(found); }
    return response(list(rows, params, ['sku','name','model','category']));
  }
  if (path[0] === 'orders') {
    requirePermission(actor, 'orders'); const source = await orders(env);
    if (path[1]) { const item = source.items.find(row => row.id === path[1]); if (!item) fail('订单不存在。', 404); await audit(env, actor, 'view_sensitive', 'order', item.id); const payments = (await database.prepare('SELECT id, status, amount_fen, created_at, reviewed_at FROM payment_requests WHERE order_id = ? ORDER BY created_at DESC').bind(item.id).all()).results; return response({ ...item, payments }); }
    return response({ ...list(source.items.map(({ contact, name, note, ...rest }) => rest), params, ['id','title','ownerId','idea']), truncated: source.truncated });
  }
  if (path[0] === 'users') {
    requirePermission(actor, 'users'); const [accountData, projectData, orderData] = await Promise.all([allObjects(env.BUCKET, 'auth/accounts/'), plans(env), orders(env)]);
    const users = new Map();
    for (const account of accountData.items) users.set(`email:${account.id}`, { id: `email:${account.id}`, email: account.email, createdAt: account.createdAt, status: 'active' });
    for (const item of projectData.items) if (!users.has(item.ownerId)) users.set(item.ownerId, { id: item.ownerId, email: null, createdAt: item.createdAt, status: 'active' });
    for (const item of orderData.items) if (!users.has(item.ownerId)) users.set(item.ownerId, { id: item.ownerId, email: null, createdAt: item.createdAt, status: 'active' });
    const rows = [...users.values()].map(user => ({ ...user, projectCount: projectData.items.filter(item => item.ownerId === user.id).length, orderCount: orderData.items.filter(item => item.ownerId === user.id).length }));
    if (path[1]) { const item = rows.find(user => user.id === path[1]); if (!item) fail('用户不存在。', 404); await audit(env, actor, 'view_sensitive', 'user', item.id); return response({ ...item, projects: projectData.items.filter(record => record.ownerId === item.id).map(record => ({ id: record.id, name: record.plan?.name, status: record.status, step: record.step })), orders: orderData.items.filter(record => record.ownerId === item.id).map(record => ({ id: record.id, title: record.title, status: record.status, quoteCny: record.quoteCny })) }); }
    return response({ ...list(rows, params, ['id','email']), truncated: accountData.truncated || projectData.truncated || orderData.truncated });
  }
  if (path[0] === 'tickets') {
    requirePermission(actor, 'tickets'); const rows = (await database.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all()).results;
    if (path[1]) { const item = rows.find(row => row.id === path[1]); if (!item) fail('工单不存在。', 404); await audit(env, actor, 'view_sensitive', 'ticket', item.id); const project = item.project_id ? (await plans(env)).items.find(row => row.id === item.project_id && row.ownerId === item.owner_id) : null; return response({ ...item, projectSummary: project ? { name: project.plan?.name, status: project.status, step: project.step, totalSteps: project.plan?.assemblySteps?.length || null } : null }); }
    return response(list(rows.map(({ internal_note, ...item }) => item), params, ['id','owner_id','description']));
  }
  if (path[0] === 'ai-logs') { requirePermission(actor, 'ai_logs'); const source = await aiLogs(env); return response({ ...list(source.items, params, ['projectId','task','model','ownerHash']), truncated: source.truncated }); }
  if (path[0] === 'payments') { requirePermission(actor, 'finance'); return response(list(await paymentsFor(database, actor.id, true), params, ['id','ownerId','orderId','transactionRef'])); }
  if (path[0] === 'employees') { requirePermission(actor, 'employees'); const rows = (await database.prepare('SELECT email, user_id, roles_json, active, created_at, updated_at FROM employees ORDER BY created_at DESC').all()).results; return response(list(rows.map(row => ({ ...row, roles: parse(row.roles_json) || [] })), params, ['email','user_id'])); }
  if (path[0] === 'audit') { requirePermission(actor, 'audit'); return response(list((await database.prepare('SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 100').all()).results, params, ['actor_email','action','subject_type','subject_id'])); }
  fail('接口不存在。', 404);
}

async function post(env, actor, path, input) {
  const database = db(env);
  if (path[0] === 'plans' && path[1] && path[2] === 'review') {
    requirePermission(actor, 'plans');
    if (!uuid.test(path[1])) fail('方案编号无效。');
    const source = await plans(env); const project = source.items.find(item => item.id === path[1]); if (!project) fail('方案不存在。', 404);
    const old = await database.prepare('SELECT * FROM plan_reviews WHERE project_id = ?').bind(project.id).first();
    const next = input.status ? nextPlanStatus(old?.status || 'generated', input.status, input) : old?.status || 'generated';
    const name = input.name === undefined ? old?.name || null : text(input.name, '项目名称', 80);
    const description = input.description === undefined ? old?.description || null : text(input.description, '介绍', 500);
    const features = input.features === undefined ? old?.features_json || null : JSON.stringify(Array.isArray(input.features) && input.features.length <= 12 ? input.features.map(item => text(item, '功能', 100)) : fail('功能列表格式不正确。'));
    const bom = input.bom === undefined ? old?.bom_json || null : JSON.stringify(Array.isArray(input.bom) && input.bom.length > 0 && input.bom.length <= 40 ? input.bom.map(row => ({ id: text(row.id, '零件 ID', 40), name: text(row.name, '零件名称', 80), model: text(row.model || '待确认', '型号', 80), price: int(row.price, '价格', 0, 50000), quantity: int(row.quantity, '数量', 1, 100) })) : fail('BOM 格式不正确。'));
    const reason = text(input.reason, '修改或审核原因', 500, 4);
    const engineeringNote = input.engineeringNote === undefined ? old?.engineering_note || null : text(input.engineeringNote, '工程结论', 1000, 0);
    const physicalTest = input.physicalTest === undefined ? old?.physical_test || null : text(input.physicalTest, '实物测试', 1000, 0);
    if (next === 'published' && !(old?.physical_test || physicalTest)) fail('未记录实物验证，不能发布。');
    const revision = (old?.revision || 0) + 1;
    const changeToken = crypto.randomUUID();
    await database.batch([
      database.prepare('INSERT INTO plan_reviews (project_id, revision, change_token, status, name, description, features_json, bom_json, engineering_note, physical_test, reason, actor_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision, change_token=excluded.change_token, status=excluded.status, name=excluded.name, description=excluded.description, features_json=excluded.features_json, bom_json=excluded.bom_json, engineering_note=excluded.engineering_note, physical_test=excluded.physical_test, reason=excluded.reason, actor_id=excluded.actor_id, updated_at=excluded.updated_at WHERE plan_reviews.revision = ?').bind(project.id, revision, changeToken, next, name, description, features, bom, engineeringNote, physicalTest, reason, actor.id, now(), old?.revision || 0),
      database.prepare('INSERT INTO admin_audit (id, actor_id, actor_email, action, subject_type, subject_id, details_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM plan_reviews WHERE project_id=? AND change_token=?)').bind(crypto.randomUUID(), actor.id, actor.email, 'review', 'plan', project.id, JSON.stringify({ from: old?.status || 'generated', to: next, revision, reason }), now(), project.id, changeToken),
    ]);
    const committed = await database.prepare('SELECT change_token FROM plan_reviews WHERE project_id=?').bind(project.id).first();
    if (committed?.change_token !== changeToken) fail('方案同时被修改，请刷新重试。',409);
    return response({ id: project.id, status: next, revision });
  }
  if (path[0] === 'components' && path.length === 1) {
    requirePermission(actor, 'components');
    const sku = text(input.sku, 'SKU', 40, 2); if (!skuPattern.test(sku)) fail('SKU 只能包含字母、数字、下划线和连字符。');
    const name = text(input.name, '零件名称', 100); const model = text(input.model || '', '型号', 100, 0); const category = text(input.category || '', '分类', 50, 0);
    const cost = int(input.costFen, '采购成本'); const price = int(input.priceFen, '售价'); const minimum = int(input.minimumStock || 0, '库存阈值');
    const previous = await database.prepare('SELECT * FROM components WHERE sku = ?').bind(sku).first();
    const specs = JSON.stringify(input.specs && typeof input.specs === 'object' && !Array.isArray(input.specs) ? input.specs : {});
    if (specs.length > 3000) fail('技术参数过长。');
    await database.batch([
      database.prepare('INSERT INTO components (sku,name,model,category,description,cost_fen,price_fen,supplier,minimum_stock,specs_json,verified,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name,model=excluded.model,category=excluded.category,description=excluded.description,cost_fen=excluded.cost_fen,price_fen=excluded.price_fen,supplier=excluded.supplier,minimum_stock=excluded.minimum_stock,specs_json=excluded.specs_json,verified=excluded.verified,revision=revision+1,updated_at=excluded.updated_at').bind(sku,name,model,category,text(input.description || '', '说明', 500, 0),cost,price,text(input.supplier || '', '供应商', 100, 0),minimum,specs,input.verified ? 1 : 0,previous?.created_at || now(),now()),
      database.prepare('INSERT INTO admin_audit VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,actor.email,previous?'update':'create','component',sku,JSON.stringify({ name,cost,price }),now()),
    ]);
    return response({ sku });
  }
  if (path[0] === 'components' && path[1] && path[2] === 'stock') {
    requirePermission(actor, 'inventory'); const sku = path[1]; if (!skuPattern.test(sku)) fail('SKU 无效。');
    const delta = int(input.delta, '变动数量', -100000, 100000); if (!delta) fail('变动数量不能为 0。');
    const reason = text(input.reason, '库存变动原因', 300, 4); const item = await database.prepare('SELECT stock, reserved FROM components WHERE sku = ?').bind(sku).first(); if (!item) fail('零件不存在。', 404);
    if (item.stock + delta < item.reserved) fail('出库后不能低于已预留数量。', 409);
    const time = now(); const movementId = crypto.randomUUID();
    await database.batch([
      database.prepare('INSERT INTO inventory_movements (id,sku,delta,balance_after,kind,reason,actor_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM components WHERE sku=? AND stock=? AND stock+? >= reserved)').bind(movementId,sku,delta,item.stock+delta,delta>0?'in':'out',reason,actor.id,time,sku,item.stock,delta),
      database.prepare('UPDATE components SET stock = stock + ?, revision = revision + 1, updated_at = ? WHERE sku = ? AND stock = ? AND EXISTS (SELECT 1 FROM inventory_movements WHERE id=?)').bind(delta,time,sku,item.stock,movementId),
      database.prepare('INSERT INTO admin_audit SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM inventory_movements WHERE id=?)').bind(crypto.randomUUID(),actor.id,actor.email,'stock_change','component',sku,JSON.stringify({ delta,reason }),time,movementId),
    ]);
    const after = await database.prepare('SELECT stock FROM components WHERE sku = ?').bind(sku).first();
    if (after.stock !== item.stock + delta) fail('库存同时被修改，请刷新重试。', 409);
    return response({ sku, stock: after.stock });
  }
  if (path[0] === 'kits' && path.length === 1) {
    requirePermission(actor, 'kits'); const id = input.id && uuid.test(input.id) ? input.id : crypto.randomUUID();
    const previous = await database.prepare('SELECT * FROM kits WHERE id = ?').bind(id).first();
    const name = text(input.name, 'Kit 名称', 100); const description = text(input.description, 'Kit 介绍', 1000);
    const price = int(input.priceFen, 'Kit 价格'); const status = input.status === 'active' ? 'active' : 'draft';
    const verification = ['unverified','engineering_approved','physical_verified'].includes(input.verificationStatus) ? input.verificationStatus : 'unverified';
    if (status === 'active' && verification !== 'physical_verified') fail('只有通过实物验证的 Kit 才能上架。');
    const bom = Array.isArray(input.bom) ? input.bom.map(row => ({ sku: text(row.sku, '零件 SKU', 40), quantity: int(row.quantity, '数量', 1, 1000) })) : [];
    if (bom.length > 100) fail('BOM 最多 100 项。');
    for (const row of bom) if (!await database.prepare('SELECT sku FROM components WHERE sku = ?').bind(row.sku).first()) fail(`零件 ${row.sku} 尚未入库。`);
    const projectId = input.projectId && uuid.test(input.projectId) ? input.projectId : null;
    if (projectId && status === 'active') { const review = await database.prepare('SELECT status FROM plan_reviews WHERE project_id = ?').bind(projectId).first(); if (!review || !['physical_verified','published'].includes(review.status)) fail('关联方案尚未通过实物验证。'); }
    await database.batch([
      database.prepare('INSERT INTO kits (id,name,description,price_fen,difficulty,build_time,project_id,bom_json,instructions,code_url,image_url,verification_status,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price_fen=excluded.price_fen,difficulty=excluded.difficulty,build_time=excluded.build_time,project_id=excluded.project_id,bom_json=excluded.bom_json,instructions=excluded.instructions,code_url=excluded.code_url,image_url=excluded.image_url,verification_status=excluded.verification_status,status=excluded.status,revision=revision+1,updated_at=excluded.updated_at').bind(id,name,description,price,text(input.difficulty||'','难度',30,0),text(input.buildTime||'','制作时间',50,0),projectId,JSON.stringify(bom),text(input.instructions||'','教程',10000,0),text(input.codeUrl||'','代码链接',300,0),text(input.imageUrl||'','图片链接',300,0),verification,status,previous?.created_at||now(),now()),
      database.prepare('INSERT INTO admin_audit VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,actor.email,previous?'update':'create','kit',id,JSON.stringify({name,price,status,verification}),now()),
    ]);
    return response({ id, status });
  }
  if (path[0] === 'orders' && path[1] && path[2] === 'status') {
    requirePermission(actor, 'orders'); if (!uuid.test(path[1])) fail('订单编号无效。');
    const key = `orders/${path[1]}.json`; const stored = await env.BUCKET.get(key); if (!stored) fail('订单不存在。',404); const order = await stored.json();
    const next = text(input.status,'订单状态',40); if (!['pending_review','reviewing','needs_changes','closed','packing','shipped'].includes(next)) fail('订单状态无效。');
    if (['packing','shipped'].includes(next)) { const payment = await database.prepare("SELECT id FROM payment_requests WHERE order_id = ? AND status = 'confirmed' LIMIT 1").bind(order.id).first(); if (!payment) fail('尚无人工核实到账的付款记录，不能配货或发货。'); }
    if (next === 'shipped' && text(input.trackingNumber,'物流单号',100,0).length < 6) fail('发货前需填写物流单号。');
    const previous = order.status; order.status = next; order.updatedAt = now(); order.trackingNumber = next === 'shipped' ? text(input.trackingNumber,'物流单号',100) : order.trackingNumber || null;
    const saved = await env.BUCKET.put(key,JSON.stringify(order),{onlyIf:{etagMatches:stored.etag},httpMetadata:{contentType:'application/json'}}); if (!saved) fail('订单同时被修改，请刷新重试。',409);
    await audit(env,actor,'status_change','order',order.id,{from:previous,to:next,trackingNumber:order.trackingNumber});
    return response({id:order.id,status:next});
  }
  if (path[0] === 'orders' && path[1] && path[2] === 'quote') {
    requirePermission(actor, 'orders'); if (!uuid.test(path[1])) fail('订单编号无效。');
    const quoteCny = int(input.quoteCny, '报价', 1, 50000);
    const key = `orders/${path[1]}.json`; const stored = await env.BUCKET.get(key); if (!stored) fail('订单不存在。', 404);
    const order = await stored.json(); if (['closed','shipped'].includes(order.status)) fail('已关闭或发货的订单不能报价。');
    const payment = await database.prepare("SELECT id FROM payment_requests WHERE order_id = ? AND status IN ('awaiting_transfer','submitted','confirmed') LIMIT 1").bind(order.id).first();
    if (payment) fail('已有付款申请，报价已锁定。', 409);
    const previous = order.quoteCny; order.quoteCny = quoteCny; order.status = 'reviewing'; order.updatedAt = now();
    const saved = await env.BUCKET.put(key, JSON.stringify(order), { onlyIf: { etagMatches: stored.etag }, httpMetadata: { contentType: 'application/json' } });
    if (!saved) fail('订单同时被修改，请刷新重试。', 409);
    await audit(env, actor, 'quote', 'order', order.id, { from: previous, to: quoteCny });
    return response({ id: order.id, quoteCny, status: order.status });
  }
  if (path[0] === 'tickets' && path[1] && path[2] === 'update') {
    requirePermission(actor,'tickets'); const current = await database.prepare('SELECT * FROM support_tickets WHERE id = ?').bind(path[1]).first(); if (!current) fail('工单不存在。',404);
    const status = input.status || current.status; if (!ticketStatuses.includes(status)) fail('工单状态无效。');
    const reply = input.publicReply === undefined ? current.public_reply : text(input.publicReply,'回复',2000,0);
    const note = input.internalNote === undefined ? current.internal_note : text(input.internalNote,'内部备注',2000,0);
    const priority = ['low','normal','high'].includes(input.priority) ? input.priority : current.priority;
    const assignee = input.assignee === undefined ? current.assignee : text(input.assignee,'负责人',254,0);
    await database.batch([
      database.prepare('UPDATE support_tickets SET status=?,public_reply=?,internal_note=?,priority=?,assignee=?,updated_at=? WHERE id=?').bind(status,reply,note,priority,assignee,now(),current.id),
      database.prepare('INSERT INTO admin_audit VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,actor.email,'update','ticket',current.id,JSON.stringify({from:current.status,to:status,hasReply:!!reply}),now()),
    ]);
    return response({id:current.id,status});
  }
  if (path[0] === 'employees' && path.length === 1) {
    requirePermission(actor,'employees'); const email = text(input.email,'员工邮箱',254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('邮箱格式无效。');
    const assigned = Array.isArray(input.roles) ? [...new Set(input.roles)] : []; if (!assigned.length || assigned.some(role => !roles.includes(role))) fail('请选择有效的员工角色。');
    if (email === actor.email && (input.active === false || !assigned.includes('super_admin'))) fail('不能停用自己的账号或移除自己的超级管理员角色。');
    const active = input.active === false ? 0 : 1; const previous = await database.prepare('SELECT * FROM employees WHERE email=?').bind(email).first();
    await database.batch([
      database.prepare('INSERT INTO employees (email,user_id,roles_json,active,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET roles_json=excluded.roles_json,active=excluded.active,updated_at=excluded.updated_at').bind(email,null,JSON.stringify(assigned),active,previous?.created_at||now(),now()),
      database.prepare('INSERT INTO admin_audit VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,actor.email,previous?'update':'create','employee',email,JSON.stringify({roles:assigned,active}),now()),
    ]);
    return response({email,roles:assigned,active:!!active});
  }
  if (path[0] === 'payments' && path[1] && path[2] === 'review') {
    requirePermission(actor,'finance'); const payment = await paymentFor(database,path[1],actor.id,true); if (!payment) fail('付款申请不存在。',404);
    const result = await reviewTransfer(database,payment,input.action,input.note,actor.id); await audit(env,actor,'payment_review','payment',payment.id,{action:input.action,status:result.status}); return response(result);
  }
  fail('接口不存在。',404);
}

export async function adminRequest(env, request, path) {
  try {
    const actor = await adminIdentity(env,request); if (!actor) return response({error:'请使用已授权的 ChatGPT 员工账号登录。'},403);
    const url = new URL(request.url);
    if (request.method === 'GET') return await get(env,actor,path,url.searchParams);
    if (request.method !== 'POST') return response({error:'请求方式不支持。'},405);
    const origin = request.headers.get('origin'); if (origin && origin !== url.origin) return response({error:'请求来源不匹配。'},403);
    if (Number(request.headers.get('content-length')||0)>50_000) return response({error:'内容过长。'},413);
    const input = await request.json().catch(()=>fail('请求格式不正确。'));
    return await post(env,actor,path,input);
  } catch (error) {
    if (!error.status) console.error('Admin request failed',error);
    return response({error:error.status?error.message:'后台暂时无法完成请求。'},error.status||500);
  }
}

export async function customerTicket(env,request,path) {
  try { return await customerTicketInner(env,request,path); }
  catch (error) { if (!error.status) console.error('Support request failed',error); return response({error:error.status?error.message:'暂时无法提交工单，请稍后再试。'},error.status||500); }
}

async function customerTicketInner(env,request,path) {
  const {sessionAccount} = await import('./local-auth.mjs');
  const local = await sessionAccount(env.BUCKET,request);
  const ownerId = local ? `email:${local.account.id}` : request.headers.get('oai-authenticated-user-id');
  if (!ownerId) return response({error:'请先登录。'},401);
  const database = db(env); const url = new URL(request.url);
  if (request.method === 'GET') { const items = (await database.prepare('SELECT id,project_id,order_id,description,status,priority,public_reply,created_at,updated_at FROM support_tickets WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(ownerId).all()).results; return response({items}); }
  if (request.method !== 'POST' || path.length) return response({error:'接口不存在。'},404);
  const origin = request.headers.get('origin'); if (origin && origin !== url.origin) return response({error:'请求来源不匹配。'},403);
  const input = await request.json().catch(()=>fail('请求格式不正确。'));
  const description = text(input.description,'问题描述',2000,10);
  const projectId = input.projectId && uuid.test(input.projectId) ? input.projectId : null;
  const orderId = input.orderId && uuid.test(input.orderId) ? input.orderId : null;
  if (projectId) { const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerId)))].map(x=>x.toString(16).padStart(2,'0')).join(''); const item = await env.BUCKET.get(`ai-projects/${hash}/${projectId}.json`); if (!item) fail('项目不存在。',404); }
  if (orderId) { const item = await env.BUCKET.get(`orders/${orderId}.json`); if (!item || (await item.json()).ownerId !== ownerId) fail('订单不存在。',404); }
  const id = crypto.randomUUID(); const time = now();
  await database.prepare('INSERT INTO support_tickets (id,owner_id,project_id,order_id,step,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,ownerId,projectId,orderId,input.step===undefined?null:int(input.step,'步骤',0,1000),description,time,time).run();
  return response({id,status:'open'},201);
}
