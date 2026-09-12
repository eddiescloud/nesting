#!/usr/bin/env node
/**
 * 跨模块集成测试：交互宿主 VisualBridge ↔ 视觉模块 HostAdapter
 * 模拟真实浏览器中 iframe + postMessage 的完整流程，验证协议兼容性。
 *
 * 覆盖：
 *   1. iframe load → hello → ready 握手
 *   2. 宿主 load → 视觉模块初始化参数
 *   3. 宿主 frame（playing）→ 视觉模块推进时间线
 *   4. 宿主 frame（paused）→ 视觉模块暂停
 *   5. 宿主 reset → 视觉模块清空
 *   6. 重复开始（新 session）→ 旧数据不残留
 *   7. 无效参数 → 视觉模块发送 error
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VISUAL_JS = path.join(ROOT, 'web', 'visual', 'js');
const INTERACTION_JS = path.join(ROOT, 'web', 'interaction');

/* ---- Mock 浏览器环境 ---- */
const mockCtx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
      return () => ({ addColorStop: () => {} });
    return () => {};
  },
  set() { return true; }
});

// 模拟 iframe 元素：contentWindow 是视觉模块的 window
const visualWindow = {
  parent: null, // 将在测试中设置为宿主 window
  addEventListener: () => {},
  location: { origin: 'http://127.0.0.1:8765', href: 'http://127.0.0.1:8765/web/visual/index.html' },
  postMessage: () => {},
};

const hostWindow = {
  location: { origin: 'http://127.0.0.1:8765', href: 'http://127.0.0.1:8765/' },
  addEventListener: () => {},
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: () => {},
  postMessage: () => {}, // 视觉模块通过 window.parent.postMessage 发消息到宿主
};

visualWindow.parent = hostWindow; // iframe 中 window.parent 是宿主窗口，不等于自身

const mockIframe = {
  contentWindow: visualWindow,
  addEventListener: () => {},
  removeAttribute: () => {},
};

global.window = visualWindow; // 视觉模块在 iframe 中，global.window 是 visualWindow
global.document = {
  getElementById: () => ({
    getContext: () => mockCtx,
    addEventListener: () => {},
    style: {},
    textContent: '',
    disabled: false,
    clientWidth: 1080,
    clientHeight: 1920,
  }),
  readyState: 'complete',
  addEventListener: () => {},
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};

/* ---- 加载视觉模块 ---- */
const visualFiles = ['config.js', 'humanoid.js', 'swarm.js', 'weave.js', 'timeline.js', 'host-adapter.js'];
for (const f of visualFiles) {
  eval(fs.readFileSync(path.join(VISUAL_JS, f), 'utf-8'));
}
const config = visualWindow.NestingConfig;
const HumanoidModule = visualWindow.HumanoidModule;
const SwarmModule = visualWindow.SwarmModule;
const WeaveModule = visualWindow.WeaveModule;
const Timeline = visualWindow.Timeline;
const HostAdapter = visualWindow.HostAdapter;

/* ---- 加载交互模块的 VisualBridge ---- */
// bridge.mjs 使用 ES module export，需要转换为 CommonJS 可用
const bridgeCode = fs.readFileSync(path.join(INTERACTION_JS, 'bridge.mjs'), 'utf-8');
// 去掉 export 关键字，改为赋值到 global
const bridgeCjs = bridgeCode
  .replace(/export function/g, 'function')
  .replace(/export class VisualBridge/g, 'global.VisualBridge = class VisualBridge')
  .replace(/export class AudioBridge/g, 'global.AudioBridge = class AudioBridge');
eval(bridgeCjs);
const VisualBridge = global.VisualBridge;

/* ---- 测试参数 ---- */
const params = JSON.parse(fs.readFileSync(path.join(VISUAL_JS, '..', 'params', 'demo.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ ' + msg); throw new Error(msg); }
}

/* ---- 搭建通信管道 ---- */
// 记录双向消息
const hostToVisual = [];
const visualToHost = [];

// 视觉模块发消息（通过 window.parent.postMessage）→ 宿主收
hostWindow.postMessage = (data, origin) => {
  visualToHost.push({ data, origin });
  // 模拟宿主收到消息，触发 VisualBridge 的 receive
  simulateHostReceive(data);
};

// 宿主发消息（通过 iframe.contentWindow.postMessage）→ 视觉模块收
function hostPost(data, origin) {
  hostToVisual.push({ data, origin });
  // 模拟视觉模块收到消息，触发 HostAdapter 的 receive
  simulateVisualReceive(data);
}

