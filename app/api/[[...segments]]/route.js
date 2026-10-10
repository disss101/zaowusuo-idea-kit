import { env } from 'cloudflare:workers';
import { catalog, normalizeRequest, InputError } from '../../../lib/planner.mjs';
import { askClarifyingQuestions, generateAiPlan, presetFallbackPlan, guideBuild, inspectBuildImage, safePlanSteps, AiServiceError } from '../../../lib/ai-design.mjs';
import { examples, exampleCsv } from '../../../lib/examples.mjs';
import { prepareOrder } from '../../../lib/orders.mjs';
import { paymentDb, walletFor, paymentsFor, paymentFor, createTopup, createOrderPayment, submitTransfer, reviewTransfer } from '../../../lib/payments.mjs';
import { AuthError, login, logout, publicProfile, register, sessionAccount, updatePhone } from '../../../lib/local-auth.mjs';
import { applyReview } from '../../../lib/admin-core.mjs';

export const dynamic = 'force-dynamic';

const categories = new Set(['桌面装置', '智能家居', '学习实验', '生活工具', '其他创意']);
const limits = { upload: 25 * 1024 * 1024, file: 10 * 1024 * 1024 };
const dailyAiLimit = 10;
const dailyClarifyLimit = 20;
const dailyGuideLimit = 20;
function tokenCost(model, usage) {
  const rates = model?.startsWith('qwen-plus') ? [0.8, 2] : model?.startsWith('qwen-flash') || model?.startsWith('qwen3-vl-flash') ? [0.15, 1.5] : null;
  return rates && Number.isFinite(usage?.prompt_tokens) && Number.isFinite(usage?.completion_tokens)
    ? Number(((usage.prompt_tokens * rates[0] + usage.completion_tokens * rates[1]) / 1_000_000).toFixed(6)) : null;
}
async function logAiCall({ userHash, projectId = null, task, model, usage = null, startedAt, error = null }) {
  const date = new Date().toISOString().slice(0, 10);
  const record = { at: new Date().toISOString(), projectId, task, model, inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null, estimatedCostCny: tokenCost(model, usage), durationMs: Date.now() - startedAt,
    success: !error, errorType: error?.name || null };
  await bucket().put(`ai-model-usage/${userHash}/${date}/${crypto.randomUUID()}.json`, JSON.stringify(record));
}
async function projectFor(userHash, id) {
  if (!/^[a-f0-9-]{36}$/.test(id || '')) return null;
  const stored = await bucket().get(`ai-projects/${userHash}/${id}.json`);
  if (!stored) return null;
  let project = await stored.json();
  if (env.DB) {
    const review = await env.DB.prepare('SELECT * FROM plan_reviews WHERE project_id = ?').bind(id).first().catch(() => null);
    project = applyReview(project, review);
  }
  if (project?.plan?.supported) project.plan.assemblySteps = safePlanSteps(project.plan.assemblySteps);
  return project;
}
async function saveProject(userHash, project) {
  await bucket().put(`ai-projects/${userHash}/${project.id}.json`, JSON.stringify(project), { httpMetadata: { contentType: 'application/json' } });
}
async function actor(request) {
  const local = await sessionAccount(bucket(), request);
  if (local) return { id: `email:${local.account.id}`, mode: 'email', local };
  const id = request.headers.get('oai-authenticated-user-id');
  return id ? { id, mode: 'chatgpt' } : null;
}
function isStaff(request, signedIn) {
  if (signedIn?.mode !== 'chatgpt') return false;
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
async function actorKey(id) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))), byte => byte.toString(16).padStart(2, '0')).join('');
}
const engagementKinds = new Set(['likes', 'favorites', 'unlocks']);
async function engagementCounts() {
  const counts = {};
  let cursor;
  do {
    const page = await bucket().list({ prefix: 'engagement/', limit: 1000, cursor });
    for (const object of page.objects) {
      const [, id, kind] = object.key.split('/');
      if (!engagementKinds.has(kind)) continue;
      counts[id] ||= { likes: 0, favorites: 0, unlocks: 0 };
      counts[id][kind] += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return counts;
}
async function engagementFor(id, request) {
  const signedIn = await actor(request);
  if (!signedIn) return { liked: false, favorited: false, unlocked: false };
  const hash = await actorKey(signedIn.id);
  const [liked, favorited, unlocked] = await Promise.all(['likes', 'favorites', 'unlocks'].map(kind => bucket().head(`engagement/${id}/${kind}/${hash}.json`)));
  return { liked: !!liked, favorited: !!favorited, unlocked: !!unlocked };
}
async function workWithStats(work, request) {
  const [counts, engagement] = await Promise.all([engagementCounts(), engagementFor(work.id, request)]);
  return { ...publicWork(work), stats: counts[work.id] || { likes: 0, favorites: 0, unlocks: 0 }, engagement };
}
async function setEngagement(id, kind, active, request) {
  const signedIn = await actor(request);
  if (!signedIn) return json({ error: '请先登录，再参与作品互动。' }, 401);
  if (!engagementKinds.has(kind)) throw new InputError('互动类型无效。');
  const work = examples.find(item => item.id === id) || await savedWork(id);
  if (!work) return json({ error: '作品不存在。' }, 404);
  const hash = await actorKey(signedIn.id);
  const key = `engagement/${id}/${kind}/${hash}.json`;
  if (kind === 'unlocks') {
    if (!await bucket().head(key)) await bucket().put(key, JSON.stringify({ at: new Date().toISOString() }));
  } else if (active === true) {
    if (!await bucket().head(key)) await bucket().put(key, JSON.stringify({ at: new Date().toISOString() }));
  } else if (active === false) {
    await bucket().delete(key);
  } else throw new InputError('互动状态无效。');
  return json({ stats: (await engagementCounts())[id] || { likes: 0, favorites: 0, unlocks: 0 }, engagement: await engagementFor(id, request) });
}
async function listWorks(params) {
  const q = String(params.get('q') || '').trim().toLowerCase().slice(0, 100);
  const category = String(params.get('category') || '').trim();
  const kind = String(params.get('kind') || 'all');
  const sort = String(params.get('sort') || 'recent');
  if (!['recent', 'likes', 'favorites', 'unlocks'].includes(sort)) throw new InputError('排序方式无效。');
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.get('page') || '1', 10) || 1));
  const [records, counts] = await Promise.all([allWorks(), engagementCounts()]);
  const matching = records.concat(examples).filter(work =>
    (kind === 'all' || (kind === 'example' && work.isExample) || (kind === 'community' && !work.isExample)) &&
    (!category || work.category === category) &&
    (!q || [work.title, work.summary, work.author, work.description].some(x => x.toLowerCase().includes(q)))
  ).sort((a, b) => (sort === 'recent' ? 0 : (counts[b.id]?.[sort] || 0) - (counts[a.id]?.[sort] || 0)) || b.createdAt.localeCompare(a.createdAt));
  const pageSize = 8;
  return { items: matching.slice((page - 1) * pageSize, page * pageSize).map(work => ({ ...publicWork(work), stats: counts[work.id] || { likes: 0, favorites: 0, unlocks: 0 } })), page, pageSize, total: matching.length, pages: Math.max(1, Math.ceil(matching.length / pageSize)) };
}
async function createWork(request) {
  const userId = (await actor(request))?.id;
  if (!userId) return json({ error: '发布作品需要先登录。' }, 401);
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
  const unlockPriceCoins = Number(form.get('unlockPriceCoins') ?? 20);
  if (!Number.isSafeInteger(unlockPriceCoins) || unlockPriceCoins < 0 || unlockPriceCoins > 500) throw new InputError('造物币参考解锁价需要为 0–500 的整数。');
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
  const record = { id, title, author, summary, description, category, bom, files, coverFileId, unlockPriceCoins, ownerId: userId, createdAt: new Date().toISOString() };
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
  if (section === 'files' && !(await engagementFor(id, request)).unlocked) return json({ error: '请先登录并解锁作品后下载。' }, 403);
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
  const userId = (await actor(request))?.id;
  if (!userId) return json({ error: '请先登录，再生成 AI 方案。' }, 401);
  if (!env.QWEN_API_KEY) return json({ error: 'AI 服务尚未配置，请稍后再试。' }, 503);
  const normalized = normalizeRequest(input);
  const userHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))), x => x.toString(16).padStart(2, '0')).join('');
  const requestHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ version: 4, normalized })))), x => x.toString(16).padStart(2, '0')).join('');
  const cacheKey = `ai-cache/${userHash}/${requestHash}.json`;
  const cached = await bucket().get(cacheKey);
  if (cached) return json(await cached.json());
  const date = new Date().toISOString().slice(0, 10);
  const prefix = `ai-usage/${userHash}/${date}/`;
  const usage = await bucket().list({ prefix, limit: dailyAiLimit });
  if (usage.objects.length >= dailyAiLimit) return json({ error: '今天的 AI 生成次数已用完，明天再来试试。' }, 429);
  const projectId = crypto.randomUUID();
  const model = env.QWEN_PLAN_MODEL || 'qwen-plus';
  const startedAt = Date.now();
  let result;
  let metering;
  let resolvedModel = model;
  try {
    result = await generateAiPlan(normalized, { apiKey: env.QWEN_API_KEY, model, endpoint: env.QWEN_API_ENDPOINT || undefined,
      onUsage: info => { metering = info; },
    });
  } catch (error) {
    await logAiCall({ userHash, projectId, task: 'generatePlan', model: metering?.model || model, usage: metering?.usage, startedAt, error }).catch(() => {});
    if (!(error instanceof AiServiceError)) throw error;
    console.warn('AI plan generation failed', { model, reason: error.message });
    const fastModel = env.QWEN_FAST_MODEL || 'qwen-flash';
    if (fastModel !== model) {
      const retryStartedAt = Date.now();
      try {
        metering = null;
        result = await generateAiPlan(normalized, { apiKey: env.QWEN_API_KEY, model: fastModel, endpoint: env.QWEN_API_ENDPOINT || undefined,
          timeoutMs: 25000, onUsage: info => { metering = info; },
        });
        resolvedModel = fastModel;
      } catch (retryError) {
        console.warn('AI plan retry failed', { model: fastModel, reason: retryError.message });
        await logAiCall({ userHash, projectId, task: 'generatePlanRetry', model: fastModel, startedAt: retryStartedAt, error: retryError }).catch(() => {});
      }
    }
    if (!result) result = presetFallbackPlan(normalized);
    if (!result) throw error;
  }
  if (result.source === 'qwen') await logAiCall({ userHash, projectId, task: 'generatePlan', model: metering?.model || resolvedModel, usage: metering?.usage, startedAt }).catch(() => {});
  if (result.supported) {
    result.projectId = projectId;
    await saveProject(userHash, { id: projectId, ownerId: userId, plan: result, step: 0, history: [], verifiedWiring: null, firmwareVersion: null, status: '待工程验证', createdAt: new Date().toISOString() });
  }
  if (result.source === 'qwen') await bucket().put(cacheKey, JSON.stringify(result), { httpMetadata: { contentType: 'application/json' } });
  await bucket().put(`${prefix}${crypto.randomUUID()}.json`, JSON.stringify({ at: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
  return json(result);
}
async function clarify(input, request) {
  const userId = (await actor(request))?.id;
  if (!userId) return json({ error: '请先登录，再开始 AI 追问。' }, 401);
  const idea = String(input?.idea || '').trim();
  if (idea.length < 4 || idea.length > 600) throw new InputError('请用 4–600 字描述你的想法。');
  if (!env.QWEN_API_KEY) return json({ error: 'AI 服务尚未配置，请稍后再试。' }, 503);
  const userHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId))), x => x.toString(16).padStart(2, '0')).join('');
  const date = new Date().toISOString().slice(0, 10);
  const prefix = `clarify-usage/${userHash}/${date}/`;
  const usage = await bucket().list({ prefix, limit: dailyClarifyLimit });
  if (usage.objects.length >= dailyClarifyLimit) return json({ error: '今天的追问次数已用完，明天再来试试。' }, 429);
  const model = env.QWEN_FAST_MODEL || 'qwen-flash';
  const startedAt = Date.now();
  let answer;
  let metering;
  try {
    answer = await askClarifyingQuestions({ idea }, { apiKey: env.QWEN_API_KEY, model, endpoint: env.QWEN_API_ENDPOINT || undefined, onUsage: info => { metering = info; } });
    await logAiCall({ userHash, task: 'analyzeIdea', model: metering?.model || model, usage: metering?.usage, startedAt });
  } catch (error) {
    await logAiCall({ userHash, task: 'analyzeIdea', model: metering?.model || model, usage: metering?.usage, startedAt, error }).catch(() => {});
    throw error;
  }
  await bucket().put(`${prefix}${crypto.randomUUID()}.json`, JSON.stringify({ at: new Date().toISOString() }));
  return json(answer);
}
async function projectAction(path, input, request) {
  const signedIn = await actor(request);
  if (!signedIn) return json({ error: '请先登录。' }, 401);
  const userHash = await actorKey(signedIn.id);
  const id = path[1];
  const project = await projectFor(userHash, id);
  if (!project || project.ownerId !== signedIn.id) return json({ error: '项目不存在。' }, 404);
  if (path[2] === 'progress') {
    const step = Number(input?.step);
    if (!Number.isInteger(step) || step < 0 || step >= (project.plan.assemblySteps?.length || 4)) throw new InputError('制作步骤无效。');
    project.step = step;
    await saveProject(userHash, project);
    return json({ id, step });
  }
  if (!['guide', 'inspect'].includes(path[2])) return json({ error: '接口不存在。' }, 404);
  if (!env.QWEN_API_KEY) return json({ error: 'AI 服务尚未配置，请稍后再试。' }, 503);
  const today = new Date().toISOString().slice(0, 10);
  const prefix = `ai-usage/${userHash}/${today}/guide/`;
  if ((await bucket().list({ prefix, limit: dailyGuideLimit })).objects.length >= dailyGuideLimit) return json({ error: '今天的项目指导额度已用完，明天再来试试。' }, 429);
  const complex = /编译|报错|烧录|代码|程序|供电|电压|短路|发热|电机|驱动|GPIO|I2C|SPI/i.test(String(input?.question || ''));
  const model = path[2] === 'inspect' ? (env.QWEN_VISION_MODEL || 'qwen3-vl-flash') : complex ? (env.QWEN_PLAN_MODEL || 'qwen-plus') : (env.QWEN_FAST_MODEL || 'qwen-flash');
  const startedAt = Date.now();
  let metering;
  try {
    const settings = { apiKey: env.QWEN_API_KEY, model, endpoint: env.QWEN_API_ENDPOINT || undefined, onUsage: info => { metering = info; } };
    const answer = path[2] === 'inspect'
      ? await inspectBuildImage(project, input?.imageDataUrl, input?.question, settings)
      : await guideBuild(project, input?.question, settings);
    await logAiCall({ userHash, projectId: id, task: path[2] === 'inspect' ? 'inspectImage' : 'guideBuild', model: metering?.model || model, usage: metering?.usage, startedAt });
    await bucket().put(`${prefix}${crypto.randomUUID()}.json`, JSON.stringify({ at: new Date().toISOString(), projectId: id }));
    if (path[2] === 'guide') {
      project.history = [...(project.history || []), { question: String(input.question).slice(0, 800), actions: answer.actions, at: new Date().toISOString() }].slice(-20);
      await saveProject(userHash, project);
    }
    return json(answer);
  } catch (error) {
    await logAiCall({ userHash, projectId: id, task: path[2] === 'inspect' ? 'inspectImage' : 'guideBuild', model: metering?.model || model, usage: metering?.usage, startedAt, error }).catch(() => {});
    throw error;
  }
}
async function getOrders(request, staff = false) {
  const signedIn = await actor(request);
  const userId = signedIn?.id;
  if (!userId) return json({ error: '请先登录。' }, 401);
  if (staff && !isStaff(request, signedIn)) return json({ error: '没有工作人员权限。' }, 403);
  const page = await bucket().list({ prefix: 'orders/', limit: 1000 });
  const records = (await Promise.all(page.objects.map(async object => {
    const stored = await bucket().get(object.key);
    return stored ? stored.json() : null;
  }))).filter(Boolean).filter(order => staff || order.ownerId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ items: records.slice(0, 100), truncated: page.truncated || records.length > 100 });
}
async function createOrder(input, request) {
  const userId = (await actor(request))?.id;
  if (!userId) return json({ error: '请先登录，再提交订单需求。' }, 401);
  const order = prepareOrder(input, userId);
  await bucket().put(`orders/${order.id}.json`, JSON.stringify(order), { httpMetadata: { contentType: 'application/json' } });
  return json({ id: order.id, status: order.status, paymentStatus: order.paymentStatus, estimateCny: order.estimateCny }, 201);
}
async function updateOrder(id, input, request) {
  if (!isStaff(request, await actor(request))) return json({ error: '没有工作人员权限。' }, 403);
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
async function quoteOrder(id, input, request) {
  if (!isStaff(request, await actor(request))) return json({ error: '没有工作人员权限。' }, 403);
  if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: '订单不存在。' }, 404);
  const quoteCny = Number(input?.quoteCny);
  if (!Number.isSafeInteger(quoteCny) || quoteCny < 1 || quoteCny > 50000) throw new InputError('请填写 1–50000 元的整数报价。');
  const key = `orders/${id}.json`;
  const stored = await bucket().get(key);
  if (!stored) return json({ error: '订单不存在。' }, 404);
  const existing = await paymentDb(env).prepare("SELECT id FROM payment_requests WHERE order_id = ? AND status IN ('awaiting_transfer', 'submitted', 'confirmed') LIMIT 1").bind(id).first();
  if (existing) throw new InputError('这笔订单已有付款申请，不能修改报价。');
  const order = await stored.json();
  if (order.status === 'closed') throw new InputError('已关闭订单不能报价。');
  order.quoteCny = quoteCny;
  order.status = 'reviewing';
  order.updatedAt = new Date().toISOString();
  await bucket().put(key, JSON.stringify(order), { httpMetadata: { contentType: 'application/json' } });
  return json({ id, quoteCny, status: order.status });
}
async function paymentAction(path, input, request) {
  const signedIn = await actor(request);
  if (!signedIn) return json({ error: '请先登录。' }, 401);
  const db = paymentDb(env);
  if (path.join('/') === 'payments/topup') return json(await createTopup(db, signedIn.id, Number(input?.amountFen)), 201);
  if (path.join('/') === 'payments/order') {
    const id = String(input?.orderId || '');
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new InputError('订单编号无效。');
    const stored = await bucket().get(`orders/${id}.json`);
    if (!stored) return json({ error: '订单不存在。' }, 404);
    return json(await createOrderPayment(db, await stored.json(), signedIn.id), 201);
  }
  if (path.length === 3 && path[0] === 'payments' && path[2] === 'submit') {
    const payment = await paymentFor(db, path[1], signedIn.id);
    if (!payment) return json({ error: '付款申请不存在。' }, 404);
    return json(await submitTransfer(db, payment, input?.transactionRef));
  }
  if (path.length === 4 && path[0] === 'staff' && path[1] === 'payments' && path[3] === 'review') {
    if (!isStaff(request, signedIn)) return json({ error: '没有工作人员权限。' }, 403);
    const payment = await paymentFor(db, path[2], signedIn.id, true);
    if (!payment) return json({ error: '付款申请不存在。' }, 404);
    return json(await reviewTransfer(db, payment, input?.action, input?.note, signedIn.id));
  }
  return json({ error: '接口不存在。' }, 404);
}
async function handle(request) {
  const url = new URL(request.url);
  const path = url.pathname.split('/').filter(Boolean).slice(1);
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: '请求来源不匹配。' }, 403);
    if (path.join('/') === 'works') return createWork(request);
    const bodyLimit = path.length === 3 && path[0] === 'projects' && path[2] === 'inspect' ? 4_100_000 : 16000;
    if (Number(request.headers.get('content-length') || 0) > bodyLimit) return json({ error: '内容过长。' }, 413);
    const input = await request.json().catch(() => { throw new InputError('请求格式不正确。'); });
    if (path.join('/') === 'local-auth/register' || path.join('/') === 'local-auth/login') {
      const result = path[1] === 'register' ? await register(bucket(), input) : await login(bucket(), input);
      return Response.json({ authenticated: true, ...result.profile, isStaff: false }, { headers: { 'Set-Cookie': result.setCookie, 'Cache-Control': 'no-store' } });
    }
    if (path.join('/') === 'local-auth/logout') {
      const clearCookie = await logout(bucket(), request);
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearCookie, 'Cache-Control': 'no-store' } });
    }
    if (path.join('/') === 'local-auth/phone') {
      const signedIn = await actor(request);
      if (signedIn?.mode !== 'email') return json({ error: '请先用邮箱账号登录。' }, 401);
      return json(await updatePhone(bucket(), signedIn.local, input.phone));
    }
    if (path.join('/') === 'design') return design(input, request);
    if (path.length === 3 && path[0] === 'projects') return projectAction(path, input, request);
    if (path.length === 3 && path[0] === 'works' && path[2] === 'engagement') return setEngagement(path[1], input.kind, input.active, request);
    if (path.join('/') === 'clarify') return clarify(input, request);
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
    if (path.length === 4 && path[0] === 'staff' && path[1] === 'orders' && path[3] === 'quote') return quoteOrder(path[2], input, request);
    if (path[0] === 'payments' || (path[0] === 'staff' && path[1] === 'payments')) return paymentAction(path, input, request);
    return json({ error: '接口不存在。' }, 404);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: '请求方式不支持。' }, 405);
  if (path.join('/') === 'catalog') return json(catalog);
  if (path[0] === 'projects') {
    const signedIn = await actor(request);
    if (!signedIn) return json({ error: '请先登录。' }, 401);
    const userHash = await actorKey(signedIn.id);
    if (path.length === 2) {
      const project = await projectFor(userHash, path[1]);
      return project?.ownerId === signedIn.id ? json(project) : json({ error: '项目不存在。' }, 404);
    }
    if (path.length === 1) {
      const page = await bucket().list({ prefix: `ai-projects/${userHash}/`, limit: 100 });
      const projects = (await Promise.all(page.objects.map(async item => (await bucket().get(item.key))?.json()))).filter(Boolean)
        .filter(item => item.ownerId === signedIn.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const reviewed = await Promise.all(projects.map(async item => {
        const review = env.DB ? await env.DB.prepare('SELECT * FROM plan_reviews WHERE project_id = ?').bind(item.id).first().catch(() => null) : null;
        return applyReview(item, review);
      }));
      return json({ items: reviewed.map(({ id, plan, step, status, createdAt }) => ({ id, name: plan.name, desc: plan.desc, step, status, createdAt })), truncated: page.truncated });
    }
  }
  if (path.join('/') === 'pricing') return json({ unit: '造物币', coinsPerYuan: 10, generationPreview: 5, exampleUnlock: 0, communitySuggestedUnlock: 20, paymentReview: 'manual', coinSpendingEnabled: false });
  if (path.join('/') === 'health') return json({ ok: true, mode: 'course-demo', storage: 'r2' });
  if (path.join('/') === 'auth') {
    const signedIn = await actor(request);
    const authenticated = !!signedIn;
    if (signedIn?.mode === 'email') return json({ authenticated: true, ...publicProfile(signedIn.local.account), isStaff: false });
    const encoded = request.headers.get('oai-authenticated-user-full-name');
    let displayName = request.headers.get('oai-authenticated-user-email') || '造物玩家';
    if (encoded && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
      try { displayName = decodeURIComponent(encoded); } catch {}
    }
    return json({ authenticated, displayName: authenticated ? displayName : null, isStaff: authenticated && isStaff(request, signedIn), mode: signedIn?.mode || null });
  }
  if (path.join('/') === 'orders') return getOrders(request);
  if (path.join('/') === 'staff/orders') return getOrders(request, true);
  if (path.join('/') === 'wallet') {
    const signedIn = await actor(request);
    return signedIn ? json(await walletFor(paymentDb(env), signedIn.id)) : json({ error: '请先登录。' }, 401);
  }
  if (path.join('/') === 'payments') {
    const signedIn = await actor(request);
    return signedIn ? json({ items: await paymentsFor(paymentDb(env), signedIn.id) }) : json({ error: '请先登录。' }, 401);
  }
  if (path.join('/') === 'staff/payments') {
    const signedIn = await actor(request);
    return isStaff(request, signedIn) ? json({ items: await paymentsFor(paymentDb(env), signedIn.id, true) }) : json({ error: '没有工作人员权限。' }, 403);
  }
  if (path.join('/') === 'works') return json(await listWorks(url.searchParams));
  if (path.length === 2 && path[0] === 'works' && /^[a-z0-9-]{6,60}$/.test(path[1])) {
    const work = examples.find(item => item.id === path[1]) || await savedWork(path[1]);
    return work ? json(await workWithStats(work, request)) : json({ error: '作品不存在。' }, 404);
  }
  if (path.length === 4 && path[0] === 'works' && ['cover', 'files'].includes(path[2]) && /^[a-z0-9-]{3,60}$/.test(path[3])) return download(path[1], path[2], path[3], request);
  return json({ error: '接口不存在。' }, 404);
}
export async function GET(request) { try { return await handle(request); } catch (error) { return failure(error); } }
export async function HEAD(request) { try { return await handle(request); } catch (error) { return failure(error); } }
export async function POST(request) { try { return await handle(request); } catch (error) { return failure(error); } }
function failure(error) {
  if (error instanceof AuthError) return json({ error: error.message }, error.status);
  if (error instanceof InputError) return json({ error: error.message }, 400);
  if (error instanceof AiServiceError) return json({ error: error.message }, 502);
  console.error(error);
  return json({ error: '暂时无法完成，请稍后重试。' }, 500);
}
