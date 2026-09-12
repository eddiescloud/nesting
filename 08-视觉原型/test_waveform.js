#!/usr/bin/env node
/** 声纹模块：只消费 score，不编造波形；包络必须与声音运行时一致。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const visualDir = path.join(root, 'web', 'visual');
const score = JSON.parse(fs.readFileSync(path.join(visualDir, 'params', 'score.demo.json'), 'utf8'));

function makeScope() {
  return vm.createContext({ window: {}, Math, console });
}
function loadWaveform(scope) {
  vm.runInContext(fs.readFileSync(path.join(visualDir, 'js', 'config.js'), 'utf8'), scope);
  vm.runInContext(fs.readFileSync(path.join(visualDir, 'js', 'waveform.js'), 'utf8'), scope);
  return { config: scope.window.NestingConfig, Waveform: scope.window.WaveformModule };
}
function recordingCtx(calls) {
  return new Proxy({}, {
    get: (target, key) => {
      if (key === 'calls') return calls;
      if (key === 'arc') return (...args) => calls.push(['arc', ...args]);
      if (key === 'stroke') return () => calls.push(['stroke']);
      if (key === 'fill') return () => calls.push(['fill']);
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => {};
    },
    set: () => true,
  });
}

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log('  ✓ ' + message);
}

async function main() {
  console.log('\n--- 声纹模块 ---');
  const { config, Waveform } = loadWaveform(makeScope());

  const silent = new Waveform({}, config);
  silent.update(1 / 60, 'opening', 0.5, 10);
  assert(silent.level === 0, '没有 score 时不编造响度（只画基线）');
  const silentCtx = recordingCtx([]);
  silent.draw(silentCtx);
  assert(true, '没有 score 时绘制不报错');

  const wave = new Waveform({ score }, config);
  assert(wave.layers.length === score.layers.length, '消费 score 的全部层');

  wave.update(1 / 60, 'opening', 0, 4);
  const levelAt4 = wave.level;
  assert(levelAt4 > 0, '开场就有底噪层（不会完全静止）');

  wave.update(1 / 60, 'weave', 0.5, 30);
  const levelAt30 = wave.level;
  assert(levelAt30 > levelAt4, '层叠加后响度上升（30s 高于 4s）');

  wave.update(1 / 60, 'residual', 1, 58);
  const levelAt58 = wave.level;
  assert(levelAt58 < levelAt30, '结尾层收束，响度下降');

  // 与 score 手算的独立核对：level = 各层 gain × 包络之和 × master_gain
  const manual = (() => {
    let peak = 0;
    for (const layer of score.layers) {
      if (30 < layer.start || 30 >= layer.end) continue;
      let env = 1;
      if (30 < layer.start + 1.5) env *= (30 - layer.start) / 1.5;
      if (layer.kind === 'texture' && 30 > 47) env *= Math.max(0, (layer.end - 30) / (layer.end - 47));
      peak += layer.gain * env;
    }
    return Math.min(1, peak * score.master_gain);
  })();
  assert(Math.abs(levelAt30 - manual) < 1e-9, '响度与 score 手算值一致（' + levelAt30.toFixed(4) + '）');

  // 确定性
  const a = new Waveform({ score }, config);
  const b = new Waveform({ score }, config);
  for (const t of [3, 12, 33, 50]) { a.update(1 / 60, 'x', 0, t); b.update(1 / 60, 'x', 0, t); }
  assert(a._waveAt(50, 3, a.level) === b._waveAt(50, 3, b.level), '同一时刻的波形完全确定（无随机数）');

  // 重置
  a.reset();
  assert(a.time === 0 && a.level === 0 && a.anim === 0, '重置后清空时间、响度与动画相位');

  // 沉积事件圆环
  const calls = [];
  const ctx = recordingCtx(calls);
  const ringing = new Waveform({ score }, config);
  const deposit = score.events.find(event => event.cue === 'deposit');
  ringing.update(1 / 60, 'settle', 0.2, deposit.t + 0.2);
  ringing.draw(ctx);
  // 圆环半径 > 5，颗粒半径固定 1.6，据此区分
  const isRing = call => call[0] === 'arc' && call[3] > 5;
  assert(calls.filter(isRing).length === 1, '沉积事件到点后画出扩散圆环');
  const quiet = new Waveform({ score }, config);
  quiet.update(1 / 60, 'calm', 0, 3);
  const quietCalls = [];
  quiet.draw(recordingCtx(quietCalls));
  assert(quietCalls.filter(isRing).length === 0, '没有事件时刻不画圆环');
  assert(quietCalls.filter(call => call[0] === 'arc').length === 0, '只有铺底声时不画颗粒');
  const busy = new Waveform({ score }, config);
  busy.update(1 / 60, 'weave', 0.5, 30);
  const busyCalls = [];
  busy.draw(recordingCtx(busyCalls));
  assert(busyCalls.filter(call => call[0] === 'arc' && call[3] < 5).length > 0, '纹理层活跃时才出现颗粒');

  // 跨模块守卫：包络必须与声音运行时逐值一致
  const audio = await import('file://' + path.join(root, 'web', 'audio', 'audio.mjs'));
  let maxDiff = 0;
  for (const layer of score.layers) {
    for (let t = 0; t <= 60; t += 0.5) {
      const mine = Waveform.layerEnvelope(layer, t);
      const theirs = audio.layerEnvelope(layer, t);
      maxDiff = Math.max(maxDiff, Math.abs(mine - theirs));
    }
  }
  assert(maxDiff === 0, '层包络与 web/audio/audio.mjs 逐值一致（最大偏差 ' + maxDiff + '）');

  // 背景覆盖：波形必须铺满画面，而不是挤在一条带上
  const spanCalls = [];
  const spanCtx = new Proxy({}, {
    get: (target, key) => {
      if (key === 'moveTo' || key === 'lineTo') return (x, y) => spanCalls.push(y);
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => {};
    },
    set: () => true,
  });
  const spanning = new Waveform({ score }, config);
  spanning.update(1 / 60, 'weave', 0.5, 30);
  spanning.draw(spanCtx);
  const minY = Math.min.apply(null, spanCalls);
  const maxY = Math.max.apply(null, spanCalls);
  assert(minY < config.DESIGN_HEIGHT * 0.2, '波形背景覆盖到画面上部（minY=' + Math.round(minY) + '）');
  assert(maxY > config.DESIGN_HEIGHT * 0.8, '波形背景覆盖到画面下部（maxY=' + Math.round(maxY) + '）');

  // 绘制顺序：声纹是背景，必须画在蜂之前；这条守卫防的是「有 bee 就 return」那类回归
  const order = [];
  const timelineScope = makeScope();
  for (const file of ['config.js', 'waveform.js', 'bee.js', 'timeline.js']) {
    vm.runInContext(fs.readFileSync(path.join(visualDir, 'js', file), 'utf8'), timelineScope);
  }
  const T = timelineScope.window.Timeline;
  const cfg = timelineScope.window.NestingConfig;
  const timeline = new T(cfg, {
    waveform: { update() {}, draw() { order.push('waveform'); }, reset() {} },
    bee: { update() {}, draw() { order.push('bee'); }, reset() {} },
  });
  // 时间线现在会套一层视野缩放，桩需要支持 save/translate/scale/restore
  const transformCalls = [];
  const fakeCtx = new Proxy({}, {
    get: (target, key) => {
      if (['save', 'restore', 'translate', 'scale', 'rotate'].includes(key)) {
        return (...args) => transformCalls.push([key].concat(args));
      }
      return () => {};
    },
    set: () => true,
  });
  timeline.seek(30);
  timeline.draw(fakeCtx);
  assert(order.join(',') === 'waveform,bee', '绘制顺序为「先声纹后蜂」（实际 ' + order.join(',') + '）');
  const scaled = transformCalls.find(call => call[0] === 'scale');
  assert(scaled && Math.abs(scaled[1] - timeline.cameraScale(30)) < 1e-9,
    '蜂这一层按相机比例缩放（t=30 时 ' + timeline.cameraScale(30).toFixed(3) + '）');
  assert(timeline.cameraScale(10) === 1, 'holdUntil（现 13 秒）前是近景（scale=1）');
  assert(Math.abs(timeline.cameraScale(40) - cfg.CAMERA.endScale) < 1e-9,
    '拉远后到达配置的最远值（scale=' + timeline.cameraScale(40).toFixed(3) + '）');

  console.log('\n声纹测试通过：' + passed + ' 项');
}

main().catch(error => {
  console.error('\n声纹测试失败：' + error.message);
  process.exit(1);
});
