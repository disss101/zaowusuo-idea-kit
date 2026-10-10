import { modelFor } from './component-models.mjs';

export const parts = {
  c3: { name: 'ESP32-C3 主控', price: 26, purpose: '运行你的互动逻辑', group: '控制' },
  s3: { name: 'ESP32-S3 主控', price: 48, purpose: '处理显示与图像', group: '控制' },
  oled: { name: '0.96″ OLED 屏幕', price: 18, purpose: '显示表情或状态', group: '显示' },
  touch: { name: '电容触摸模块', price: 6, purpose: '感知你的触摸', group: '感知' },
  buzzer: { name: '蜂鸣器模块', price: 5, purpose: '播放提示音', group: '声音' },
  imu: { name: '姿态传感器模块', price: 15, purpose: '感知挥动动作', group: '感知' },
  rgb: { name: 'RGB 灯模块', price: 8, purpose: '变换灯光颜色', group: '灯光' },
  soil: { name: '土壤湿度模块', price: 10, purpose: '测量土壤湿度', group: '感知' },
  lcd: { name: '彩色显示屏', price: 35, purpose: '显示小游戏画面', group: '显示' },
  buttons: { name: '按键与方向键套件', price: 12, purpose: '操作小游戏', group: '交互' },
  camera: { name: '摄像头模块', price: 39, purpose: '采集图像（识别需外部服务）', group: '视觉' },
  ultrasonic: { name: '超声波测距模块', price: 12, purpose: '检测前方距离', group: '感知' },
  motors: { name: '双电机轮组', price: 28, purpose: '驱动机器人移动', group: '运动' },
  driver: { name: '电机驱动模块', price: 12, purpose: '控制轮组', group: '控制' },
  usb: { name: 'USB 供电线', price: 6, purpose: '连接电源', group: '供电' },
  wires: { name: '连接线套装', price: 8, purpose: '连接各个模块', group: '连接' },
  petShell: { name: '桌宠外壳', price: 60, purpose: '装下你的新朋友', group: '结构' },
  wandShell: { name: '魔法棒外壳', price: 6, purpose: '握持与固定模块', group: '结构' },
  potShell: { name: '植物管家支架', price: 6, purpose: '固定在花盆旁（不含植物）', group: '结构' },
  gameShell: { name: '掌机外壳', price: 37, purpose: '组装你的小游戏机', group: '结构' },
  glassesShell: { name: '眼镜概念支架', price: 130, purpose: '固定摄像头与主控', group: '结构' },
  chassis: { name: '机器人底盘', price: 107, purpose: '安装轮组与模块', group: '结构' }
};
export const catalog = [
  { id:'pet', name:'摸摸头桌宠', short:'AI 桌宠', tag:'人气灵感', category:'互动陪伴', index:0, base:129, time:'约 2.5 小时', level:2, age:'10+', desc:'一摸就开心，给你的书桌多一点陪伴。', seed:'我想做一只桌面宠物，有两个眼睛，摸头会开心，还能发出声音，预算150元。', ids:['c3','oled','touch','buzzer','usb','wires','petShell'], features:['屏幕显示开心与待机表情','摸头触发互动','播放开心提示音','自定义桌宠名字'], principle:['摸摸头','触摸传感器','ESP32-C3','开心表情 + 提示音'] },
  { id:'wand', name:'挥一挥魔法棒', short:'智能魔法棒', tag:'入门推荐', category:'互动玩具', index:1, base:69, time:'约 1.5 小时', level:1, age:'10+', desc:'让每一次挥动，都变成一束彩色光。', seed:'我想做一根魔法棒，挥动时改变自己的灯光，预算100元。', ids:['c3','imu','rgb','usb','wires','wandShell'], features:['感知挥动动作','棒身 RGB 灯变换颜色','自定义灯光模式'], principle:['挥动魔法棒','姿态传感器','ESP32-C3','棒身变色灯光'] },
  { id:'plant', name:'植物小管家', short:'智能植物管家', tag:'生活小发明', category:'生活发明', index:2, base:79, time:'约 2 小时', level:1, age:'10+', desc:'它不能替你浇水，但会提醒你该浇水了。', seed:'我想做一个植物管家，土壤太干时显示提醒，预算100元。', ids:['c3','soil','oled','buzzer','usb','wires','potShell'], features:['检测土壤湿度','屏幕显示干湿状态','缺水时播放提醒'], principle:['土壤变干','湿度传感器','ESP32-C3','屏幕 + 声音提醒'] },
  { id:'game', name:'口袋小游戏机', short:'DIY 掌机', tag:'自己造，自己玩', category:'互动玩具', index:3, base:129, time:'约 3 小时', level:2, age:'12+', desc:'从一堆零件，到你亲手造的游戏机。', seed:'我想做一个有彩色屏幕和按键的小游戏机，预算200元。', ids:['c3','lcd','buttons','buzzer','usb','wires','gameShell'], features:['彩色屏幕显示小游戏','方向键与按键操作','基础小游戏程序（预设）','按键提示音'], principle:['按下按键','按键模块','ESP32-C3','更新游戏画面'] },
  { id:'glasses', name:'视觉探索眼镜', short:'AI 眼镜', tag:'探索概念', category:'机器人探索', index:4, base:249, time:'约 4 小时', level:4, age:'14+', review:true, desc:'探索可穿戴摄像头，识别功能需进一步评估。', seed:'我想做能识别物体的AI眼镜，预算300元。', ids:['s3','camera','oled','usb','wires','glassesShell'], features:['摄像头采集图像','屏幕展示状态','物体识别需外部 AI 服务与团队评估'], principle:['采集图像','摄像头模块','ESP32-S3','外部服务识别（待评估）'] },
  { id:'robot', name:'距离跟随小车', short:'跟随机器人', tag:'探索概念', category:'机器人探索', index:5, base:199, time:'约 4 小时', level:3, age:'12+', review:true, desc:'让小车根据前方距离移动，探索运动控制。', seed:'我想做一个根据前方距离移动的小机器人，预算250元。', ids:['c3','ultrasonic','motors','driver','usb','wires','chassis'], features:['检测前方距离','控制双轮移动','距离跟随逻辑（待实测）'], principle:['距离变化','测距模块','ESP32-C3 + 驱动','控制双轮移动'] }
];
export class InputError extends Error {}
export function normalizeRequest(input) {
  if (!input || typeof input.idea !== 'string' || input.idea.trim().length < 4 || input.idea.length > 1200) throw new InputError('请用 4～1200 个字描述你的想法。');
  if (input.starter && !catalog.some(p=>p.id===input.starter)) throw new InputError('请选择已有的灵感项目。');
  const t=input.idea.trim();
  let selected = input.starter || (/眼镜/.test(t)?'glasses':/植物|花盆|浇水|土壤/.test(t)?'plant':/魔法棒|挥动/.test(t)?'wand':/掌机|游戏机/.test(t)?'game':/跟随|小车|移动机器人/.test(t)?'robot':/桌宠|宠物|摸头|桌面.*机器人/.test(t)?'pet':null);
  const typedBudget=t.match(/预算\s*[¥￥]?\s*(\d{1,5})/);
  const budget=Number(input.budget ?? typedBudget?.[1] ?? 150);
  if (!Number.isInteger(budget)||budget<30||budget>2000) throw new InputError('测试预算范围为 ¥30～2000，请输入整数。');
  if (input.sound!==undefined && typeof input.sound!=='boolean') throw new InputError('声音选项格式不正确。');
  const asksForSound = /声音|发声|蜂鸣|提示音|音乐|语音|说话|播放.*音/.test(t) && !/不要声音|不需要声音|无需声音|无声|静音/.test(t);
  return { idea:t, starter:selected, budget, sound:input.sound ?? asksForSound };
}
export function plan(input) {
  const request=normalizeRequest(input);
  if (!request.starter) return { supported:false, request, message:'这个想法还没有对应的预设方案。先从下方灵感选择一个起点，或保留需求让团队评估。' };
  const item=catalog.find(x=>x.id===request.starter);
  let ids=[...item.ids];
  if (!request.sound) ids=ids.filter(x=>x!=='buzzer');
  const bom=ids.map(id=>({id,...parts[id],...modelFor(id),quantity:1}));
  const total=bom.reduce((n,x)=>n+x.price*x.quantity,0);
  const notes=[];
  if (/麦克风|语音|听懂|说话|聊天/.test(request.idea)) notes.push('语音与麦克风暂未加入零件库，本次报价不包含该功能。');
  if (item.id==='wand' && /控制.*灯|家里|远程/.test(request.idea)) notes.push('本方案只控制魔法棒自身灯光，家中灯具控制需要额外评估。');
  if (item.id==='pet' && /移动|走路|行走/.test(request.idea)) notes.push('桌宠方案为固定式，移动功能暂不在报价内。');
  if (/太阳能|充电|电池|蓝牙|wifi|联网|无线|人脸|自动浇水|机械臂|飞行|无人机/i.test(request.idea)) notes.push('电池、无线连接及其他扩展需求需要团队单独评估；本次报价仅包含下方功能与零件。');
  if (item.review) notes.push('这是探索方案，电源、结构与功能需要团队实测后才能确认制作和发货。');
  if (total>request.budget) notes.push(`当前方案比预算高 ¥${total-request.budget}，可返回调整预算或选择更简单的灵感。`);
  return { supported:true, request, template:item.id, name:item.name, desc:item.desc, index:item.index, time:item.time, level:item.level, age:item.age, bom, total, withinBudget:total<=request.budget, needsReview:notes.length>0 || !!item.review, notes, features:item.features.filter(f=>request.sound||!/音/.test(f)), principle:item.principle, status:'预设方案 · 待团队实测', currency:'CNY' };
}
export function validateOrder(input) {
  if (!input || typeof input.name!=='string'||input.name.trim().length<1||input.name.length>40) throw new InputError('请填写称呼（最多40字）。');
  if (typeof input.contact!=='string'||input.contact.length>100||!(/^[+\d\s-]{7,25}$/.test(input.contact.trim())||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.trim())||/^(微信|wechat)[:：]\s*\S{4,40}$/i.test(input.contact.trim()))) throw new InputError('请填写手机号、邮箱，或“微信:你的微信号”。');
  if (input.consent!==true) throw new InputError('请同意仅用于本次测试订单联系。');
  if (!['order','review'].includes(input.intent)) throw new InputError('订单意向格式不正确。');
  if (typeof input.key!=='string'||!/^[\w-]{10,80}$/.test(input.key)) throw new InputError('订单标识无效，请刷新后重试。');
  const project=plan(input.request);
  if (!project.supported) throw new InputError('请先选择一个可展示的方案。');
  if ((project.needsReview||!project.withinBudget)&&input.intent!=='review') throw new InputError('该方案需要先提交评估。');
  if (input.note!==undefined && (typeof input.note!=='string'||input.note.length>500)) throw new InputError('补充需求最多500字。');
  return {name:input.name.trim(),contact:input.contact.trim(),note:input.note?.trim()||'',intent:input.intent,project};
}

