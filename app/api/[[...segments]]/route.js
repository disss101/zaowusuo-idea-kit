import { env } from 'cloudflare:workers';
import { catalog, InputError } from '../../../lib/planner.mjs';
import { generateAiPlan, AiServiceError } from '../../../lib/ai-design.mjs';
import { examples, exampleCsv } from '../../../lib/examples.mjs';
import { prepareOrder } from '../../../lib/orders.mjs';

export const dynamic = 'force-dynamic';

const categories = new Set(['桌面装置', '智能家居', '学习实验', '生活工具', '其他创意']);
const limits = { upload: 25 * 1024 * 1024, file: 10 * 1024 * 1024 };
const dailyAiLimit = 10;
function currentUser(request) { return request.headers.get('oai-authenticated-user-id'); }
function isStaff(request) {
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return !!email && !!env.ADMIN_EMAIL && env.ADMIN_EMAIL.split(',').some(item => item.trim().toLowerCase() === email);
}
const formats = {
  pdf: { type: 'application/pdf', valid: b => bytes(b, [37, 80, 68, 70, 45]) },
  png: { type: 'image/png', valid: b => bytes(b, [137, 80, 78, 71, 13, 10, 26, 10]) },
  jpg: { type: 'image/jpeg', valid: b => bytes(b, [255, 216, 255]) },
  jpeg: { type: 'image/jpeg', valid: b => bytes(b, [255, 216, 255]) },
  webp: { type: 'image/webp', valid: b => bytes(b, [82, 73, 70, 70]) && bytes(b.slice(8), [87, 69, 66, 80]) },
  zip: { type: 'application/zip', valid: b => bytes(b, [80, 75, 3, 4]) },
};

