import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { adminRequest, customerTicket } from '../lib/admin-service.mjs';
import { applyReview, can, nextPlanStatus } from '../lib/admin-core.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0000_mean_salo.sql','0001_maker_console.sql']) sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  const prepare = (sql, values = []) => ({ bind(...args) { return prepare(sql,args); }, first() { return sqlite.prepare(sql).get(...values)||null; }, all() { return { results: sqlite.prepare(sql).all(...values) }; }, run() { return sqlite.prepare(sql).run(...values); } });
  const DB = { prepare, batch(items) { sqlite.exec('BEGIN'); try { const result=items.map(item=>item.run()); sqlite.exec('COMMIT'); return result; } catch(error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const objects = new Map();
  const BUCKET = {
    list: async ({prefix,limit=1000}) => ({ objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false }),
    get: async key => objects.has(key) ? { etag: String(objects.get(key).revision), json: async()=>structuredClone(objects.get(key).value) } : null,
    put: async (key,value,options) => { const old=objects.get(key); if(options?.onlyIf?.etagMatches && options.onlyIf.etagMatches!==String(old?.revision)) return null; objects.set(key,{ value: JSON.parse(value), revision:(old?.revision||0)+1 }); return {key}; },
  };
  return { env:{DB,BUCKET,ADMIN_EMAIL:'boss@example.com'},sqlite,objects };
}
const projectId='11111111-1111-4111-8111-111111111111';
const orderId='22222222-2222-4222-8222-222222222222';
function request(path, {email='boss@example.com',id='staff-1',body}={}) {
  const headers = new Headers({ 'oai-authenticated-user-id':id,'oai-authenticated-user-email':email });
  if(body) {headers.set('content-type','application/json');headers.set('origin','https://example.test');}
  return new Request(`https://example.test/api/${path}`,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
}
async function call(f,path,options) { const response=await adminRequest(f.env,request(`admin/${path}`,options),path.split('/')); return {status:response.status,data:await response.json()}; }

test('only authorized roles can read and change admin data',async()=>{
  const f=fixture();
  assert.equal((await call(f,'me',{email:'stranger@example.com'})).status,403);
  f.sqlite.prepare("INSERT INTO employees VALUES (?,?,?,?,?,?)").run('helper@example.com',null,'["support"]',1,'2026-01-01','2026-01-01');
  const me=await call(f,'me',{email:'helper@example.com',id:'helper-id'});
  assert.equal(me.data.permissions.tickets,true);
  assert.equal(me.data.permissions.plans,false);
  assert.equal((await call(f,'plans',{email:'helper@example.com',id:'helper-id'})).status,403);
  assert.equal((await call(f,'plans',{email:'helper@example.com',id:'other-id'})).status,403);
  assert.equal(can({active:true,roles:['operations']},'inventory'),true);
  assert.throws(()=>nextPlanStatus('generated','physical_verified'),/不能/);
});

test('plan review persists and is visible through the customer overlay',async()=>{
  const f=fixture();
  await f.env.BUCKET.put(`ai-projects/hash/${projectId}.json`,JSON.stringify({id:projectId,ownerId:'maker-1',createdAt:'2026-10-01',plan:{name:'桌宠',desc:'原始描述',features:['表情'],bom:[{id:'c3',name:'主控',price:26,quantity:1}],request:{idea:'做一只桌宠',budget:150}}}));
  const listed=await call(f,'plans'); assert.equal(listed.data.items[0].status,'generated');
  const saved=await call(f,`plans/${projectId}/review`,{body:{name:'桌面伙伴',description:'修改后的说明',features:['触摸互动'],bom:[{id:'c3',name:'主控',model:'ESP32-C3',price:30,quantity:1}],status:'pending_review',reason:'确认需求与零件清单'}});
  assert.equal(saved.status,200);
  const detail=await call(f,`plans/${projectId}`); assert.equal(detail.data.plan.name,'桌面伙伴'); assert.equal(detail.data.plan.total,30);
  const row=f.sqlite.prepare('SELECT * FROM plan_reviews WHERE project_id=?').get(projectId);
  assert.equal(applyReview({plan:{name:'旧名称',bom:[]}},row).plan.name,'桌面伙伴');
  assert.equal(f.sqlite.prepare('SELECT count(*) as n FROM admin_audit WHERE subject_id=?').get(projectId).n>=1,true);
  const forbidden=await call(f,`plans/${projectId}/review`,{body:{status:'published',reason:'直接发布'}});
  assert.equal(forbidden.status,400);
});

test('stock movements and kit BOM cost use real component prices',async()=>{
  const f=fixture();
  await call(f,'components',{body:{sku:'ESP32-C3',name:'主控',costFen:1800,priceFen:2600,minimumStock:2}});
  const changed=await call(f,'components/ESP32-C3/stock',{body:{delta:10,reason:'第一批采购入库'}});
  assert.equal(changed.data.stock,10);
  assert.equal(f.sqlite.prepare('SELECT delta,balance_after FROM inventory_movements').get().balance_after,10);
  assert.equal((await call(f,'components/ESP32-C3/stock',{body:{delta:-11,reason:'测试出库申请'}})).status,409);
  await call(f,'kits',{body:{name:'桌宠 Kit',description:'桌面互动硬件套件',priceFen:5900,bom:[{sku:'ESP32-C3',quantity:2}],status:'draft'}});
  assert.equal((await call(f,'kits')).data.items[0].bomCostFen,3600);
  await call(f,'components',{body:{sku:'ESP32-C3',name:'主控',costFen:2000,priceFen:2600,minimumStock:2}});
  assert.equal((await call(f,'kits')).data.items[0].bomCostFen,4000);
});

test('unpaid order cannot ship; quote and customer ticket are durable',async()=>{
  const f=fixture();
  await f.env.BUCKET.put(`orders/${orderId}.json`,JSON.stringify({id:orderId,ownerId:'maker-1',title:'桌宠',status:'pending_review',createdAt:'2026-10-01',estimateCny:60,bom:[{name:'主控',price:26,quantity:1}]}));
  const quoted=await call(f,`orders/${orderId}/quote`,{body:{quoteCny:79}});assert.equal(quoted.data.quoteCny,79);
  assert.equal((await call(f,`orders/${orderId}/status`,{body:{status:'shipped',trackingNumber:'TRACK12345'}})).status,400);
  const order=(await call(f,`orders/${orderId}`)).data;assert.equal(order.bom[0].price,26);
  const ticketResponse=await customerTicket(f.env,request('support',{email:'maker@example.com',id:'maker-1',body:{projectId:null,description:'OLED 不亮，已经检查 USB 电源和数据线'}}),[]);
  assert.equal(ticketResponse.status,201);
  const ticketId=(await ticketResponse.json()).id;
  const updated=await call(f,`tickets/${ticketId}/update`,{body:{status:'in_progress',publicReply:'请先断电并检查模块型号。',priority:'normal'}});
  assert.equal(updated.data.status,'in_progress');
  const customer=await customerTicket(f.env,request('support',{email:'maker@example.com',id:'maker-1'}),[]);
  assert.equal((await customer.json()).items[0].public_reply,'请先断电并检查模块型号。');
});

test('AI usage retains a searchable owner link, and invalid support input returns a readable error',async()=>{
  const f=fixture();
  await f.env.BUCKET.put('ai-model-usage/owner-hash/2026-10-01/log.json',JSON.stringify({at:'2026-10-01T10:00:00Z',task:'guide',model:'qwen-plus',projectId,estimatedCostCny:0.01}));
  const logs=await adminRequest(f.env,request('admin/ai-logs?q=owner-hash'),['ai-logs']);
  assert.equal((await logs.json()).items[0].ownerHash,'owner-hash');
  const failed=await customerTicket(f.env,request('support',{email:'maker@example.com',id:'maker-1',body:{description:'短'}}),[]);
  assert.equal(failed.status,400);
  assert.match((await failed.json()).error,/问题描述/);
});

test('table sorting happens before pagination',async()=>{
  const f=fixture();
  for (const [sku,name] of [['PART-A','甲零件'],['PART-B','乙零件']]) await call(f,'components',{body:{sku,name,costFen:100,priceFen:200}});
  const result=await adminRequest(f.env,request('admin/components?sort=sku&direction=desc&pageSize=1'),['components']);
  const data=await result.json();
  assert.equal(data.items[0].sku,'PART-B');
  assert.equal(data.total,2);
});
