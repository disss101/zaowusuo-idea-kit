import { InputError, parts } from './planner.mjs';
import { modelFor } from './component-models.mjs';

function text(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new InputError(`${label}需要 ${min}–${max} 个字。`);
  }
  return value.trim();
}

export function prepareOrder(input, ownerId) {
  if (!ownerId) throw new InputError('请先登录。');
  if (!input || !input.plan?.supported) throw new InputError('请先生成一份方案。');
  if (input.consent !== true) throw new InputError('请先同意为确认订单而保存联系方式。');
  const name = text(input.name, '称呼', 1, 40);
  const contact = text(input.contact, '联系方式', 7, 100);
  if (!(/^[+\d\s-]{7,25}$/.test(contact) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^(微信|wechat)[:：]\s*\S{4,40}$/i.test(contact))) {
    throw new InputError('请填写手机号、邮箱，或“微信:你的微信号”。');
  }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const idea = text(input.plan.request?.idea, '需求', 4, 600);
  const title = text(input.plan.name, '方案名称', 2, 80);
  const ids = input.plan.bom?.map(row => row.id);
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 15 || new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(parts, id))) {
    throw new InputError('方案零件清单有误，请重新生成。');
  }
  const bom = ids.map(id => ({ id, ...parts[id], ...modelFor(id), quantity: 1 }));
  const estimateCny = bom.reduce((sum, row) => sum + row.price, 0);
  return {
    id: crypto.randomUUID(), ownerId, name, contact, note, title, idea, bom, estimateCny,
    status: 'pending_review', paymentStatus: 'not_started', quoteCny: null,
    consentAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}
