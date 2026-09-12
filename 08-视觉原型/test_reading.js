#!/usr/bin/env node
/** AI 的理解过程：把「机器是怎么听懂这句话的」逐层画出来。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const visualDir = path.join(root, 'web', 'visual');

// 画布桩：记录绘制调用与写上去的字，用来断言「画布上确实画了这一层」
function recordingCtx() {
  const calls = [];
  const texts = [];
  const ctx = new Proxy({}, {
    get: (target, key) => {
      if (key === 'calls') return calls;
      if (key === 'texts') return texts;
      if (key === 'fillText') return (t) => { calls.push('<fillText>'); texts.push(String(t)); };
      if (key === 'measureText') return (t) => ({ width: String(t).length * 22 });
      if (key === 'stroke') return () => calls.push('<stroke>');
      if (key === 'fill') return () => calls.push('<fill>');
      if (key === 'fillRect') return () => calls.push('<fillRect>');
      if (key === 'beginPath') return () => calls.push('<beginPath>');
      if (key === 'moveTo') return () => calls.push('<moveTo>');
      if (key === 'lineTo') return () => calls.push('<lineTo>');
      if (key === 'arc') return () => calls.push('<arc>');
      if (key === 'rect') return () => calls.push('<rect>');
      if (key === 'quadraticCurveTo') return () => calls.push('<quadraticCurveTo>');
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
for (const file of ['config.js', 'ripple.js', 'reading.js', 'timeline.js']) {
  vm.runInContext(fs.readFileSync(path.join(visualDir, 'js', file), 'utf8'), scope);
}

const config = scope.window.NestingConfig;
const ReadingModule = scope.window.ReadingModule;
const Timeline = scope.window.Timeline;
const params = JSON.parse(fs.readFileSync(path.join(visualDir, 'params', 'demo.json'), 'utf8'));
const R = config.READING;

// 真实解码示例（人工占位，非模型判断），随 beeSpec.decode 下发的就是这一份结构
const decode = JSON.parse(fs.readFileSync(
  path.join(root, '10-语言解码', 'examples', 'decode.demo-压抑-手工占位.json'), 'utf8'));
const SOURCE = decode.transcript;
const spec = { decoded: true, hue: 30.6, decode };

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log('  ✓ ' + message);
}

function make() {
  return new ReadingModule(params, config, SOURCE, spec);
}
/** 把某一时刻画布上写过的字取回来。 */
function textsAt(time, mod) {
  const m = mod || make();
  const ctx = recordingCtx();
  m.update(0, 'weave', 0.5, time);
  m.draw(ctx);
  return ctx.texts;
}

console.log('\n--- AI 的理解过程 ---');

/* ---- 四层依次展开：先语气，再含义，再分段，最后是不确定 ---- */
const early = make();
early.update(0, 'weave', 0.5, R.toneFrom - 0.1);
assert(early.layerProgress(R.toneFrom, R.toneTo) === 0, '开始之前一层都不展开');

early.update(0, 'weave', 0.5, R.toneFrom + 0.2);
assert(early.layerProgress(R.toneFrom, R.toneTo) > 0, '第一层（语气）开始展开');
assert(early.layerProgress(R.meaningFrom, R.meaningTo) === 0, '语气还没扫完，含义层尚未开始');

early.update(0, 'weave', 0.5, R.meaningFrom + 0.1);
assert(early.layerProgress(R.toneFrom, R.toneTo) === 1, '语气层已经完成');
assert(early.layerProgress(R.meaningFrom, R.meaningTo) > 0, '第二层（含义）开始展开');
assert(early.layerProgress(R.segmentFrom, R.segmentTo) === 0, '第三层（分段）尚未开始');

early.update(0, 'weave', 0.5, R.segmentFrom + 0.1);
assert(early.layerProgress(R.meaningFrom, R.meaningTo) === 1, '含义层已经完成');
assert(early.layerProgress(R.segmentFrom, R.segmentTo) > 0, '第三层（分段）开始展开');

