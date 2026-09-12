#!/usr/bin/env node
/** 语言传播涟漪：一句话说出口 → 从蜂体向外扩散 → 到边缘消失，收不回来。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const visualDir = path.join(root, 'web', 'visual');

// 画布桩：记录绘制调用，用来断言「画布上确实画了波」
function recordingCtx() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, key) => {
      if (key === 'calls') return calls;
      if (key === 'stroke') return () => calls.push('<stroke>');
      if (key === 'fill') return () => calls.push('<fill>');
      if (key === 'beginPath') return () => calls.push('<beginPath>');
      if (key === 'moveTo') return () => calls.push('<moveTo>');
      if (key === 'lineTo') return () => calls.push('<lineTo>');
      if (key === 'arc') return () => calls.push('<arc>');
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => {};
    },
    set: () => true,
  });
  return ctx;
}

const noopCtx = recordingCtx();

const scope = vm.createContext({ window: {}, Math, console });
for (const file of ['config.js', 'ripple.js', 'timeline.js']) {
  vm.runInContext(fs.readFileSync(path.join(visualDir, 'js', file), 'utf8'), scope);
}

const config = scope.window.NestingConfig;
const RippleModule = scope.window.RippleModule;
const Timeline = scope.window.Timeline;
const params = JSON.parse(fs.readFileSync(path.join(visualDir, 'params', 'demo.json'), 'utf8'));
const RIPPLE = config.RIPPLE;

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log('  ✓ ' + message);
}

console.log('\n--- 语言传播涟漪 ---');

/* ---- 触发时机：话没说出口就没有波 ---- */
const ripple = new RippleModule(params, config, '你不要给别人添麻烦。', { decoded: true });
ripple.update(0, 'idle', 0, 0);
assert(ripple.visibleWaves().length === 0, '一开始还没有波（话还没说出口）');
ripple.update(0, 'idle', 0, RIPPLE.firstAt - 0.1);
assert(ripple.visibleWaves().length === 0, '第一圈发出前没有波');

ripple.update(0, 'enter_a', 0.5, RIPPLE.firstAt + 0.5);
assert(ripple.visibleWaves().length === 1, '蜂体成形后推出第一圈');

ripple.update(0, 'enter_a', 0.5, RIPPLE.firstAt + RIPPLE.gap + 0.5);
assert(ripple.visibleWaves().length === 2, '第二圈按间隔推出');
ripple.update(0, 'weave', 0.5, RIPPLE.firstAt + RIPPLE.gap * 2 + 0.5);
assert(ripple.visibleWaves().length === 3, '第三圈按间隔推出');

/* ---- 扩散：越传越远，到边缘消失 ---- */
ripple.update(0, 'weave', 0.5, RIPPLE.firstAt + 0.5);
const r0 = ripple.radiusAt(0);
ripple.update(0, 'weave', 0.5, RIPPLE.firstAt + 1.5);
assert(ripple.radiusAt(0) > r0, '波随时间向外扩散（' + r0.toFixed(0) + ' → ' + ripple.radiusAt(0).toFixed(0) + ' px）');

const escaped = new RippleModule(params, config, '你不要给别人添麻烦。', { decoded: true });
escaped.update(0, 'hold', 1, RIPPLE.firstAt + 0.2);
assert(escaped.radiusAt(0) !== null && escaped.radiusAt(0) < RIPPLE.maxRadius,
  '刚发出时波还在画面里');
escaped.update(0, 'hold', 1, RIPPLE.firstAt + 40);
assert(escaped.radiusAt(0) === null, '扩散到画面边缘之外后消失（收不回来）');

/* ---- 波速由语气强度派生：说得越激动，传得越快 ---- */
// wingbeatHz = 1.6 + 1.8 × 语气强度，是强度在蜂体规格上的代理
const calm = new RippleModule(params, config, '你可以慢慢说。', { wingbeatHz: 1.6, tension: 0.5 });
const urgent = new RippleModule(params, config, '快点，来不及了！', { wingbeatHz: 3.4, tension: 0.5 });
assert(urgent.speed > calm.speed, '语气越激动，波速越快（' + calm.speed.toFixed(0) + ' → ' + urgent.speed.toFixed(0) + ' px/s）');
calm.update(0, 'hold', 1, RIPPLE.firstAt + 1);
urgent.update(0, 'hold', 1, RIPPLE.firstAt + 1);
assert(urgent.radiusAt(0) > calm.radiusAt(0), '同一时刻，激动的话传得更远');

/* ---- 强度由分量派生：分量越重，波越粗越久 ---- */
const light = new RippleModule(params, config, 'x', { wingbeatHz: 2.2, tension: 0.1 });
const heavy = new RippleModule(params, config, 'x', { wingbeatHz: 2.2, tension: 0.9 });
assert(heavy.strength > light.strength, '分量越重，波越强（' + light.strength.toFixed(2) + ' → ' + heavy.strength.toFixed(2) + '）');

