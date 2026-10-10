'use client';

import { useCallback, useEffect, useState } from 'react';

type RecordData = Record<string, any>;
type Me = { email: string; roles: string[]; permissions: Record<string, boolean> };
const sections = [
  { id: 'overview', label: '运营总览', group: '业务' },
  { id: 'plans', label: 'AI 方案审核', group: '业务' },
  { id: 'kits', label: '商品与项目', group: '业务' },
  { id: 'components', label: '零件与库存', group: '业务' },
  { id: 'orders', label: '订单管理', group: '业务' },
  { id: 'users', label: '用户管理', group: '服务' },
  { id: 'tickets', label: '售后工单', group: '服务' },
  { id: 'ai-logs', label: 'AI 调用日志', group: '系统', permission: 'ai_logs' },
  { id: 'payments', label: '付款核对', group: '系统', permission: 'finance' },
  { id: 'employees', label: '员工权限', group: '系统' },
  { id: 'audit', label: '操作记录', group: '系统' },
];
const statusNames: Record<string,string> = {
  generated:'AI 已生成',pending_review:'待工程审核',in_review:'审核中',needs_changes:'需要修改',engineering_approved:'工程审核通过',pending_physical:'待实物验证',physical_verified:'实物验证通过',published:'已发布',rejected:'已驳回',
  open:'待处理',in_progress:'处理中',waiting_user:'等待用户',resolved:'已解决',closed:'已关闭',reviewing:'审核中',packing:'配货中',shipped:'已发货',submitted:'待核对',confirmed:'已人工确认到账',awaiting_transfer:'待转账',active:'已上架',draft:'草稿',
};
const filterStatuses: Record<string,string[]> = {
  plans:['generated','pending_review','in_review','needs_changes','engineering_approved','pending_physical','physical_verified','published','rejected'],
  tickets:['open','in_progress','waiting_user','resolved','closed'],
  orders:['pending_review','reviewing','needs_changes','packing','shipped','closed'],
  kits:['draft','active'],
};
const shown = (value: any) => value === null || value === undefined || value === '' ? '—' : String(value);
const date = (value: any) => value ? new Date(value).toLocaleString('zh-CN') : '—';
const money = (fen: any) => `¥${(Number(fen || 0) / 100).toFixed(2)}`;
const status = (value: any) => <span className={`admin-status admin-status-${value}`}>{statusNames[String(value)] || shown(value)}</span>;

async function api(path: string, body?: RecordData): Promise<any> {
  const response = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data: any = await response.json();
  if (!response.ok) throw Error(data.error || '请求失败，请稍后重试。');
  return data;
}

