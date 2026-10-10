import test from 'node:test';
import assert from 'node:assert/strict';
import { askClarifyingQuestions, generateAiPlan, guideBuild, inspectBuildImage, AiServiceError, QWEN_ENDPOINT } from '../lib/ai-design.mjs';

const ideas = [
  ['低成本 LED 夜灯', ['c3', 'rgb', 'usb', 'wires']],
  ['摸头亮灯桌宠', ['c3', 'touch', 'rgb', 'usb', 'wires']],
  ['OLED 表情桌宠', ['c3', 'touch', 'oled', 'usb', 'wires']],
  ['挥动会变色的魔法棒', ['c3', 'imu', 'rgb', 'usb', 'wires']],
  ['土壤变干就提醒的植物管家', ['c3', 'soil', 'oled', 'usb', 'wires']],
  ['按键控制小游戏机', ['c3', 'buttons', 'lcd', 'usb', 'wires']],
  ['双轮移动小机器人', ['c3', 'motors', 'driver', 'usb', 'wires']],
  ['前方有障碍会停的小车', ['c3', 'ultrasonic', 'motors', 'driver', 'usb', 'wires']],
  ['姿态控制的彩灯', ['c3', 'imu', 'rgb', 'usb', 'wires']],
  ['显示湿度的花盆', ['c3', 'soil', 'oled', 'usb', 'wires']],
  ['触摸后显示文字的留言板', ['c3', 'touch', 'oled', 'usb', 'wires']],
  ['按键切换颜色的桌灯', ['c3', 'buttons', 'rgb', 'usb', 'wires']],
  ['摄像头拍照实验', ['s3', 'camera', 'usb', 'wires']],
  ['不会发声的桌宠', ['c3', 'touch', 'oled', 'usb', 'wires']],
  ['超低预算小夜灯', ['c3', 'rgb', 'usb', 'wires']],
  ['有动作反馈的魔法棒', ['c3', 'imu', 'rgb', 'usb', 'wires']],
  ['距离显示装置', ['c3', 'ultrasonic', 'oled', 'usb', 'wires']],
  ['按键控制的提示音装置', ['c3', 'buttons', 'buzzer', 'usb', 'wires']],
  ['彩屏温馨留言装置', ['c3', 'lcd', 'buttons', 'usb', 'wires']],
  ['触摸调色的小桌灯', ['c3', 'touch', 'rgb', 'usb', 'wires']],
];

function mockOutput(partIds) {
  return { feasible: true, message: '', name: '可制作的原型', description: '让用户通过真实输入得到看得见的互动反馈。', partIds,
    features: ['检测一次输入', '给出明确的反馈'], principle: ['用户输入', '传感器检测', '主控处理', '输出反馈'],
    assemblySteps: ['核对实际型号', '断电连接原型', '烧录基础程序', '测试互动效果'], caveats: ['供电和引脚尚待实物核对'],
    time: '约 2 小时（待实测）', level: 1, age: '10+', visualTemplate: 'pet' };
}

