import { renderDesignDrawing } from './diagram.js';

const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function renderManualSheet(plan) {
  const parts = (plan.bom || []).slice(0, 6);
  const flow = (plan.principle || []).slice(0, 4);
  const steps = (plan.assemblySteps || []).slice(0, 4);
  return `<section class="manual-sheet" aria-label="概念装配说明书">
    <div class="manual-sheet-heading"><div><span>DESIGN GUIDE / CONCEPT ONLY</span><h2>${safe(plan.name)} · 概念说明书</h2></div><p>结构、原理、零件、步骤一页看懂</p></div>
    <div class="manual-grid">
      <article class="manual-panel manual-main"><h3><b>1</b> 整体结构示意</h3><div class="manual-drawing">${renderDesignDrawing(plan)}</div><p>这张结构图随当前方案的零件与功能生成，展示模块关系；外壳、固定件与走线仍需打样确认。</p></article>
      <article class="manual-panel"><h3><b>2</b> 工作原理</h3><div class="manual-flow">${flow.map((item, index) => `<div><span>${String(index + 1).padStart(2, '0')}</span><strong>${safe(item)}</strong></div>`).join('')}</div></article>
      <article class="manual-panel"><h3><b>3</b> 主要部件与尺寸</h3><div class="manual-parts">${parts.map(part => `<div><strong>${safe(part.name)}</strong><span>${safe(part.model || '型号待核对')}</span><small>${safe(part.dimensionsMm || '尺寸待供应商确认')}</small></div>`).join('')}</div></article>
      <article class="manual-panel"><h3><b>4</b> DIY 组装步骤</h3><ol class="manual-steps">${steps.map(step => `<li>${safe(step)}</li>`).join('')}</ol></article>
    </div><p class="manual-caution">概念说明，不是加工图或接线图。尺寸、引脚、电源及机械结构需以实测和工作人员审核结果为准。</p>
  </section>`;
}