let visualAdapter = null;
let hostBridge = null;
let hostStatus = null;
let hostError = null;

function simulateHostReceive(data) {
  if (!hostBridge) return;
  // 构造假的 event 对象
  hostBridge.receive({
    origin: 'http://127.0.0.1:8765',
    source: mockIframe.contentWindow,
    data,
  });
}

function simulateVisualReceive(data) {
  if (!visualAdapter) return;
  visualAdapter._receive({
    origin: 'http://127.0.0.1:8765',
    data,
  });
}

/* ---- 测试 1：握手（hello → ready） ---- */
console.log('\n--- 测试 1：iframe 握手 ---');

// 创建视觉模块的 HostAdapter
const hHumanoid = new HumanoidModule(params, config);
const hSwarm = new SwarmModule(params, config);
const hWeave = new WeaveModule(params, config, hSwarm);
let hTimeline = new Timeline(config, { humanoid: hHumanoid, swarm: hSwarm, weave: hWeave });

let loadedOutput = null;
// 模拟真实 main.js 中的 onHostLoad：收到 load 后重建所有模块
function rebuildModules(output) {
  loadedOutput = output;
  const newHumanoid = new HumanoidModule(output, config);
  const newSwarm = new SwarmModule(output, config);
  const newWeave = new WeaveModule(output, config, newSwarm);
  const newTimeline = new Timeline(config, { humanoid: newHumanoid, swarm: newSwarm, weave: newWeave });
  newTimeline.pause();
  newTimeline.seek(0);
  return { timeline: newTimeline, weave: newWeave, swarm: newSwarm, humanoid: newHumanoid };
}

visualAdapter = new HostAdapter({
  timeline: hTimeline,
  config,
  onLoad: (output) => {
    if (output) {
      const result = rebuildModules(output);
      hTimeline = result.timeline;
      visualAdapter.timeline = hTimeline;
    } else {
      loadedOutput = null;
    }
  },
  onError: (msg) => { console.log('    [视觉错误] ' + msg); },
});
assert(visualAdapter.isHosted() === true, '视觉模块检测到 iframe 环境');

// 视觉模块 connect 后发送 ready
visualAdapter.connect();
assert(visualToHost.length >= 1, '视觉模块发送了消息');
const readyMsg = visualToHost[visualToHost.length - 1];
assert(readyMsg.data.type === 'ready', '消息类型为 ready');
assert(readyMsg.data.channel === 'nesting', 'channel 正确');
assert(readyMsg.data.version === '0.1', 'version 正确');

// 创建宿主的 VisualBridge
hostBridge = new VisualBridge({
  frame: mockIframe,
  url: '/web/visual/index.html',
  onStatus: (status) => { hostStatus = status; },
  onError: (msg) => { hostError = msg; },
  scope: hostWindow,
});
// 覆盖 VisualBridge 的 post 方法，使用我们的管道
hostBridge.post = function(type, payload, sessionId) {
  hostPost({
    channel: 'nesting', version: '0.1', type,
    sessionId: sessionId || (this.current ? this.current.sessionId : null),
    payload,
  }, hostWindow.location.origin);
};

// 模拟 iframe load 触发 hello
hostBridge.hello();
assert(hostToVisual.length >= 1, '宿主发送了消息');
const hasHello = hostToVisual.some(m => m.data.type === 'hello');
assert(hasHello, '消息中包含 hello');
// 宿主收到 ready 后会自动发 reset（VisualBridge 正确行为）
const hasResetAfterReady = hostToVisual.some(m => m.data.type === 'reset');
assert(hasResetAfterReady, '宿主收到 ready 后自动发送 reset（无当前 session 时）');

// 宿主收到 ready 后状态应为 ready
assert(hostStatus === 'ready', '宿主状态变为 ready');
assert(hostBridge.ready === true, 'VisualBridge.ready = true');

/* ---- 测试 2：宿主 load → 视觉模块初始化 ---- */
console.log('\n--- 测试 2：load 参数传递 ---');

const sessionId1 = 'session-integration-001';
const loadPayload = {
  output: params,
  source: 'manual-preset',
  duration: 60,
  reducedMotion: false,
};
hostBridge.load(sessionId1, loadPayload);

assert(loadedOutput !== null, '视觉模块收到 load 并解析 output');
assert(loadedOutput.events.length === 2, 'output 包含两段事件');
assert(loadedOutput.interaction.weave === params.interaction.weave, 'weave 参数正确传递');
assert(visualAdapter.sessionId === sessionId1, 'sessionId 正确记录');
assert(hTimeline.playing === false, 'load 后不自动开始（等待 frame）');

