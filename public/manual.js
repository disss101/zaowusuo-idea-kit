import { renderDesignDrawing } from './diagram.js';

const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const lessons = {
  pet: { action: '摸头', commands: [['T', 'Touch detected: show happy face'], ['R', 'Reset: show resting face']], explain: '输入 T 模拟一次摸头；真正接入触摸模块和 OLED 前，先确认模块供电、信号引脚和屏幕地址。' },
  wand: { action: '挥动', commands: [['W', 'Wave detected: change light color'], ['R', 'Reset: turn light off']], explain: '输入 W 模拟挥动。灯珠的工作电压和数据电平要按实际模块核对，不能直接照概念图接线。' },
  plant: { action: '土壤变干', commands: [['D', 'Soil is dry: show water reminder'], ['M', 'Soil is moist: reminder cleared']], explain: '输入 D 或 M 模拟干湿变化。实际阈值要用所购买传感器的读数测量后设定。' },
  game: { action: '按键', commands: [['A', 'Button A: score +1'], ['R', 'Reset: score = 0']], explain: '输入 A 模拟按键。屏幕和按键的实际接线取决于模块版本，需在确认后添加显示驱动。' },
  glasses: { action: '拍摄请求', commands: [['C', 'Capture requested: camera setup pending'], ['R', 'Reset: standby']], explain: '输入 C 模拟拍摄请求。摄像头排线、引脚和外部识别服务尚未确定，这段代码不执行图像识别。' },
  robot: { action: '距离变化', commands: [['N', 'Object near: stop requested'], ['F', 'Path clear: movement requested']], explain: '输入 N 或 F 模拟测距结果。程序不会启动电机；测距模块的 Echo 电平、驱动供电和电机方向须先实测。' },
};

function practiceSketch(plan) {
  const lesson = lessons[plan.template] || lessons.pet;
  const cases = lesson.commands.map(([key, output]) => `    case '${key}':\n      Serial.println("${output}");\n      break;`).join('\n');
  return {
    lesson,
    code: `// IDEA KIT · ${plan.template?.toUpperCase() || 'PET'} interaction practice\n// This first sketch uses USB + Serial only. No module wiring is required.\n// Select the ESP32 board that matches the actual controller before upload.\n\nvoid setup() {\n  Serial.begin(115200);\n  delay(800);\n  Serial.println("IDEA KIT ready");\n  Serial.println("Type a command and press Send:");\n${lesson.commands.map(([key]) => `  Serial.println("  ${key}");`).join('\n')}\n}\n\nvoid loop() {\n  if (Serial.available() == 0) return;\n  char command = Serial.read();\n  if (command >= 'a' && command <= 'z') command -= 32;\n\n  switch (command) {\n${cases}\n    case '\\n':\n    case '\\r':\n      break;\n    default:\n      Serial.println("Unknown command. Try a listed letter.");\n      break;\n  }\n}\n`,
  };
}

function step(title, description, check) {
  return `<li><div><h4>${safe(title)}</h4><p>${safe(description)}</p><small>完成标志：${safe(check)}</small></div></li>`;
}