export default function AdminConsole() {
  const [me, setMe] = useState<Me | null>(null);
  const [section, setSection] = useState('overview');
  const [data, setData] = useState<RecordData | null>(null);
  const [selected, setSelected] = useState<RecordData | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<RecordData>({});

  const refresh = useCallback(async () => {
    if (!me || !me.permissions[section === 'ai-logs' ? 'ai_logs' : section === 'payments' ? 'finance' : section]) return;
    setLoading(true); setError('');
    try { const params = new URLSearchParams({ page: String(page), pageSize: '20', q: query, ...(filter ? { status: filter } : {}), ...(section === 'overview' ? { days: String(days) } : {}) }); setData(await api(`${section}?${params}`)); }
    catch (cause: any) { setError(cause.message); setData(null); }
    finally { setLoading(false); }
  }, [me, section, page, query, filter, days]);

  useEffect(() => { api('me').then(setMe).catch((cause: any) => setError(cause.message)); }, []);
  useEffect(() => { if (me) refresh(); }, [me, refresh]);
  useEffect(() => { setSelected(null); setSelectedId(''); setPage(1); setQuery(''); setFilter(''); setMenuOpen(false); }, [section]);

  async function openDetail(id: string) {
    setSelectedId(id); setDetailLoading(true); setError('');
    try { const item = ['ai-logs','audit'].includes(section) ? (data?.items || [])[Number(id)] : ['payments','employees'].includes(section) ? (data?.items || []).find((row:RecordData) => String(row.id || row.email) === id) : await api(`${section}/${encodeURIComponent(id)}`); if (!item) throw Error('记录不存在，请刷新列表。'); setSelected(item); setDraft(item); }
    catch (cause: any) { setError(cause.message); setSelected(null); }
    finally { setDetailLoading(false); }
  }
  async function perform(path: string, payload: RecordData, done = '已保存。') {
    setWorking(true); setError(''); setMessage('');
    try { await api(path, payload); setMessage(done); await refresh(); if (selectedId === 'new') { setSelectedId(''); setSelected(null); } else if (selectedId) await openDetail(selectedId); }
    catch (cause: any) { setError(cause.message); }
    finally { setWorking(false); }
  }
  const allowedSections = sections.filter(item => me?.permissions[item.permission || item.id]);

  return <div className="admin-app">
    <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="admin-brand"><span className="admin-symbol">✳</span><div><strong>造物所</strong><small>MAKER CONSOLE</small></div></div>
      <div className="admin-nav">{['业务','服务','系统'].map(group => <div key={group}><p className="admin-nav-group">{group}</p>{allowedSections.filter(item => item.group === group).map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>{item.label}<span>↗</span></button>)}</div>)}</div>
      <div className="admin-sidebar-bottom"><small>当前员工</small><strong>{me?.email || '正在验证…'}</strong><a href="/signout-with-chatgpt?return_to=%2F">安全退出 ↗</a></div>
    </aside>
    <div className="admin-main">
      <header className="admin-top"><button className="admin-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="切换导航">☰</button><div><span>造物所 /</span> {sections.find(item => item.id === section)?.label}</div><div className="admin-top-right"><span>内部工作台</span><a href="/index.html" target="_blank" rel="noreferrer">查看网站 ↗</a></div></header>
      <main className="admin-content">
        <div className="admin-heading"><div><p className="admin-kicker">MAKER CONSOLE / {section.toUpperCase()}</p><h1>{sections.find(item => item.id === section)?.label}</h1><p>{section === 'overview' ? '业务进度与待办，均来自实际记录。' : section === 'plans' ? 'AI 建议、工程审核和实物验证分别记录。' : section === 'components' ? '物料价格、库存和变动流水。' : section === 'ai-logs' ? '模型调用与费用估算；实际账单以百炼为准。' : '查看和处理真实业务数据。'}</p></div><div className="admin-heading-actions"><button onClick={refresh} disabled={loading}>刷新</button>{section === 'components' && <button className="primary" onClick={() => { setSelectedId('new'); setSelected({}); setDraft({ sku:'',name:'',model:'',category:'',cost_fen:0,price_fen:0,minimum_stock:0 }); }}>新增零件</button>}{section === 'kits' && <button className="primary" onClick={() => { setSelectedId('new'); setSelected({}); setDraft({name:'',description:'',price_fen:0,bom:[],status:'draft'}); }}>新增 Kit</button>}{section === 'employees' && <button className="primary" onClick={() => { setSelectedId('new'); setSelected({}); setDraft({email:'',roles:['support'],active:true}); }}>新增员工</button>}</div></div>
        {error && <div className="admin-alert" role="alert">{error}</div>}{message && <div className="admin-success" role="status">{message}</div>}
        {!me ? <div className="admin-empty">正在验证员工身份…</div> : !me.permissions[section === 'ai-logs' ? 'ai_logs' : section === 'payments' ? 'finance' : section] ? <div className="admin-empty">当前角色没有访问此模块的权限。</div> : loading && !data ? <div className="admin-empty">正在读取业务数据…</div> : <>
          {section === 'overview' && data && <><div className="admin-range">{[1,7,30].map(n => <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>{n === 1 ? '今日' : `近 ${n} 天`}</button>)}</div><div className="admin-metrics">{[
            ['订单数',data.metrics.orders],['人工确认销售额',money(data.metrics.confirmedSalesFen)],['待处理订单',data.metrics.pendingOrders],['待审核方案',data.metrics.pendingPlans],['未结工单',data.metrics.openTickets],['库存预警',data.metrics.lowStock],['AI 调用',data.metrics.aiCalls],['AI 费用估算',`¥${data.metrics.estimatedAiCostCny}`],['项目最终步骤',`${data.metrics.completedProjects} / ${data.metrics.totalProjects}`],
          ].map(([label,value]) => <div className="admin-metric" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div><h2 className="admin-subtitle">待办事项</h2><div className="admin-todos">{(['plans','orders','tickets','components'] as const).map(key => <div key={key}><h3>{sections.find(item => item.id === key)?.label}</h3>{data!.todos[key]?.length ? data!.todos[key].map((item: RecordData) => <button key={item.id} onClick={() => { setSection(key); api(`${key}/${item.id}`).then(detail => { setSelectedId(item.id); setSelected(detail); setDraft(detail); }).catch(cause => setError(cause.message)); }}>{item.name}<span>↗</span></button>) : <p>目前没有待办</p>}</div>)}</div>{data.truncated && <p className="admin-hint">记录较多，此视图仅展示前 5000 条；进一步分析需接入聚合表。</p>}</>}
          {section !== 'overview' && <><div className="admin-tools"><input aria-label="搜索" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="搜索编号、名称或关键词" />{filterStatuses[section] && <select aria-label="按状态筛选" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="">全部状态</option>{filterStatuses[section].map(key => <option key={key} value={key}>{statusNames[key]}</option>)}</select>}<span>{data?.total ?? data?.items?.length ?? 0} 条记录</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns(section).map(column => <th key={column.key}>{column.label}</th>)}<th>操作</th></tr></thead><tbody>{(data?.items || []).map((item: RecordData, index: number) => <tr key={item.id || item.sku || item.email || index}>{columns(section).map(column => <td key={column.key}>{renderCell(item,column.key)}</td>)}<td><button className="admin-link" onClick={() => openDetail(String(item.id || item.sku || item.email || index))}>{['ai-logs','audit','employees','payments'].includes(section) ? '查看' : '查看 / 处理'} →</button></td></tr>)}</tbody></table>{!data?.items?.length && <div className="admin-empty">还没有记录。{section === 'tickets' ? '用户提交人工支持后会出现在这里。' : ''}</div>}</div>{data?.pages > 1 && <div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} / {data!.pages} 页</span><button disabled={page >= data!.pages} onClick={() => setPage(page + 1)}>下一页</button></div>}{data?.truncated && <p className="admin-hint">当前列表达到 5000 条读取上限。</p>}</>}
        </>}
      </main>
    </div>
    {selectedId && <div className="admin-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setSelectedId(''); setSelected(null); } }}><div className="admin-drawer" role="dialog" aria-modal="true" aria-label="记录详情"><div className="admin-drawer-top"><div><small>{sections.find(item => item.id === section)?.label}</small><h2>{selectedId === 'new' ? `新增${sections.find(item => item.id === section)?.label}` : selected?.name || selected?.title || selected?.description?.slice(0,30) || selected?.sku || selected?.email || selectedId}</h2></div><button onClick={() => { setSelectedId(''); setSelected(null); }} aria-label="关闭">×</button></div>{detailLoading ? <div className="admin-empty">正在读取详情…</div> : selected && <div className="admin-drawer-body">{detail(section,selected,draft,setDraft,working,perform,me)}</div>}</div></div>}
  </div>;
}

