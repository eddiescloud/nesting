#!/usr/bin/env node
/**
 * 筑巢视觉模块 · 无头运行时验证
 * 验证 web/visual/ 下的所有模块：
 *   1. 模块初始化与参数映射
 *   2. 完整 60 秒 @ 60fps 模拟无运行时错误
 *   3. 时间线六阶段正确推进
 *   4. 交织结对与沉积正确触发
 *   5. 重置后状态干净
 *   6. 参数差异正确反映
 *   7. 宿主通信协议（postMessage）：hello/load/frame/reset
 */
'use strict';

const fs = require('fs');
const path = require('path');

const VISUAL_DIR = path.join(__dirname, '..', 'web', 'visual');
const JS_DIR = path.join(VISUAL_DIR, 'js');

/* ---- Mock 浏览器环境 ---- */
const mockCtx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    return () => {};
  },
  set() { return true; }
});

const mockElement = {
  getContext: () => mockCtx,
  addEventListener: () => {},
  style: {},
  textContent: '',
  disabled: false,
  clientWidth: 1080,
  clientHeight: 1920,
};

global.window = {
  parent: { postMessage: () => {} }, // 模拟 iframe 宿主
  addEventListener: () => {},
  location: { origin: 'http://127.0.0.1:8765', href: 'http://127.0.0.1:8765/web/visual/index.html' },
  postMessage: () => {},
};
global.document = {
  getElementById: () => mockElement,
  readyState: 'complete',
  addEventListener: () => {},
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};

/* ---- 加载所有模块 ---- */
const files = ['config.js', 'humanoid.js', 'swarm.js', 'weave.js', 'timeline.js', 'host-adapter.js'];
for (const f of files) {
  const code = fs.readFileSync(path.join(JS_DIR, f), 'utf-8');
  eval(code);
}

const config = global.window.NestingConfig;
const HumanoidModule = global.window.HumanoidModule;
const SwarmModule = global.window.SwarmModule;
const WeaveModule = global.window.WeaveModule;
const Timeline = global.window.Timeline;
const HostAdapter = global.window.HostAdapter;

/* ---- 加载参数 ---- */
const params = JSON.parse(fs.readFileSync(path.join(VISUAL_DIR, 'params/demo.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ ' + msg); throw new Error(msg); }
}

/* ---- 测试 1：模块初始化 ---- */
console.log('\n--- 测试 1：模块初始化与参数映射 ---');
const humanoid = new HumanoidModule(params, config);
const swarm = new SwarmModule(params, config);
const weave = new WeaveModule(params, config, swarm);
assert(swarm.groups.length === 2, '蜂群组数 = 2');
assert(swarm.groups[0].particles.length === 48, '每组粒子数 = 48');
const expectedPairs = config.roundHalfUp(48 * params.interaction.weave);
assert(weave.pairCount === expectedPairs, '结对数 = round(48×weave) = ' + expectedPairs);
const expectedDeposited = config.roundHalfUp(expectedPairs * params.interaction.settle);
assert(weave.depositedCount === expectedDeposited, '沉积数 = round(结对数×settle) = ' + expectedDeposited);
assert(weave.baseMeshAlpha > 0 && weave.baseMeshAlpha <= 1, '薄层基础透明度在 0-1 范围内');
// 参数映射验证
assert(config.speedFor(0.5) === (12 + 60 * 0.5) * config.HEIGHT_SCALE, '速度公式正确');
assert(config.radiusFor(0.5) === (20 + 100 * 0.5) * config.HEIGHT_SCALE, '群体半径公式正确');
assert(config.turbulenceFor(0.5) === (2 + 22 * 0.5) * config.HEIGHT_SCALE, '扰动幅度公式正确');
assert(config.traceAlphaFor(0.5) === 0.12 + 0.48 * 0.5, '残留透明度公式正确');

/* ---- 测试 2：完整 60 秒模拟 ---- */
console.log('\n--- 测试 2：完整 60 秒模拟 @ 60fps ---');
const timeline = new Timeline(config, { humanoid, swarm, weave });
timeline.start();

const dt = 1 / 60;
const totalFrames = Math.ceil(60 / dt);
let phaseChanges = [];
let lastPhase = '';
let errors = [];