function bytes(buffer, signature) { return signature.every((value, index) => buffer[index] === value); }
function json(value, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); }
function clean(value, label, min, max) {
  if (typeof value !== 'string') throw new InputError(`${label}填写不正确。`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new InputError(`${label}需要 ${min}–${max} 个字。`);
  return text;
}
function publicWork(work) {
  const { ownerId, files, ...rest } = work;
  return { ...rest, files: files.map(({ id, name, size, type }) => ({ id, name, size, type })) };
}
function bucket() {
  if (!env.BUCKET) throw Error('作品存储尚未连接。');
  return env.BUCKET;
}
async function savedWork(id) {
  if (!/^[a-z0-9-]{6,60}$/.test(id)) return null;
  const object = await bucket().get(`index/${id}.json`);
  return object ? object.json() : null;
}
async function allWorks() {
  const records = [];
  let cursor;
  do {
    const page = await bucket().list({ prefix: 'index/', limit: 1000, cursor });
    if (records.length + page.objects.length > 5000) throw Error('作品数量超过当前站点容量。');
    const loaded = await Promise.all(page.objects.map(async item => {
      const object = await bucket().get(item.key);
      return object ? object.json() : null;
    }));
    records.push(...loaded.filter(Boolean));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return records;
}
async function listWorks(params) {
  const q = String(params.get('q') || '').trim().toLowerCase().slice(0, 100);
  const category = String(params.get('category') || '').trim();
  const kind = String(params.get('kind') || 'all');
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.get('page') || '1', 10) || 1));
  const records = (await allWorks()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const matching = records.concat(examples).filter(work =>
    (kind === 'all' || (kind === 'example' && work.isExample) || (kind === 'community' && !work.isExample)) &&
    (!category || work.category === category) &&
    (!q || [work.title, work.summary, work.author, work.description].some(x => x.toLowerCase().includes(q)))
  );
  const pageSize = 8;
  return { items: matching.slice((page - 1) * pageSize, page * pageSize).map(publicWork), page, pageSize, total: matching.length, pages: Math.max(1, Math.ceil(matching.length / pageSize)) };
}
async function createWork(request) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({ error: '发布作品需要先登录。', signIn: '/signin-with-chatgpt?return_to=%2Findex.html' }, 401);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new InputError('请提交作品表单。');
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > limits.upload) return json({ error: '上传总大小不能超过 25 MB。' }, 413);
  const form = await request.formData();
  const title = clean(form.get('title'), '作品名称', 3, 80);
  const author = clean(form.get('author'), '发布者', 2, 40);
  const summary = clean(form.get('summary'), '一句话介绍', 10, 180);
  const description = clean(form.get('description'), '制作说明', 20, 5000);
  const category = clean(form.get('category'), '分类', 2, 20);
  if (!categories.has(category)) throw new InputError('作品分类无效。');
  if (form.get('rights') !== 'yes') throw new InputError('请确认你有权分享这些文件。');
  let bom;
  try { bom = JSON.parse(form.get('bom')); } catch { throw new InputError('配件表格式不正确。'); }
  if (!Array.isArray(bom) || bom.length < 1 || bom.length > 40) throw new InputError('请填写 1–40 项配件。');
  bom = bom.map(row => ({ name: clean(row?.name, '配件名称', 1, 80), quantity: clean(row?.quantity, '配件数量', 1, 30), note: typeof row?.note === 'string' ? row.note.trim().slice(0, 120) : '' }));
  const uploaded = form.getAll('files');
  if (uploaded.length < 1 || uploaded.length > 5) throw new InputError('请上传 1–5 个图纸或项目文件。');
  if (uploaded.reduce((total, file) => total + (file?.size || 0), 0) > limits.upload) return json({ error: '上传总大小不能超过 25 MB。' }, 413);
  const id = crypto.randomUUID();
  const prepared = [];
  for (const file of uploaded) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new InputError('文件格式不正确。');
    if (file.size < 1 || file.size > limits.file) throw new InputError('每个文件需要小于 10 MB。');
    const name = clean(file.name, '文件名', 1, 120).replace(/[\\/\r\n]/g, '_');
    const extension = name.split('.').pop().toLowerCase();
    const rule = formats[extension];
    if (!rule) throw new InputError('仅支持 PDF、PNG、JPG、WebP 或 ZIP 文件。');
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (!rule.valid(buffer)) throw new InputError(`文件 ${name} 的内容与格式不符。`);
    prepared.push({ id: crypto.randomUUID(), name, size: file.size, type: rule.type, extension, buffer });
  }
  const files = prepared.map(({ id, name, size, type, extension }) => ({ id, name, size, type, extension }));
  const coverFileId = files.find(file => file.type.startsWith('image/'))?.id || null;
  const record = { id, title, author, summary, description, category, bom, files, coverFileId, ownerId: userId, createdAt: new Date().toISOString() };
  const written = [];
  try {
    for (const file of prepared) {
      const key = `files/${id}/${file.id}.${file.extension}`;
      await bucket().put(key, file.buffer, { httpMetadata: { contentType: file.type } });
      written.push(key);
    }
    await bucket().put(`index/${id}.json`, JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } });
  } catch (error) {
    await Promise.all(written.map(key => bucket().delete(key).catch(() => {})));
    throw error;
  }
  return json(publicWork(record), 201);
}
async function download(id, section, fileId, request) {
  const example = examples.find(work => work.id === id);
  if (example) {
    if (section === 'cover' && fileId === 'cover') return Response.redirect(new URL(example.coverUrl, request.url), 302);
    if (section === 'files' && fileId === 'bom') return new Response(exampleCsv(example), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${example.id}-parts.csv"` } });
    return json({ error: '文件不存在。' }, 404);
  }
  const work = await savedWork(id);
  const file = work?.files.find(item => item.id === fileId);
  if (!file || (section === 'cover' && (work.coverFileId !== fileId || !file.type.startsWith('image/')))) return json({ error: '文件不存在。' }, 404);
  const object = await bucket().get(`files/${id}/${file.id}.${file.extension}`);
  if (!object) return json({ error: '文件不存在。' }, 404);
  const headers = { 'Content-Type': file.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' };
  if (section === 'files') headers['Content-Disposition'] = `attachment; filename="download.${file.extension}"; filename*=UTF-8''${encodeURIComponent(file.name)}`;
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
}
async function design(input, request) {
  const userId = currentUser(request);
  if (!userId) return json({ error: '请先登录，再生成 AI 方案。' }, 401);
  if (!env.DEEPSEEK_API_KEY) return json({ error: 'AI 服务尚未配置，请稍后再试。' }, 503);
  const userHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))), x => x.toString(16).padStart(2, '0')).join('');
  const date = new Date().toISOString().slice(0, 10);
  const prefix = `ai-usage/${userHash}/${date}/`;
  const usage = await bucket().list({ prefix, limit: dailyAiLimit });
  if (usage.objects.length >= dailyAiLimit) return json({ error: '今天的 AI 生成次数已用完，明天再来试试。' }, 429);
  const result = await generateAiPlan(input, { apiKey: env.DEEPSEEK_API_KEY });
  await bucket().put(`${prefix}${crypto.randomUUID()}.json`, JSON.stringify({ at: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
  return json(result);
}
async function getOrders(request, staff = false) {
  const userId = currentUser(request);
  if (!userId) return json({ error: '请先登录。' }, 401);
  if (staff && !isStaff(request)) return json({ error: '没有工作人员权限。' }, 403);
  const page = await bucket().list({ prefix: 'orders/', limit: 1000 });
  const records = (await Promise.all(page.objects.map(async object => {
    const stored = await bucket().get(object.key);
    return stored ? stored.json() : null;
  }))).filter(Boolean).filter(order => staff || order.ownerId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ items: records.slice(0, 100), truncated: page.truncated || records.length > 100 });
}
async function createOrder(input, request) {
  const userId = currentUser(request);
  if (!userId) return json({ error: '请先登录，再提交订单需求。' }, 401);
  const order = prepareOrder(input, userId);
  await bucket().put(`orders/${order.id}.json`, JSON.stringify(order), { httpMetadata: { contentType: 'application/json' } });
  return json({ id: order.id, status: order.status, paymentStatus: order.paymentStatus, estimateCny: order.estimateCny }, 201);
}
async function updateOrder(id, input, request) {
  if (!isStaff(request)) return json({ error: '没有工作人员权限。' }, 403);
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: '订单不存在。' }, 404);
  if (!['pending_review', 'reviewing', 'needs_changes', 'closed'].includes(input?.status)) throw new InputError('订单状态无效。');
  const key = `orders/${id}.json`;
  const stored = await bucket().get(key);
  if (!stored) return json({ error: '订单不存在。' }, 404);
  const order = await stored.json();
  order.status = input.status;
  order.updatedAt = new Date().toISOString();
  await bucket().put(key, JSON.stringify(order), { httpMetadata: { contentType: 'application/json' } });
  return json({ id: order.id, status: order.status });
}
async function handle(request) {
  const url = new URL(request.url);
  const path = url.pathname.split('/').filter(Boolean).slice(1);
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: '请求来源不匹配。' }, 403);
    if (path.join('/') === 'works') return createWork(request);
    if (Number(request.headers.get('content-length') || 0) > 16000) return json({ error: '内容过长。' }, 413);
    const input = await request.json().catch(() => { throw new InputError('请求格式不正确。'); });
    if (path.join('/') === 'design') return design(input, request);
    if (path.join('/') === 'events') {
      const allowed = ['visit', 'design_start', 'design_complete', 'buy_click', 'feedback'];
      if (!allowed.includes(input.event) || typeof input.session !== 'string' || !/^[\w-]{10,80}$/.test(input.session)) throw new InputError('记录格式不正确。');
      const record = { event: input.event, session: input.session, at: new Date().toISOString() };
      if (input.event === 'feedback') {
        if (!['价格偏高', '不确定能否做成', '没有喜欢的功能', '想再考虑', '其他'].includes(input.reason)) throw new InputError('反馈选项无效。');
        record.reason = input.reason;
      }
      await bucket().put(`events/${Date.now()}-${crypto.randomUUID()}.json`, JSON.stringify(record));
      return json({ ok: true });
    }
    if (path.join('/') === 'orders') return createOrder(input, request);
    if (path.length === 4 && path[0] === 'staff' && path[1] === 'orders' && path[3] === 'status') return updateOrder(path[2], input, request);
    return json({ error: '接口不存在。' }, 404);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: '请求方式不支持。' }, 405);
  if (path.join('/') === 'catalog') return json(catalog);
  if (path.join('/') === 'health') return json({ ok: true, mode: 'course-demo', storage: 'r2' });
  if (path.join('/') === 'auth') {
    const authenticated = !!request.headers.get('oai-authenticated-user-id');
    const encoded = request.headers.get('oai-authenticated-user-full-name');
    let displayName = request.headers.get('oai-authenticated-user-email') || '造物玩家';
    if (encoded && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
      try { displayName = decodeURIComponent(encoded); } catch {}
    }
    return json({ authenticated, displayName: authenticated ? displayName : null, isStaff: authenticated && isStaff(request) });
  }
  if (path.join('/') === 'orders') return getOrders(request);
  if (path.join('/') === 'staff/orders') return getOrders(request, true);
  if (path.join('/') === 'works') return json(await listWorks(url.searchParams));
  if (path.length === 2 && path[0] === 'works' && /^[a-z0-9-]{6,60}$/.test(path[1])) {
    const work = examples.find(item => item.id === path[1]) || await savedWork(path[1]);
    return work ? json(publicWork(work)) : json({ error: '作品不存在。' }, 404);
  }
  if (path.length === 4 && path[0] === 'works' && ['cover', 'files'].includes(path[2]) && /^[a-z0-9-]{3,60}$/.test(path[3])) return download(path[1], path[2], path[3], request);
  return json({ error: '接口不存在。' }, 404);
}
export async function GET(request) { try { return await handle(request); } catch (error) { return failure(error); } }
export async function HEAD(request) { try { return await handle(request); } catch (error) { return failure(error); } }
export async function POST(request) { try { return await handle(request); } catch (error) { return failure(error); } }
function failure(error) {
  if (error instanceof InputError) return json({ error: error.message }, 400);
  if (error instanceof AiServiceError) return json({ error: error.message }, 502);
  console.error(error);
  return json({ error: '暂时无法完成，请稍后重试。' }, 500);
}