function columns(section: string) {
  const map: Record<string,{key:string,label:string}[]> = {
    plans:[{key:'name',label:'项目'},{key:'idea',label:'原始创意'},{key:'status',label:'审核状态'},{key:'createdAt',label:'生成时间'}],
    kits:[{key:'name',label:'Kit'},{key:'price_fen',label:'售价'},{key:'verification_status',label:'验证'},{key:'status',label:'上架状态'}],
    components:[{key:'sku',label:'SKU'},{key:'name',label:'零件'},{key:'stock',label:'库存'},{key:'available',label:'可用'},{key:'price_fen',label:'售价'}],
    orders:[{key:'id',label:'订单编号'},{key:'title',label:'项目'},{key:'status',label:'状态'},{key:'quoteCny',label:'报价'},{key:'createdAt',label:'提交时间'}],
    users:[{key:'id',label:'用户 ID'},{key:'email',label:'邮箱'},{key:'projectCount',label:'方案'},{key:'orderCount',label:'订单'}],
    tickets:[{key:'id',label:'工单编号'},{key:'description',label:'问题'},{key:'priority',label:'优先级'},{key:'status',label:'状态'},{key:'created_at',label:'提交时间'}],
    'ai-logs':[{key:'at',label:'时间'},{key:'task',label:'任务'},{key:'model',label:'模型'},{key:'ownerHash',label:'用户标识'},{key:'projectId',label:'项目 ID'},{key:'estimatedCostCny',label:'费用估算'}],
    payments:[{key:'id',label:'付款编号'},{key:'kind',label:'类型'},{key:'amountFen',label:'金额'},{key:'status',label:'状态'},{key:'createdAt',label:'提交时间'}],
    employees:[{key:'email',label:'员工邮箱'},{key:'roles',label:'角色'},{key:'active',label:'状态'}],
    audit:[{key:'created_at',label:'时间'},{key:'actor_email',label:'员工'},{key:'action',label:'操作'},{key:'subject_type',label:'对象'},{key:'subject_id',label:'编号'}],
  }; return map[section] || [];
}
function renderCell(item: RecordData, key: string) {
  const value = item[key];
  if (['status','verification_status'].includes(key)) return status(value);
  if (['createdAt','created_at','at'].includes(key)) return date(value);
  if (['price_fen','cost_fen','amountFen'].includes(key)) return money(value);
  if (key === 'quoteCny') return value ? `¥${value}` : '未报价';
  if (key === 'estimatedCostCny') return value === null ? '未获取用量' : `¥${value}`;
  if (key === 'active') return value ? '启用' : '停用';
  if (key === 'roles') return Array.isArray(value) ? value.join('、') : '';
  return <span title={shown(value)}>{shown(value).slice(0,80)}</span>;
}