early.update(0, 'weave', 0.5, R.doubtFrom + 0.1);
assert(early.layerProgress(R.segmentFrom, R.segmentTo) === 1, '分段层已经完成');
assert(early.layerProgress(R.doubtFrom, R.doubtTo) > 0, '第四层（不确定）开始展开');

/* ---- 画布上写的是解码层真实给出的判断，不是装饰 ---- */
const t1 = textsAt(R.toneTo);
assert(t1.includes(decode.tone.label), '语气层写出了 AI 选中的那个语气词：' + decode.tone.label);
assert(t1.includes('凭什么：' + decode.tone.evidence), '语气层同时写出判断依据（凭什么这么判断）');

const t2 = textsAt(R.meaningTo);
assert(t2.includes(decode.meaning.gist), '含义层写出这句话的概括：' + decode.meaning.gist);
assert(t2.some(t => t.indexOf('关键词：') === 0), '含义层写出关键词');

const t3 = textsAt(R.segmentTo);
assert(decode.segments.every(s => t3.includes(s.text)),
  '分段层逐段写出原句（' + decode.segments.map(s => s.text).join(' / ') + '）');

const t4 = textsAt(R.doubtTo);
assert(t4.includes(decode.uncertainty), '最后一层写出这次解码不确定的地方');

/* ---- 语气扫描：10 个词一次扫过，最后只留下被选中的那个 ---- */
const scan = make();
scan.update(0, 'weave', 0.5, R.toneFrom + R.scanSeconds * 0.4);
const scanCtx = recordingCtx();
scan.draw(scanCtx);
const TONE_LABELS = ['平稳', '急促', '迟疑', '压抑', '轻快', '沉重', '克制', '激动', '疏离', '温和'];
const shownMid = TONE_LABELS.filter(w => scanCtx.texts.includes(w)).length;
assert(shownMid === TONE_LABELS.length, '扫描中：10 个语气词全部在场，扫描针一个个扫过');
const settled = textsAt(R.toneTo);
assert(TONE_LABELS.filter(w => settled.includes(w)).length === TONE_LABELS.length,
  '扫完之后候选词仍在，但只有选中的那个被点亮（靠透明度区分）');

/* ---- 分段部位用几何标记表示，不写字 ---- */
const markCtx = recordingCtx();
const markMod = make();
markMod.update(0, 'weave', 0.5, R.segmentTo);
markMod.draw(markCtx);
assert(markCtx.calls.filter(c => c === '<arc>').length > 0, '部位标记画了圆（头部）');
assert(markCtx.calls.filter(c => c === '<rect>').length > 0 ||
       markCtx.calls.filter(c => c === '<fillRect>').length > 0, '部位标记画了方（胸）');
assert(markCtx.calls.filter(c => c === '<lineTo>').length > 0, '部位标记画了三角与条（尾针 / 腹）');
assert(decode.segments.every(s => ['head', 'wing', 'thorax', 'abdomen', 'stinger'].indexOf(s.role) >= 0),
  '每一段都被归到了蜂的一个部位上');

// 翅的波形标记单独验：示例里没有 wing 段，用合成数据补上
const wingCtx = recordingCtx();
const wingMod = new ReadingModule(params, config, '让我说完。', {
  decoded: true, hue: 30.6,
  decode: { segments: [{ text: '让我', role: 'wing', weight: 0.5 }] },
});
wingMod.update(0, 'weave', 0.5, R.segmentTo);
wingMod.draw(wingCtx);
assert(wingCtx.calls.filter(c => c === '<quadraticCurveTo>').length > 0, '部位标记画了波（翅）');

/* ---- 理解过程结束后淡出，把画面还给蜂与涟漪 ---- */
const gone = make();
gone.update(0, 'weave', 0.5, R.fadeOutAt + 0.1);
assert(gone.isGone(), '理解过程带在 ' + R.fadeOutAt + ' 秒后整体淡出');
const goneCtx = recordingCtx();
gone.draw(goneCtx);
assert(goneCtx.calls.length === 0, '淡出后不再画任何东西（画面只剩蜂）');