/* ---- 测试 3：宿主 frame（playing）→ 时间线推进 ---- */
console.log('\n--- 测试 3：frame 播放控制 ---');

hostBridge.frame({ time: 15, phase: 'first', playing: true });
const info1 = hTimeline.getPhaseInfo();
assert(Math.abs(info1.time - 15) < 0.1, '时间线跳转到 t=15s（实际 ' + info1.time.toFixed(1) + '）');
assert(info1.phase === 'enter_a', '阶段映射 first → enter_a（实际 ' + info1.phase + '）');
assert(hTimeline.playing === true, 'playing = true');

// 推进几帧，确认时间在走
for (let i = 0; i < 10; i++) hTimeline.tick(1/60);
const info2 = hTimeline.getPhaseInfo();
assert(info2.time > 15, '时间线在推进（' + info2.time.toFixed(2) + ' > 15）');

/* ---- 测试 4：宿主 frame（paused）→ 暂停 ---- */
console.log('\n--- 测试 4：frame 暂停控制 ---');

hostBridge.frame({ time: 25, phase: 'second', playing: false });
const info3 = hTimeline.getPhaseInfo();
assert(Math.abs(info3.time - 25) < 0.1, '跳转到 t=25s');
assert(hTimeline.playing === false, 'playing = false（暂停）');

// 暂停后推进帧，时间不应走
const timeBefore = hTimeline.getPhaseInfo().time;
for (let i = 0; i < 10; i++) hTimeline.tick(1/60);
const timeAfter = hTimeline.getPhaseInfo().time;
assert(Math.abs(timeAfter - timeBefore) < 0.001, '暂停后时间不推进（' + timeBefore.toFixed(2) + ' → ' + timeAfter.toFixed(2) + '）');

/* ---- 测试 5：宿主 reset → 清空 ---- */
console.log('\n--- 测试 5：reset 清空 ---');

hostBridge.reset();
const info4 = hTimeline.getPhaseInfo();
assert(info4.phase === 'idle' && info4.time === 0, 'reset 后回到 idle 0s');
assert(visualAdapter.sessionId === null, 'reset 后 sessionId 清空');
assert(hostBridge.current === null, 'VisualBridge.current 清空');

/* ---- 测试 6：重复开始（新 session）无旧数据残留 ---- */
console.log('\n--- 测试 6：新 session 无残留 ---');

const sessionId2 = 'session-integration-002';
const params2 = JSON.parse(JSON.stringify(params));
params2.interaction.weave = 0.2;
params2.interaction.settle = 0.1;
hostBridge.load(sessionId2, { output: params2, source: 'manual-preset', duration: 60 });
assert(visualAdapter.sessionId === sessionId2, '新 sessionId 正确');
assert(loadedOutput.interaction.weave === 0.2, '新参数覆盖旧参数（weave=0.2）');

// 推进到沉积阶段，确认用的是新参数
const newWeave = hTimeline.modules.weave;
hostBridge.frame({ time: 50, phase: 'settle', playing: true });
for (let i = 0; i < 60; i++) hTimeline.tick(1/60); // 推进约1秒
// 低 weave=0.2 → 结对数 = round(48*0.2) = 10
// 低 settle=0.1 → 沉积数 = round(10*0.1) = 1
assert(newWeave.pairCount === 10, '新参数下结对数 = 10（round(48×0.2)，实际 ' + newWeave.pairCount + '）');
assert(newWeave.depositedCount === 1, '新参数下沉积数 = 1（round(10×0.1)，实际 ' + newWeave.depositedCount + '）');

/* ---- 测试 7：无效参数 → error ---- */
console.log('\n--- 测试 7：无效参数错误处理 ---');

let visualErrorMsg = null;
visualAdapter.onError = (msg) => { visualErrorMsg = msg; };
hostBridge.load('bad-session', { output: { events: [], interaction: {} } });
assert(visualErrorMsg !== null, '无效 output 触发视觉模块错误回调');
assert(visualToHost.some(m => m.data.type === 'error'), '视觉模块发送 error 消息');

/* ---- 汇总 ---- */
console.log('\n========================================');
console.log('跨模块集成测试通过！' + passed + ' 项通过，' + failed + ' 项失败。');
console.log('VisualBridge（交互）↔ HostAdapter（视觉）协议兼容。');
console.log('========================================');

if (failed > 0) process.exit(1);
