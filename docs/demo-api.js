// GitHub Pages is a static course preview. Keep navigation on this origin and
// provide clearly labeled, browser-local examples without handling passwords.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const data = nativeFetch('./demo-data.json').then(response => {
    if (!response.ok) throw new Error('演示资料未能加载。');
    return response.json();
  });
  const profile = { authenticated: true, id: 'course-demo-visitor', displayName: '演示访客', mode: 'demo', isStaff: false };
  const projectKey = 'idea-kit-pages-demo-projects';
  const memory = { projects: [] };
  const readProjects = () => {
    try { return JSON.parse(localStorage.getItem(projectKey) || '[]'); }
    catch { return memory.projects; }
  };
  const saveProjects = projects => {
    memory.projects = projects;
    try { localStorage.setItem(projectKey, JSON.stringify(projects)); } catch { /* private browsing */ }
  };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  const noWrites = () => reply({ error: '这是课程演示版；真实账号、付款、订单和作品上传需要独立后端。' }, 403);
  const chooseTemplate = idea => {
    if (/眼镜/.test(idea)) return 'glasses';
    if (/植物|花盆|浇水|土壤/.test(idea)) return 'plant';
    if (/魔法棒|挥动/.test(idea)) return 'wand';
    if (/掌机|游戏/.test(idea)) return 'game';
    if (/小车|移动|跟随/.test(idea)) return 'robot';
    return 'pet';
  };
  window.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    const method = (init.method || (input instanceof Request && input.method) || 'GET').toUpperCase();
    const path = url.pathname.slice(5);
    const body = method === 'POST' && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    const content = await data;
    if (path === 'auth') return reply(profile);
    if (path === 'catalog') return reply(content.catalog);
    if (path === 'health') return reply({ ok: true, mode: 'course-static-demo' });
    if (path === 'pricing') return reply({ unit: '造物币', coinsPerYuan: 10, generationPreview: 5, exampleUnlock: 0, communitySuggestedUnlock: 20, paymentReview: 'demo', coinSpendingEnabled: false });
    if (path === 'events') return reply({ ok: true });
    if (path === 'clarify' && method === 'POST') return reply({ questions: [
      '它最重要的互动效果是什么？', '你希望把它放在哪里、由谁使用？', '有没有必须遵守的预算或外观要求？',
    ] });
    if (path === 'design' && method === 'POST') {
      const idea = String(body.idea || '').trim();
      if (idea.length < 4) return reply({ error: '请先写下你想做的东西。' }, 400);
      const template = body.starter && content.plans[body.starter] ? body.starter : chooseTemplate(idea);
      const base = content.plans[template];
      const budget = Number(body.budget) || 150;
      const projectId = crypto.randomUUID();
      const result = {
        ...base,
        projectId,
        source: 'course-demo',
        status: '课程演示参考方案 · 未调用 AI',
        request: { ...base.request, idea, budget },
        withinBudget: base.total <= budget,
        needsReview: true,
        notes: ['这是预设方案的课程演示，不是 AI 实时生成；实物制作前请核对零件和接线。', ...base.notes],
        assemblySteps: ['核对实际零件型号与供电要求', '断电后搭建低压原型', '逐个测试感知、显示与动作', '记录问题并改进外观'],
      };
      saveProjects([{ id: projectId, ownerId: profile.id, plan: result, step: 0, status: '演示方案', createdAt: new Date().toISOString() }, ...readProjects()].slice(0, 20));
      return reply(result);
    }
    if (path === 'projects' && method === 'GET') return reply({ items: readProjects().map(({ id, plan, step, status, createdAt }) => ({ id, name: plan.name, desc: plan.desc, step, status, createdAt })), truncated: false });
    if (path.startsWith('projects/')) {
      const [, id, action] = path.split('/');
      const projects = readProjects();
      const project = projects.find(item => item.id === id);
      if (!project) return reply({ error: '演示方案不存在。' }, 404);
      if (method === 'GET') return reply(project);
      if (action === 'progress') {
        project.step = Math.max(0, Number(body.step) || 0);
        saveProjects(projects);
        return reply({ ok: true, step: project.step });
      }
      if (action === 'guide') return reply({ reply: '先从当前步骤和实际零件型号开始核对。演示版不提供实时 AI 指导。', actions: ['确认供电已断开', '记录零件型号并逐个测试'], uncertainty: '实际接线与电压仍需核对', needsHuman: false });
      if (action === 'inspect') return reply({ observed: ['演示版未分析上传图片'], possibleIssues: [], unknowns: ['接线和零件型号无法从演示版确认'], nextStep: '请在真实服务中进行图片检查，动手改线前先断电。' });
    }
    if (path === 'works' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const category = url.searchParams.get('category') || '';
      const kind = url.searchParams.get('kind') || 'all';
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const all = kind === 'community' ? [] : content.examples.filter(item =>
        (!category || item.category === category) && (!q || `${item.title} ${item.summary} ${item.description}`.toLowerCase().includes(q))
      );
      const pageSize = 8;
      return reply({ items: all.slice((page - 1) * pageSize, page * pageSize).map(item => ({ ...item, stats: { likes: 0, favorites: 0, unlocks: 0 } })), page, pageSize, total: all.length, pages: Math.max(1, Math.ceil(all.length / pageSize)) });
    }
    if (path.startsWith('works/') && method === 'GET') {
      const work = content.examples.find(item => item.id === path.split('/')[1]);
      return work ? reply({ ...work, stats: { likes: 0, favorites: 0, unlocks: 0 }, engagement: { liked: false, favorited: false, unlocked: true } }) : reply({ error: '作品不存在。' }, 404);
    }
    if (path === 'wallet') return reply({ balance: 0, transactions: [] });
    if (path === 'payments' || path === 'orders' || path === 'support') return method === 'GET' ? reply({ items: [] }) : noWrites();
    if (path.startsWith('local-auth/') || path.startsWith('staff/') || method === 'POST') return noWrites();
    return reply({ error: '这个功能不在课程演示版中。' }, 404);
  };

  function rewriteAssets(root) {
    const nodes = [root, ...(root.querySelectorAll?.('[src], [style]') || [])];
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      const src = node.getAttribute('src');
      if (src?.startsWith('/assets/')) node.setAttribute('src', '.' + src);
      else if (src?.startsWith('/api/works/')) {
        const image = src.match(/^\/api\/works\/official-([a-z]+)\/cover\//);
        if (image) node.setAttribute('src', `./assets/market-${image[1]}.png`);
      }
      const style = node.getAttribute('style');
      if (style?.includes('/assets/')) {
        const relative = style.replace(/(['"(])\/assets\//g, '$1./assets/');
        if (relative !== style) node.setAttribute('style', relative);
      }
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('aside');
    badge.id = 'course-demo-badge';
    badge.textContent = '课程演示版 · 示例方案保存在本浏览器，账号与付款功能未连接';
    document.body.append(badge);
    const style = document.createElement('style');
    style.textContent = '#course-demo-badge{position:fixed;right:16px;bottom:16px;z-index:9999;max-width:min(360px,calc(100vw - 32px));padding:10px 14px;border-radius:12px;background:#29242a;color:#fff;font:500 14px/1.5 system-ui,sans-serif;box-shadow:0 8px 28px #0003}';
    document.head.append(style);
    rewriteAssets(document.body);
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') rewriteAssets(mutation.target);
        else for (const node of mutation.addedNodes) rewriteAssets(node);
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
  });
})();