export function renderManualSheet(plan) {
  const bom = Array.isArray(plan.bom) ? plan.bom : [];
  const flow = Array.isArray(plan.principle) ? plan.principle.slice(0, 4) : [];
  const guide = practiceSketch(plan);
  const controller = bom.find(part => part.id === 'c3' || part.id === 's3');
  const modules = bom.filter(part => !['c3', 's3', 'usb', 'wires', 'petShell', 'wandShell', 'potShell', 'gameShell', 'glassesShell', 'chassis'].includes(part.id));
  const moduleNames = modules.length ? modules.map(part => part.name).join('、') : '本方案的交互模块';
  const selectedSteps = (plan.assemblySteps || []).slice(0, 4);

  return `<section class="manual-sheet" aria-label="新手制作指南">
    <header class="manual-sheet-heading"><div><span>IDEA KIT / BEGINNER BUILD GUIDE</span><h2>${safe(plan.name)}<br />从想法到第一版原型</h2></div><p>看懂结构 → 核对零件 → 验证代码 → 逐件装配</p></header>
    <div class="manual-intro"><strong>第一次做电子 DIY，也可以从这里开始。</strong><p>下面的图和代码用来理解方案与验证交互逻辑。当前是概念设计，尚未给出可直接照接的引脚图；购买到具体模块后，应按实物丝印、官方资料和工作人员核对结果完成最终接线与程序。</p></div>
    <div class="manual-visuals">
      <article class="manual-panel manual-main"><h3><b>1</b> 看外形和模块位置</h3><div class="manual-drawing">${renderDesignDrawing(plan)}</div><p>图中尺寸是外形目标，帮助理解各部分的相对位置，并非按比例的加工图。</p></article>
      <article class="manual-panel"><h3><b>2</b> 看它怎样工作</h3><div class="manual-flow" aria-label="输入到输出的概念流程">${flow.map((item, index) => `<div><span>${String(index + 1).padStart(2, '0')}</span><strong>${safe(item)}</strong></div>`).join('')}</div><p>先有输入，再由主控判断，最后产生可见或可听的反馈。</p></article>
    </div>
    <div class="manual-section-heading"><div><span>PARTS & PURPOSE</span><h3>先认识手里的零件</h3></div><p>每个型号都是选型参考；购买前核对接口、电压、外形和库存。</p></div>
    <div class="manual-parts">${bom.map(part => `<div><strong>${safe(part.name)}</strong><span>${safe(part.model || '型号待核对')}</span><p>${safe(part.purpose || '在作品中发挥作用')}</p><small>尺寸：${safe(part.dimensionsMm || '待测量')} · 数量 × ${safe(part.quantity || 1)}</small></div>`).join('')}</div>
    <div class="manual-section-heading"><div><span>BUILD IN STAGES</span><h3>按这六步做第一版</h3></div><p>每完成一步，再进入下一步。</p></div>
    <ol class="manual-detailed-steps">
      ${step('准备工作台', '准备电脑、与主控接口匹配的 USB 数据线、零件盒和记录纸。先断开电源，不要把电源正负极凭颜色猜接。', '能说清每个零件的名称，并找出主控和 USB 接口。')}
      ${step('核对实物', `对照清单逐件检查 ${controller?.model || '主控型号'}、${moduleNames} 的型号和引脚标识。把未知的电压、接口与尺寸标为待确认。`, '清单与实物一一对应，未确认的参数已记录。')}
      ${step('排布结构', '先不要固定外壳。把主控、输入模块和输出模块摆在预期位置，预留 USB 插头、走线、散热和可拆卸空间。', '能说明输入在哪里、主控在哪里、输出在哪里。')}
      ${step('只连接主控并烧录练习代码', '只用 USB 将主控连接电脑，选择与实物匹配的开发板和端口。复制下方程序，先完成编译与上传，再打开串口监视器。', '串口监视器在 115200 波特率下显示 IDEA KIT ready。')}
      ${step('逐个验证模块', '先断电。依据已确认的实物引脚图，一次只接入一个模块，检查供电电压、GND 和信号方向；通电后只测试这一个模块。', '每个模块都有独立测试记录；没有发热、异常气味或反复重启。')}
      ${step('装配并复测', '模块都独立通过后，再整理走线并装入结构件。逐项复现功能、记录失败情形，最后才固定外壳。', '作品连续完成预期交互，并保留一份问题清单。')}
    </ol>
    ${selectedSteps.length ? `<p class="manual-ai-note"><strong>本方案的补充建议：</strong>${selectedSteps.map(safe).join(' · ')}</p>` : ''}
    <div class="manual-section-heading"><div><span>FIRST CODE / USB ONLY</span><h3>先让交互逻辑跑起来</h3></div><p>这份代码可直接复制；它用串口模拟“${safe(guide.lesson.action)}”，不驱动外接模块。</p></div>
    <div class="manual-code-layout"><div class="manual-code-instructions"><h4>零基础怎么使用？</h4><ol><li>按实际主控型号安装对应的开发板支持包，选择正确开发板与端口。</li><li>新建一个 Arduino 草图，复制右边完整代码并上传。</li><li>打开串口监视器，将波特率设为 <strong>115200</strong>。</li><li>输入字母 ${guide.lesson.commands.map(([key]) => `<kbd>${safe(key)}</kbd>`).join(' 或 ')} 并发送，观察反馈。</li></ol><p>${safe(guide.lesson.explain)}</p><a href="https://docs.espressif.com/projects/arduino-esp32/en/latest/getting_started.html" target="_blank" rel="noopener noreferrer">查看 Espressif 官方入门说明 ↗</a></div><div class="manual-code-card"><div><span>Arduino / ${safe(controller?.model || 'ESP32 参考主控')}</span><button type="button" data-copy-manual-code>复制代码</button></div><pre><code>${safe(guide.code)}</code></pre></div></div>
    <div class="manual-check"><h3>准备接线前，逐项核对</h3><ul><li>主控和模块是否使用相同的逻辑电平；供电电压是否匹配。</li><li>模块的 VCC、GND、信号脚是否与所买版本的说明一致。</li><li>外壳尺寸、孔位和导线空间是否按实物测量。</li><li>电机、蜂鸣器、摄像头等特殊模块是否需要额外驱动或供电设计。</li></ul><p>未确认这些信息时，请停留在 USB 逻辑练习阶段。概念图不能代替电路图、施工图或安全测试。</p></div>
  </section>`;
}