/* ---- 波的颜色来自这句话的语气色相 ---- */
const warm = new RippleModule(params, config, 'x', { hue: 33, decoded: true });
const cool = new RippleModule(params, config, 'x', { hue: 210, decoded: true });
assert(warm.spec.hue === 33 && cool.spec.hue === 210, '波沿用这句话的语气色相');

/* ---- 无状态：暂停冻结、倒退收回、重播清空 ---- */
const stateless = new RippleModule(params, config, '你不要给别人添麻烦。', { decoded: true });
stateless.update(0, 'hold', 1, RIPPLE.firstAt + 3);
assert(stateless.visibleWaves().length > 0, '30 秒左右画面上有波');
stateless.update(0, 'idle', 0, 2);
assert(stateless.visibleWaves().length === 0, '倒退到说出口之前，波就收回去了（无状态，跟宿主时间）');

stateless.update(0, 'hold', 1, RIPPLE.firstAt + 3);
stateless.reset();
assert(stateless.currentTime === 0 && stateless.visibleWaves().length === 0, '重播清空所有波');

/* ---- 确定性：同一份输入在同一时刻画面完全一致 ---- */
const a = new RippleModule(params, config, '你不要给别人添麻烦。', { wingbeatHz: 2.64, tension: 0.7, hue: 30.6 });
const b = new RippleModule(params, config, '你不要给别人添麻烦。', { wingbeatHz: 2.64, tension: 0.7, hue: 30.6 });
a.update(0, 'hold', 1, 22);
b.update(0, 'hold', 1, 22);
assert(JSON.stringify(a.visibleWaves()) === JSON.stringify(b.visibleWaves()),
  '同一句话在同一时刻得到同一组波（确定性）');

/* ---- 同时可见的波不超过设定圈数 ---- */
const many = new RippleModule(params, config, '你不要给别人添麻烦。', { wingbeatHz: 1.6 });
many.update(0, 'hold', 1, RIPPLE.firstAt + RIPPLE.gap * 0.5);
assert(many.visibleWaves().length <= RIPPLE.count, '同时可见的波不超过 ' + RIPPLE.count + ' 圈');

/* ---- 画布上确实画了波（短笔画：线段 / 点 / 弧） ---- */
const drawCtx = recordingCtx();
const drawn = new RippleModule(params, config, '你不要给别人添麻烦。', { decoded: true, hue: 38 });
drawn.update(0, 'hold', 1, RIPPLE.firstAt + 2.5);
drawn.draw(drawCtx);
const marks = drawCtx.calls;
assert(marks.filter(c => c === '<beginPath>').length > 0, '画布上有 beginPath（每个短笔画一条路径）');
assert(marks.filter(c => c === '<stroke>').length > 0, '画布上有 stroke（线段与弧）');
assert(marks.filter(c => c === '<fill>').length > 0, '画布上有 fill（点笔画）');
assert(marks.filter(c => c === '<arc>').length > 0, '画布上有 arc（点与弧笔画）');

/* ---- 没到时间就不画，避免每帧空转 ---- */
const idleCtx = recordingCtx();
const idleRipple = new RippleModule(params, config, 'x', {});
idleRipple.update(0, 'idle', 0, 1);
idleRipple.draw(idleCtx);
assert(idleCtx.calls.length === 0, '还没说出口时不画任何东西');

/* ---- 完整 60 秒跑一遍不报错 ---- */
const full = new RippleModule(params, config, '你不要给别人添麻烦。', { decoded: true });
let frames = 0;
for (let t = 0; t <= 60; t += 1 / 30) {
  full.update(1 / 30, 'weave', 0.5, t);
  full.draw(noopCtx);
  frames += 1;
}
assert(frames > 1700, '完整 60 秒逐帧绘制无异常（' + frames + ' 帧）');

/* ---- 接入验证：放进 Timeline 后真的被画出来，且图层顺序不被改乱 ---- */
const order = [];
const stub = name => ({ draw: () => order.push(name) });
const wired = new RippleModule(params, config, '你不要给别人添麻烦。', { decoded: true, hue: 38 });
wired.update(0, 'hold', 1, RIPPLE.firstAt + 2.5);
const tlCtx = recordingCtx();
const tl = new Timeline(config, {
  waveform: stub('waveform'),
  hive: stub('hive'),
  ripple: { draw: (ctx) => { order.push('ripple'); wired.draw(ctx); } },
  bee: stub('bee'),
});
tl.draw(tlCtx);
assert(order.join(',') === 'waveform,hive,ripple,bee',
  '图层顺序：声纹 → 巢 → 涟漪 → 蜂（实际 ' + order.join(' → ') + '）');
assert(tlCtx.calls.filter(c => c === '<stroke>').length > 0,
  '经 Timeline 调度后，画布上确实出现涟漪笔画');

console.log('语言传播涟漪测试通过：' + passed + ' 项');