for (let frame = 0; frame < totalFrames; frame++) {
  try {
    timeline.tick(dt);
    timeline.draw(mockCtx);
    const info = timeline.getPhaseInfo();
    if (info.phase !== lastPhase) {
      phaseChanges.push({ frame, time: info.time.toFixed(1), phase: info.phase });
      lastPhase = info.phase;
    }
  } catch (e) {
    errors.push({ frame, error: e.message });
    if (errors.length >= 5) break;
  }
}

assert(errors.length === 0, '3600 帧无运行时错误');
assert(phaseChanges.length === 6, '六阶段变化（实际 ' + phaseChanges.length + '）');
const expectedPhases = ['idle', 'enter_a', 'enter_b', 'weave', 'settle', 'hold'];
for (let i = 0; i < expectedPhases.length; i++) {
  assert(phaseChanges[i].phase === expectedPhases[i], '阶段 ' + (i+1) + ': ' + expectedPhases[i] + ' @ t=' + phaseChanges[i].time + 's');
}

/* ---- 测试 3：最终状态 ---- */
console.log('\n--- 测试 3：最终状态验证 ---');
const info = timeline.getPhaseInfo();
assert(info.phase === 'hold', '最终阶段 = hold');
assert(Math.abs(info.time - 60) < 0.1, '最终时间 ≈ 60s');
assert(weave.depositedEndpoints.length === weave.depositedCount, '沉积端点对数 = ' + weave.depositedCount);
assert(weave.meshProgress === 1, '网格完全形成');
const activeA = swarm.getActiveCount(0);
const activeB = swarm.getActiveCount(1);
console.log('  A 组活跃粒子=' + activeA + '/48，B 组活跃粒子=' + activeB + '/48');
assert(activeA === 48 - weave.depositedCount, 'A 组未沉积粒子数正确');
assert(activeB === 48 - weave.depositedCount, 'B 组未沉积粒子数正确');

/* ---- 测试 4：重置 ---- */
console.log('\n--- 测试 4：重置验证 ---');
timeline.reset();
const info2 = timeline.getPhaseInfo();
assert(info2.phase === 'idle' && info2.time === 0, '重置后回到 idle 0s');
assert(swarm.groups[0].particles.every(p => !p.active), '重置后 A 组无激活粒子');
assert(swarm.groups[1].particles.every(p => !p.active), '重置后 B 组无激活粒子');
assert(weave.depositedEndpoints.length === 0, '重置后沉积端点为空');
assert(weave.lineAlpha === 0 && weave.meshProgress === 0, '重置后交织状态为初始');

/* ---- 测试 5：参数差异 ---- */
console.log('\n--- 测试 5：参数差异验证 ---');
const params2 = JSON.parse(JSON.stringify(params));
params2.events[0].energy = 0.9;
params2.events[0].dispersion = 0.9;
params2.interaction.weave = 0.1;
params2.interaction.settle = 0.1;
const swarm2 = new SwarmModule(params2, config);
const weave2 = new WeaveModule(params2, config, swarm2);
assert(weave2.pairCount < weave.pairCount, '低 weave 产生更少结对（' + weave2.pairCount + ' < ' + weave.pairCount + '）');
assert(weave2.depositedCount < weave.depositedCount, '低 settle 产生更少沉积');
assert(config.speedFor(0.9) > config.speedFor(0.25), '高 energy 速度更快');

/* ---- 测试 6：宿主通信协议 ---- */
console.log('\n--- 测试 6：宿主通信协议（postMessage） ---');

// 重新初始化模块用于宿主测试
const hHumanoid = new HumanoidModule(params, config);
const hSwarm = new SwarmModule(params, config);
const hWeave = new WeaveModule(params, config, hSwarm);
const hTimeline = new Timeline(config, { humanoid: hHumanoid, swarm: hSwarm, weave: hWeave });

let loadedParams = null;
let errorMsg = null;
const adapter = new HostAdapter({
  timeline: hTimeline,
  config,
  onLoad: (output) => { loadedParams = output; },
  onError: (msg) => { errorMsg = msg; },
});

assert(adapter.isHosted() === true, '检测到 iframe 环境');

// 模拟宿主发 hello
adapter._receive({ data: { channel: 'nesting', version: '0.1', type: 'hello' }, origin: 'http://127.0.0.1:8765' });
console.log('  收到 hello，已回应 ready');