function Field({label,value,onChange,type='text',rows=0,help}:{label:string;value:any;onChange:(value:string)=>void;type?:string;rows?:number;help?:string}) { return <label className="admin-field"><span>{label}</span>{rows ? <textarea rows={rows} value={value ?? ''} onChange={event => onChange(event.target.value)} /> : <input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} />}{help && <small>{help}</small>}</label>; }
const patch = (setDraft:(value:RecordData)=>void,draft:RecordData,key:string) => (value:string) => setDraft({...draft,[key]:value});
function DetailGrid({items}:{items:[string,any][]}) { return <dl className="admin-detail-grid">{items.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{shown(value)}</dd></div>)}</dl>; }

function detail(section:string,item:RecordData,draft:RecordData,setDraft:(value:RecordData)=>void,working:boolean,perform:(path:string,payload:RecordData,done?:string)=>void,me:Me|null) {
  if (section === 'plans') { const plan = item.plan || {}; const bomText = draft.bomText ?? JSON.stringify(plan.bom || [],null,2); const featuresText = draft.featuresText ?? (plan.features || []).join('\n'); return <><DetailGrid items={[["方案 ID",item.id],["用户 ID",item.ownerId],["用户原始想法",plan.request?.idea],["预算",`¥${plan.request?.budget ?? 0}`],["零件估算",`¥${plan.total ?? 0}`],["当前状态",statusNames[item.status] || item.status],["创建时间",date(item.createdAt)],["审核版本",item.reviewVersion || 0]]}/><h3>工程审核</h3><p className="admin-hint">AI 生成、工程审核与实物验证是独立阶段。每次保存都需要填写原因。</p><Field label="项目名称" value={draft.name ?? plan.name} onChange={patch(setDraft,draft,'name')}/><Field label="介绍" value={draft.description ?? plan.desc} onChange={patch(setDraft,draft,'description')} rows={3}/><Field label="功能（每行一项）" value={featuresText} onChange={patch(setDraft,draft,'featuresText')} rows={4}/><Field label="BOM JSON（含 id、name、model、price、quantity）" value={bomText} onChange={patch(setDraft,draft,'bomText')} rows={8}/><Field label="工程校验结论" value={draft.engineeringNote ?? item.engineeringNote ?? ''} onChange={patch(setDraft,draft,'engineeringNote')} rows={3}/><Field label="实物测试记录" value={draft.physicalTest ?? item.physicalTest ?? ''} onChange={patch(setDraft,draft,'physicalTest')} rows={3}/><label className="admin-field"><span>审核状态</span><select value={draft.reviewStatus ?? item.status} onChange={event => setDraft({...draft,reviewStatus:event.target.value})}>{['generated','pending_review','in_review','needs_changes','engineering_approved','pending_physical','physical_verified','published','rejected'].map(value => <option key={value} value={value}>{statusNames[value]}</option>)}</select></label><Field label="修改 / 审核原因（必填）" value={draft.reason ?? ''} onChange={patch(setDraft,draft,'reason')} rows={2}/><button className="admin-save" disabled={working} onClick={() => { let bom; try { bom = JSON.parse(bomText); } catch { alert('BOM JSON 格式不正确。'); return; } perform(`plans/${item.id}/review`,{name:draft.name ?? plan.name,description:draft.description ?? plan.desc,features:featuresText.split('\n').map((x:string)=>x.trim()).filter(Boolean),bom,engineeringNote:draft.engineeringNote ?? item.engineeringNote ?? '',physicalTest:draft.physicalTest ?? item.physicalTest ?? '',status:draft.reviewStatus === item.status ? undefined : draft.reviewStatus,reason:draft.reason}); }}>{working?'保存中…':'保存审核记录'}</button></>; }
  if (section === 'components') return <><DetailGrid items={[["SKU",item.sku],["当前库存",item.stock],["可用库存",item.available],["已预留",item.reserved],["版本",item.revision]]}/><h3>零件资料</h3><Field label="SKU" value={draft.sku ?? ''} onChange={patch(setDraft,draft,'sku')}/><Field label="名称" value={draft.name ?? ''} onChange={patch(setDraft,draft,'name')}/><Field label="型号" value={draft.model ?? ''} onChange={patch(setDraft,draft,'model')}/><Field label="分类" value={draft.category ?? ''} onChange={patch(setDraft,draft,'category')}/><Field label="采购成本（分）" type="number" value={draft.cost_fen ?? 0} onChange={patch(setDraft,draft,'cost_fen')}/><Field label="销售价格（分）" type="number" value={draft.price_fen ?? 0} onChange={patch(setDraft,draft,'price_fen')}/><Field label="最低库存" type="number" value={draft.minimum_stock ?? 0} onChange={patch(setDraft,draft,'minimum_stock')}/><Field label="供应商" value={draft.supplier ?? ''} onChange={patch(setDraft,draft,'supplier')}/><Field label="说明" value={draft.description ?? ''} onChange={patch(setDraft,draft,'description')} rows={3}/><button className="admin-save" disabled={working} onClick={() => perform('components',{sku:draft.sku,name:draft.name,model:draft.model,category:draft.category,costFen:Number(draft.cost_fen),priceFen:Number(draft.price_fen),minimumStock:Number(draft.minimum_stock),supplier:draft.supplier,description:draft.description,verified:!!draft.verified,specs:draft.specs || {}})}>保存零件</button>{item.sku && me?.permissions.inventory && <><h3>库存变动</h3><p className="admin-hint">入库用正数，出库用负数；每次调整都会留下流水。</p><Field label="变动数量" type="number" value={draft.delta ?? ''} onChange={patch(setDraft,draft,'delta')}/><Field label="原因" value={draft.stockReason ?? ''} onChange={patch(setDraft,draft,'stockReason')}/><button disabled={working} onClick={() => perform(`components/${item.sku}/stock`,{delta:Number(draft.delta),reason:draft.stockReason},'库存与流水已更新。')}>提交库存变动</button></>}</>;
  if (section === 'kits') return <><DetailGrid items={[["Kit ID",item.id],["版本",item.revision],["当前状态",statusNames[item.status]||'草稿'],["当前 BOM 采购成本",money(item.bomCostFen)]]}/><Field label="Kit 名称" value={draft.name ?? ''} onChange={patch(setDraft,draft,'name')}/><Field label="介绍" value={draft.description ?? ''} onChange={patch(setDraft,draft,'description')} rows={3}/><Field label="售价（分）" type="number" value={draft.price_fen ?? 0} onChange={patch(setDraft,draft,'price_fen')}/><Field label="难度" value={draft.difficulty ?? ''} onChange={patch(setDraft,draft,'difficulty')}/><Field label="制作时间" value={draft.build_time ?? ''} onChange={patch(setDraft,draft,'build_time')}/><Field label="关联方案 ID（可选）" value={draft.project_id ?? ''} onChange={patch(setDraft,draft,'project_id')}/><Field label="BOM JSON（[{sku,quantity}]）" value={draft.bomText ?? JSON.stringify(item.bom||[],null,2)} onChange={patch(setDraft,draft,'bomText')} rows={5}/><Field label="教程" value={draft.instructions ?? ''} onChange={patch(setDraft,draft,'instructions')} rows={5}/><label className="admin-field"><span>验证状态</span><select value={draft.verification_status||'unverified'} onChange={event=>setDraft({...draft,verification_status:event.target.value})}><option value="unverified">未验证</option><option value="engineering_approved">工程审核通过</option><option value="physical_verified">实物验证通过</option></select></label><label className="admin-field"><span>上架状态</span><select value={draft.status||'draft'} onChange={event=>setDraft({...draft,status:event.target.value})}><option value="draft">草稿</option><option value="active">上架</option></select></label><button className="admin-save" disabled={working} onClick={()=>{let bom;try{bom=JSON.parse(draft.bomText ?? JSON.stringify(item.bom||[]));}catch{alert('BOM JSON 格式不正确。');return;}perform('kits',{id:item.id,name:draft.name,description:draft.description,priceFen:Number(draft.price_fen),difficulty:draft.difficulty,buildTime:draft.build_time,projectId:draft.project_id,bom,instructions:draft.instructions,verificationStatus:draft.verification_status,status:draft.status});}}>保存 Kit</button></>;
  if (section === 'orders') return <><DetailGrid items={[["订单 ID",item.id],["用户 ID",item.ownerId],["项目",item.title],["原始想法",item.idea],["零件估算",`¥${item.estimateCny}`],["报价",item.quoteCny ? `¥${item.quoteCny}` : '未报价'],["当前状态",statusNames[item.status]||item.status],["收货 / 联系信息",item.contact],["创建时间",date(item.createdAt)]]}/><h3>订单零件快照</h3><ul>{(item.bom||[]).map((part:RecordData,index:number)=><li key={index}>{part.name} · {part.model||'待确认'} × {part.quantity} · ¥{part.price}</li>)}</ul><h3>报价</h3><p className="admin-hint">报价由员工核对后填写；已有付款申请时无法改价。</p><Field label="确认报价（元）" type="number" value={draft.nextQuote ?? item.quoteCny ?? ''} onChange={patch(setDraft,draft,'nextQuote')}/><button disabled={working} onClick={()=>perform(`orders/${item.id}/quote`,{quoteCny:Number(draft.nextQuote ?? item.quoteCny)})}>保存报价</button><h3>付款记录</h3>{item.payments?.length ? item.payments.map((payment:RecordData)=><p key={payment.id}>{money(payment.amount_fen)} · {status(payment.status)} · {date(payment.created_at)}</p>) : <p className="admin-hint">尚无付款申请。报价不代表付款成功。</p>}<label className="admin-field"><span>订单状态</span><select value={draft.nextStatus ?? item.status} onChange={event=>setDraft({...draft,nextStatus:event.target.value})}>{['pending_review','reviewing','needs_changes','closed','packing','shipped'].map(key=><option key={key} value={key}>{statusNames[key]||key}</option>)}</select></label><Field label="物流单号（发货时必填）" value={draft.trackingNumber ?? item.trackingNumber ?? ''} onChange={patch(setDraft,draft,'trackingNumber')}/><button className="admin-save" disabled={working} onClick={()=>perform(`orders/${item.id}/status`,{status:draft.nextStatus??item.status,trackingNumber:draft.trackingNumber??item.trackingNumber})}>保存订单状态</button></>;
  if (section === 'tickets') return <><DetailGrid items={[["工单 ID",item.id],["用户 ID",item.owner_id],["关联项目",item.project_id],["项目名称",item.projectSummary?.name],["项目当前步骤",item.projectSummary?.step === undefined ? null : item.projectSummary.step + 1],["关联订单",item.order_id],["制作步骤",item.step],["问题描述",item.description],["状态",statusNames[item.status]||item.status],["优先级",item.priority]]}/><label className="admin-field"><span>状态</span><select value={draft.status||item.status} onChange={event=>setDraft({...draft,status:event.target.value})}>{['open','in_progress','waiting_user','resolved','closed'].map(key=><option key={key} value={key}>{statusNames[key]}</option>)}</select></label><label className="admin-field"><span>优先级</span><select value={draft.priority||item.priority} onChange={event=>setDraft({...draft,priority:event.target.value})}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label><Field label="对用户的回复" value={draft.public_reply ?? ''} onChange={patch(setDraft,draft,'public_reply')} rows={4}/><Field label="内部备注（用户不可见）" value={draft.internal_note ?? ''} onChange={patch(setDraft,draft,'internal_note')} rows={4}/><Field label="负责人邮箱" value={draft.assignee ?? ''} onChange={patch(setDraft,draft,'assignee')}/><button className="admin-save" disabled={working} onClick={()=>perform(`tickets/${item.id}/update`,{status:draft.status,priority:draft.priority,publicReply:draft.public_reply,internalNote:draft.internal_note,assignee:draft.assignee})}>保存工单</button></>;
  if (section === 'users') return <><DetailGrid items={[["用户 ID",item.id],["邮箱",item.email],["注册 / 首次记录",date(item.createdAt)],["方案数",item.projectCount],["订单数",item.orderCount]]}/><h3>用户项目</h3>{item.projects?.length ? item.projects.map((row:RecordData)=><p key={row.id}>{row.name} · {statusNames[row.status]||row.status} · 步骤 {row.step+1}</p>) : <p className="admin-hint">暂无项目</p>}<h3>订单</h3>{item.orders?.length ? item.orders.map((row:RecordData)=><p key={row.id}>{row.title} · {statusNames[row.status]||row.status}</p>) : <p className="admin-hint">暂无订单</p>}</>;
  if (section === 'payments') return <><DetailGrid items={[["付款编号",item.id],["用户 ID",item.ownerId],["类型",item.kind],["金额",money(item.amountFen)],["状态",statusNames[item.status]||item.status],["交易参考号",item.transactionRef],["提交时间",date(item.submittedAt)]]}/>{item.status === 'submitted' && <><Field label="人工核对备注" value={draft.note??''} onChange={patch(setDraft,draft,'note')}/><div className="admin-form-actions"><button disabled={working} onClick={()=>perform(`payments/${item.id}/review`,{action:'confirm',note:draft.note},'已人工核对到账。')}>确认到账</button><button disabled={working} onClick={()=>perform(`payments/${item.id}/review`,{action:'reject',note:draft.note},'已驳回付款记录。')}>驳回</button></div></>}</>;
  if (section === 'employees') return <><DetailGrid items={[["员工邮箱",item.email],["当前角色",item.roles?.join('、')],["状态",item.active?'启用':'停用']]}/><p className="admin-hint">员工使用同邮箱 ChatGPT 账号登录；首次登录会绑定账号 ID。</p><Field label="员工邮箱" value={draft.email??''} onChange={patch(setDraft,draft,'email')}/><div className="admin-checks">{['super_admin','technician','operations','support'].map(role=><label key={role}><input type="checkbox" checked={(draft.roles||[]).includes(role)} onChange={event=>setDraft({...draft,roles:event.target.checked?[...(draft.roles||[]),role]:(draft.roles||[]).filter((x:string)=>x!==role)})}/>{({super_admin:'超级管理员',technician:'技术人员',operations:'运营人员',support:'客服人员'} as Record<string,string>)[role]}</label>)}</div><label className="admin-checks"><input type="checkbox" checked={!!draft.active} onChange={event=>setDraft({...draft,active:event.target.checked})}/>账号启用</label><button className="admin-save" disabled={working} onClick={()=>perform('employees',{email:draft.email,roles:draft.roles,active:!!draft.active})}>保存员工权限</button></>;
  return <pre className="admin-json">{JSON.stringify(item,null,2)}</pre>;
}