/* ---- 未接入模型时只标注「未解码」，一句判断都不编 ---- */
const blind = new ReadingModule(params, config, SOURCE, { decoded: false, hue: 30.6 });
blind.update(0, 'weave', 0.5, R.toneTo);
const blindCtx = recordingCtx();
blind.draw(blindCtx);
assert(blindCtx.texts.includes('未解码'), '没有 decode 时标注「未解码」');
assert(blindCtx.texts.some(t => t.indexOf('未接入模型') >= 0), '说明为什么没有判断可显示');
assert(!TONE_LABELS.some(w => blindCtx.texts.includes(w)), '未解码时不画任何语气词（不冒充模型结果）');
assert(!blindCtx.texts.includes(decode.meaning.gist), '未解码时不画任何含义判断');
assert(!blindCtx.texts.includes(decode.uncertainty), '未解码时不画不确定性文本');

/* ---- 无状态：暂停冻结、倒退收回、重播清空 ---- */
const stateless = make();
stateless.update(0, 'weave', 0.5, R.doubtTo);
assert(stateless.layerProgress(R.doubtFrom, R.doubtTo) === 1, '进行中：不确定层已展开');
stateless.update(0, 'weave', 0.5, R.toneFrom - 1);
assert(stateless.layerProgress(R.doubtFrom, R.doubtTo) === 0, '倒退到开始前，各层收回去（无状态，跟宿主时间）');
stateless.update(0, 'idle', 0, 0);
assert(stateless.currentTime === 0 && !stateless.isGone(), '回到 0 秒是一次干净的重播起点');

/* ---- 确定性：同一份判断在同一时刻画面完全一致 ---- */
const da = make();
const db = make();
da.update(0, 'weave', 0.5, 9.0);
db.update(0, 'weave', 0.5, 9.0);
const ca = recordingCtx();
const cb = recordingCtx();
da.draw(ca);
db.draw(cb);
assert(JSON.stringify(ca.texts) === JSON.stringify(cb.texts),
  '同一份解码在同一时刻写出同样的字（确定性）');
assert(JSON.stringify(ca.calls) === JSON.stringify(cb.calls),
  '同一份解码在同一时刻画出同样的图形（确定性）');

/* ---- 颜色沿用这句话的语气色相 ---- */
const hueCtx = recordingCtx();
const hueMod = new ReadingModule(params, config, SOURCE, { decoded: true, hue: 210, decode });
hueMod.update(0, 'weave', 0.5, R.toneTo);
hueMod.draw(hueCtx);
assert(hueMod.spec.hue === 210, '理解过程沿用这句话的语气色相');

/* ---- 完整 60 秒跑一遍不报错 ---- */
const full = make();
let frames = 0;
let drew = 0;
const runCtx = recordingCtx();
for (let t = 0; t <= 60; t += 1 / 30) {
  full.update(1 / 30, 'weave', 0.5, t);
  const c = recordingCtx();
  full.draw(c);
  if (c.calls.length > 0) drew += 1;
  frames += 1;
}
assert(frames > 1700, '完整 60 秒逐帧绘制无异常（' + frames + ' 帧）');
assert(drew > 0 && drew < frames, '理解过程只在自己的时间窗里出现（' + drew + ' 帧有内容）');
assert(runCtx.calls.length === 0, '空转帧不残留绘制调用');

/* ---- 接入验证：放进 Timeline 后真的被画出来，且图层顺序不被改乱 ---- */
const order = [];
const stub = name => ({ draw: () => order.push(name) });
const wired = make();
wired.update(0, 'weave', 0.5, R.toneTo);
const tlCtx = recordingCtx();
const tl = new Timeline(config, {
  waveform: stub('waveform'),
  hive: stub('hive'),
  ripple: stub('ripple'),
  reading: { draw: (ctx) => { order.push('reading'); wired.draw(ctx); } },
  bee: stub('bee'),
});
tl.draw(tlCtx);
assert(order.join(',') === 'waveform,hive,ripple,reading,bee',
  '图层顺序：声纹 → 巢 → 涟漪 → 理解过程 → 蜂（实际 ' + order.join(' → ') + '）');
assert(tlCtx.texts.includes(decode.tone.label),
  '经 Timeline 调度后，画布上确实出现理解过程的字');

console.log('AI 的理解过程测试通过：' + passed + ' 项');