// 模拟宿主发 load
const loadPayload = { output: params, source: 'manual-preset', duration: 60, reducedMotion: false };
adapter._receive({ data: { channel: 'nesting', version: '0.1', type: 'load', sessionId: 'test-session-1', payload: loadPayload }, origin: 'http://127.0.0.1:8765' });
assert(loadedParams !== null, '收到 load 并解析参数');
assert(loadedParams.events.length === 2, '加载的参数包含两段事件');
assert(adapter.sessionId === 'test-session-1', 'sessionId 正确记录');

// 模拟宿主发 frame（推进到 25 秒，playing）
adapter._receive({ data: { channel: 'nesting', version: '0.1', type: 'frame', sessionId: 'test-session-1', payload: { time: 25, phase: 'second', playing: true } }, origin: 'http://127.0.0.1:8765' });
const frameInfo = hTimeline.getPhaseInfo();
assert(Math.abs(frameInfo.time - 25) < 0.1, 'frame 跳转到 t=25s（实际 ' + frameInfo.time.toFixed(1) + '）');
assert(frameInfo.phase === 'enter_b', '阶段映射 second → enter_b（实际 ' + frameInfo.phase + '）');
assert(hTimeline.playing === true, 'playing = true');

// 模拟宿主发 frame（暂停）
adapter._receive({ data: { channel: 'nesting', version: '0.1', type: 'frame', sessionId: 'test-session-1', payload: { time: 30, phase: 'second', playing: false } }, origin: 'http://127.0.0.1:8765' });
assert(hTimeline.playing === false, '暂停后 playing = false');

// 模拟宿主发 reset
adapter._receive({ data: { channel: 'nesting', version: '0.1', type: 'reset', sessionId: 'test-session-1' }, origin: 'http://127.0.0.1:8765' });
const resetInfo = hTimeline.getPhaseInfo();
assert(resetInfo.phase === 'idle' && resetInfo.time === 0, 'reset 后回到初始状态');
assert(adapter.sessionId === null, 'reset 后 sessionId 清空');

// 测试无效参数报错
adapter._receive({ data: { channel: 'nesting', version: '0.1', type: 'load', sessionId: 'bad', payload: { output: { events: [] } } }, origin: 'http://127.0.0.1:8765' });
assert(errorMsg !== null, '无效参数触发错误回调');

/* ---- 测试 7：跨语言取整一致性（half-up） ---- */
console.log('\n--- 测试 7：跨语言取整一致性 ---');

assert(typeof config.roundHalfUp === 'function', 'config 暴露 roundHalfUp');
assert(config.roundHalfUp(22.5) === 23, 'roundHalfUp(22.5) = 23（Python 内置 round 为 22）');
assert(config.roundHalfUp(34.5) === 35, 'roundHalfUp(34.5) = 35');
assert(config.roundHalfUp(24.7) === 25, 'roundHalfUp(24.7) = 25');

// 48 × 0.46875 = 22.5 是 Py/JS 取整分歧点，两端必须都得 23
const halfParams = JSON.parse(JSON.stringify(params));
halfParams.interaction.weave = 0.46875;
halfParams.interaction.settle = 1.0;
const halfSwarm = new SwarmModule(halfParams, config);
const halfWeave = new WeaveModule(halfParams, config, halfSwarm);
assert(halfWeave.pairCount === 23, '边界结对数 = 23（实际 ' + halfWeave.pairCount + '）');
assert(halfWeave.depositedCount === 23, '边界沉积数 = 23（实际 ' + halfWeave.depositedCount + '）');

// 满参数：与 09 声音端 6 + 48 = 54 条事件对齐
const maxParams = JSON.parse(JSON.stringify(params));
maxParams.interaction.weave = 1.0;
maxParams.interaction.settle = 1.0;
const maxSwarm = new SwarmModule(maxParams, config);
const maxWeave = new WeaveModule(maxParams, config, maxSwarm);
assert(maxWeave.pairCount === 48, '满参数结对数 = 48');
assert(maxWeave.depositedCount === 48, '满参数沉积数 = 48（与声音端 deposit 事件数一致）');

console.log('\n========================================');
console.log('全部测试通过！通过 ' + passed + ' 项，失败 ' + failed + ' 项。');
console.log('视觉模块（web/visual/）无头运行验证完成。');
console.log('========================================');

if (failed > 0) process.exit(1);
