export const roles = ['super_admin', 'technician', 'operations', 'support'];
export const planStatuses = ['generated', 'pending_review', 'in_review', 'needs_changes', 'engineering_approved', 'pending_physical', 'physical_verified', 'published', 'rejected'];
export const ticketStatuses = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];
export const permissions = {
  overview: roles,
  plans: ['super_admin', 'technician'],
  kits: ['super_admin', 'technician', 'operations'],
  components: ['super_admin', 'technician', 'operations'],
  inventory: ['super_admin', 'operations'],
  orders: ['super_admin', 'operations', 'support'],
  users: ['super_admin', 'support'],
  tickets: ['super_admin', 'support', 'technician'],
  ai_logs: ['super_admin', 'technician'],
  employees: ['super_admin'],
  audit: ['super_admin'],
  finance: ['super_admin', 'operations'],
};

export function can(employee, permission) {
  return !!employee?.active && employee.roles?.some(role => (permissions[permission] || []).includes(role));
}

export function nextPlanStatus(current, next, evidence = {}) {
  const invalid = message => { const error = Error(message); error.status = 400; throw error; };
  if (!planStatuses.includes(next)) invalid('审核状态无效。');
  const allowed = {
    generated: ['pending_review', 'in_review', 'rejected'],
    pending_review: ['in_review', 'needs_changes', 'rejected'],
    in_review: ['needs_changes', 'engineering_approved', 'rejected'],
    needs_changes: ['in_review', 'rejected'],
    engineering_approved: ['pending_physical', 'needs_changes'],
    pending_physical: ['physical_verified', 'needs_changes'],
    physical_verified: ['published', 'needs_changes'],
    published: ['needs_changes'],
    rejected: ['in_review'],
  };
  if (!allowed[current]?.includes(next)) invalid(`不能从“${current}”直接变为“${next}”。`);
  if (next === 'engineering_approved' && !String(evidence.engineeringNote || '').trim()) invalid('工程审核通过前请记录校验结论。');
  if (next === 'physical_verified' && !String(evidence.physicalTest || '').trim()) invalid('实物验证通过前请记录测试结果。');
  return next;
}

export function applyReview(project, review) {
  if (!review) return project;
  const plan = { ...project.plan };
  if (review.name) plan.name = review.name;
  if (review.description) plan.desc = review.description;
  if (review.features_json) plan.features = JSON.parse(review.features_json);
  if (review.bom_json) plan.bom = JSON.parse(review.bom_json);
  plan.status = review.status;
  plan.total = (plan.bom || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  return { ...project, plan, status: review.status, reviewVersion: review.revision, engineeringNote: review.engineering_note, physicalTest: review.physical_test };
}

export function safePage(params) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.get('page') || '1', 10) || 1));
  const pageSize = Math.max(5, Math.min(100, Number.parseInt(params.get('pageSize') || '20', 10) || 20));
  return { page, pageSize };
}

export function paginate(records, params) {
  const { page, pageSize } = safePage(params);
  return { items: records.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: records.length, pages: Math.ceil(records.length / pageSize) || 1 };
}