function reply(value, inspect = () => {}, status = 200) {
  return async (url, options) => {
    inspect(url, options);
    return { ok: status === 200, status, json: async () => ({ model: JSON.parse(options.body).model, usage: { prompt_tokens: 100, completion_tokens: 80 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }) };
  };
}

test('追问使用 Flash，方案使用 Plus，密钥只在服务端请求头', async () => {
  const calls = [];
  await askClarifyingQuestions({ idea: '做一只会回应摸头的桌宠' }, { apiKey: 'test-only', fetchImpl: reply({ questions: ['它主要放在哪里？', '希望用什么供电？'] }, (url, options) => calls.push([url, options])) });
  await generateAiPlan({ idea: '做一只会回应摸头的桌宠', budget: 150 }, { apiKey: 'test-only', fetchImpl: reply(mockOutput(['c3', 'touch', 'oled', 'usb', 'wires']), (url, options) => calls.push([url, options])) });
  assert.deepEqual(calls.map(([url, options]) => [url, JSON.parse(options.body).model]), [[QWEN_ENDPOINT, 'qwen-flash'], [QWEN_ENDPOINT, 'qwen-plus']]);
  assert.ok(calls.every(([, options]) => options.headers.Authorization === 'Bearer test-only' && !options.body.includes('test-only')));
});

test('20 个不同创意均通过结构、零件与服务器计价校验', async () => {
  for (const [idea, partIds] of ideas) {
    const result = await generateAiPlan({ idea, budget: 150, sound: true }, { apiKey: 'test-only', fetchImpl: reply(mockOutput(partIds)) });
    assert.equal(result.supported, true, idea);
    assert.equal(result.source, 'qwen', idea);
    assert.equal(result.total, result.bom.reduce((sum, part) => sum + part.price, 0), idea);
    assert.equal(result.needsReview, true, idea);
  }
});

test('模型不能添加库外零件或缺少驱动、主控', async () => {
  for (const ids of [['c3', 'unknown'], ['c3', 'motors'], ['camera', 'usb'], ['touch', 'oled']]) {
    await assert.rejects(generateAiPlan({ idea: '制作一个互动硬件原型', budget: 200 }, { apiKey: 'test-only', fetchImpl: reply(mockOutput(ids)) }), AiServiceError);
  }
});

test('预算不足仍保留方案，API 故障与不可行分开呈现', async () => {
  const plan = await generateAiPlan({ idea: '做一个移动机器人', budget: 30 }, { apiKey: 'test-only', fetchImpl: reply(mockOutput(['c3', 'motors', 'driver', 'usb', 'wires'])) });
  assert.equal(plan.withinBudget, false);
  assert.match(plan.notes.join(' '), /预算/);
  await assert.rejects(generateAiPlan({ idea: '做一个移动机器人', budget: 200 }, { apiKey: 'test-only', fetchImpl: reply(null, () => {}, 503) }), /暂时不可用/);
});

test('制作导师使用项目清单与当前步骤，不编造接线', async () => {
  const plan = await generateAiPlan({ idea: '做一个会回应触摸的桌宠', budget: 150 }, { apiKey: 'test-only', fetchImpl: reply(mockOutput(['c3', 'touch', 'oled', 'usb', 'wires'])) });
  let sent;
  const answer = await guideBuild({ plan, step: 1, history: [{ question: '屏幕不亮', actions: ['核对供电'] }] }, '屏幕还是不亮怎么办？', {
    apiKey: 'test-only', fetchImpl: reply({ reply: '先断电，确认实际模块标签。', actions: ['拍下模块正面与背面型号'], uncertainty: '尚无已验证接线图', needsHuman: false }, (_, options) => { sent = JSON.parse(options.body); }),
  });
  assert.equal(sent.model, 'qwen-flash');
  assert.match(sent.messages[1].content, /当前步骤|currentStep/);
  assert.equal(answer.actions.length, 1);
});

test('视觉诊断只接受受限图片，并路由到视觉模型', async () => {
  const project = { plan: { supported: true, name: '桌宠', bom: [{ name: '主控', model: 'ESP32-C3' }] } };
  await assert.rejects(inspectBuildImage(project, 'https://example.com/x.png', '接线对吗', { apiKey: 'test-only' }), AiServiceError);
  let sent;
  const answer = await inspectBuildImage(project, 'data:image/png;base64,aGVsbG8=', '接线对吗', { apiKey: 'test-only', fetchImpl: reply({ observed: ['看到一块开发板'], possibleIssues: [], unknowns: ['针脚编号看不清'], nextStep: '先断电并补拍接线近照' }, (_, options) => { sent = JSON.parse(options.body); }) });
  assert.equal(sent.model, 'qwen3-vl-flash');
  assert.equal(answer.nextStep, '先断电并补拍接线近照');
});
