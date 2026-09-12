#!/usr/bin/env node
/** 文字结构蜂 MVP：来源文字可追溯、无人体依赖、时间线可完整绘制。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const visualDir = path.join(root, 'web', 'visual');
// 画布桩：渐变对象要能 addColorStop，否则真实绘制里的 createRadialGradient 会炸
const noopCtx = new Proxy({}, {
  get: (target, key) => {
    if (key === 'createRadialGradient' || key === 'createLinearGradient') {
      return () => ({ addColorStop() {} });
    }
    return () => {};
  },
  set: () => true,
});
const scope = vm.createContext({
  window: {},
  Math,
  console,
});
for (const file of ['config.js', 'bee.js']) {
  vm.runInContext(fs.readFileSync(path.join(visualDir, 'js', file), 'utf8'), scope);
}

const config = scope.window.NestingConfig;
const BeeModule = scope.window.BeeModule;
const params = JSON.parse(fs.readFileSync(path.join(visualDir, 'params', 'demo.json'), 'utf8'));
const bee = new BeeModule(params, config, '你可以慢慢说。');
let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log('  ✓ ' + message);
}

console.log('\n--- 文字结构蜂 MVP ---');
assert(bee.characters.join('') === '你可以慢慢说。', '蜂体单元保留来源文字顺序');
assert(bee.segments.length === 7, '每个非空字符生成一个结构单元');
bee.update(0, 'idle', 0, 0);
bee.draw(noopCtx);
assert(bee.visibleCount >= 1, '等待阶段保留文字种子');
bee.update(1 / 60, 'enter_a', 0.5, 14);
bee.draw(noopCtx);
const growingCount = bee.visibleCount;
assert(growingCount > 1, '进入阶段按文字顺序生长多个单元');
bee.update(1 / 60, 'weave', 0.5, 40);
bee.draw(noopCtx);
assert(bee.visibleCount >= growingCount, '结构阶段不会丢失已生成文字单元');
bee.update(1 / 60, 'hold', 1, 60);
bee.draw(noopCtx);
assert(bee.visibleCount === bee.segments.length, '留存阶段形成完整文字结构蜂');
bee.reset();
assert(bee.currentTime === 0 && bee.visibleCount === 0, '重置后清空生长状态');

/* ---- 拆解阶段（整句 → 单元 → 蜂体）---- */
function recordingCtx() {
  const texts = [];
  const marks = [];
  const ctx = new Proxy({}, {
    get: (target, key) => {
      if (key === 'calls') return texts;        // 兼容旧调用：只看文字
      if (key === 'texts') return texts;
      if (key === 'marks') return marks;
      if (key === 'fillText') return text => texts.push(String(text));
      // 笔画轮廓改用 path API；用占位符记录调用，方便断言「画布上有笔画绘制」
      if (key === 'stroke') return () => marks.push('stroke');
      if (key === 'beginPath') return () => marks.push('beginPath');
      if (key === 'moveTo') return () => marks.push('moveTo');
      if (key === 'lineTo') return () => marks.push('lineTo');
      if (key === 'arc') return () => marks.push('arc');
      if (key === 'fill') return () => marks.push('fill');
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => {};
    },
    set: () => true,
  });
  return ctx;
}
const DECOMPOSE = config.DECOMPOSE;
const sentence = new BeeModule(params, config, '你可以慢慢说。');
sentence.update(0, 'idle', 0, 1.2);
const sentenceCtx = recordingCtx();
sentence.draw(sentenceCtx);
assert(sentence.flight === 0, '整句阶段还没有开始拆解');
assert(sentenceCtx.calls.join('') === '你可以慢慢说。', '整句阶段先显示完整一句话');

sentence.update(1 / 60, 'enter_a', 0.5, 3.5);
assert(sentence.flight > 0 && sentence.flight < 1, '拆解阶段进度介于整句与蜂体之间');
const unitMid = sentence._unitPlace(0, sentence.segments.length, 200, 20, 160, 0);
const sentencePos = sentence._sentencePos(0, sentence.segments.length, 160);
assert(Math.abs(unitMid.y - sentencePos.y) > 1, '单元已离开整句位置，正在飞向蜂体');

sentence.update(1 / 60, 'enter_b', 1, 30);
const unitEnd = sentence._unitPlace(0, sentence.segments.length, 200, 20, 160, 0);
assert(Math.abs(unitEnd.y - sentencePos.y) > Math.abs(unitMid.y - sentencePos.y), '飞入过程中越来越接近蜂体位置');

/* ---- 语气/含义派生的蜂体规格 ---- */
const neutral = new BeeModule(params, config, '你可以慢慢说。');
assert(neutral.spec.decoded === false, '缺少派生规格时标记为未解码');
const neutralCtx = recordingCtx();
neutral.update(1 / 60, 'hold', 1, 60);
neutral.draw(neutralCtx);
assert(neutralCtx.calls.some(text => text.includes('未解码')), '未解码时画面必须标注来源');

const decoded = new BeeModule(params, config, '你可以慢慢说。', {
  wingbeatHz: 3.1, tension: 0.9, spacing: 1.3, hue: 210, posture: 'open',
  bodyScale: 1.15, decoded: true, caption: '语气：平稳 · 方向：向外',
});
const decodedCtx = recordingCtx();
decoded.update(1 / 60, 'hold', 1, 60);
decoded.draw(decodedCtx);
assert(decodedCtx.calls.some(text => text.includes('语气：平稳')), '解码成功时画面显示来源与语气');
assert(!decodedCtx.calls.some(text => text.includes('未解码')), '解码成功时不再显示未解码标注');
assert(decoded.spec.hue === 210 && decoded.spec.posture === 'open', '蜂体规格被模块采用');

// 拆解必须已经完成，否则比较的是整句位置，会得到假通过
const openSpec = new BeeModule(params, config, '你可以慢慢说。', { posture: 'open', decoded: true });
const curlSpec = new BeeModule(params, config, '你可以慢慢说。', { posture: 'curl', decoded: true });
for (const module of [decoded, openSpec, curlSpec]) {
  module.update(1 / 60, 'hold', 1, 60);
  assert(module.flight === 1, '留存阶段拆解已经完成');
}
const openPlace = openSpec._unitPlace(6, openSpec.segments.length, 200, 20, 160, 0);
const curlPlace = curlSpec._unitPlace(6, curlSpec.segments.length, 200, 20, 160, 0);
assert(openPlace.y !== curlPlace.y, '姿态（向内收 / 向外张）改变单元落点');

// 间距规格现在拉伸腹部：说得越慢，腹节越松，带与带之间越开
const wideSpacing = new BeeModule(params, config, '你可以慢慢说。', { spacing: 1.3, decoded: true });
const narrowSpacing = new BeeModule(params, config, '你可以慢慢说。', { spacing: 0.7, decoded: true });
wideSpacing.update(1 / 60, 'hold', 1, 60);
narrowSpacing.update(1 / 60, 'hold', 1, 60);
const wide = wideSpacing._unitPlace(6, wideSpacing.segments.length, 200, 0, 160, 0);
const narrow = narrowSpacing._unitPlace(6, narrowSpacing.segments.length, 200, 0, 160, 0);
// 腹部起点固定、长度随间距变长，所以末节带会落在更靠右的位置
assert(wide.x > narrow.x, '间距越大，腹部越长，末节带越靠右');
assert(wideSpacing._layout().abdomen.rx > narrowSpacing._layout().abdomen.rx, '间距规格改变腹部长度');
/* ---- 会徽风笔画轮廓 + 原句填充 ---- */
const shape = new BeeModule(params, config, '你不要给别人添麻烦。', { decoded: true });
assert(shape.strokes.length === shape.segments.length, '每个字符都取到一个笔画');
assert(shape.strokes.every(item => typeof item.code === 'string' && item.code.length > 0), '笔画代号非空');
assert(shape.strokes[0].code === 'p' && shape.strokes[0].exact === true, '表内字取到笔画（你 → 撇）');
assert(shape.strokes[6].code === 'd', '表内字取到笔画（添 → 点）');
assert(shape.strokes.every(item => item.kind && ['line', 'dot', 'hook', 'bend', 'arc'].includes(item.kind)),
  '笔画都映射到 5 种合法 kind 之一');
const outside = new BeeModule(params, config, '囧囧', { decoded: true });
assert(outside.strokes.every(item => item.exact === false), '表外字走确定性回退');
assert(outside.strokes[0].code === outside.strokes[1].code, '同一个字每次都取到同一个笔画（确定）');

const layout = shape._layout();
const outline = shape._outlinePoints(layout, 1, 1);
assert(outline.length >= 30, '轮廓取样点足够密（' + outline.length + ' 个点）');
assert(outline.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.angle)),
  '轮廓点坐标与切线角都是有限数');

const places = shape._fillLayout(layout);
assert(places.length === shape.segments.length, '内部填充为每个字符给出落点');
assert(places.every(place => place && Number.isFinite(place.x) && Number.isFinite(place.y) && place.size > 0),
  '填充落点有效');
const inside = places.every(place => Math.abs(place.x - layout.abdomen.cx) <= layout.abdomen.rx * 1.05);
assert(inside, '填充落点都在腹部宽度范围内（会被裁在轮廓里）');

// 轮廓用笔画、内部用原字：画布上两者都应出现
const shapeCtx = recordingCtx([]);
shape.update(1 / 60, 'hold', 1, 60);
shape.draw(shapeCtx);
const drawn = shapeCtx.texts;
const drawnMarks = shapeCtx.marks;
assert(drawnMarks.filter(call => call === 'stroke').length > 5, '画布上有笔画轮廓 stroke 调用（>5 次）');
assert(drawnMarks.filter(call => call === 'beginPath').length > 5, '画布上有 beginPath 调用（每个笔画一个）');
assert(drawnMarks.filter(call => call === 'arc').length > 0, '画布上有 arc 调用（点/弧笔画）');
assert(drawnMarks.filter(call => call === 'moveTo').length > 0, '画布上有 moveTo 调用');
assert(drawn.includes('你') && drawn.includes('麻'), '画布上出现原句的字（内部填充）');
assert(drawn.some(text => text.includes('你不要给别人添麻烦。')), '画布上保留来源原句');

// 多句画笔画：确保 _drawStroke 在多种 kind 下都不出错
for (const sample of ['你好世界。', '听妈妈的话，别让她一个人。', '囧囧']) {
  const sampleBee = new BeeModule(params, config, sample, { decoded: true });
  const sampleCtx = recordingCtx();
  sampleBee.update(1 / 60, 'hold', 1, 60);
  sampleBee.draw(sampleCtx);
  assert(sampleCtx.marks.filter(call => call === 'stroke').length > 0,
    `句「${sample}」画笔画没炸`);
}

/* ---- 群蜂：拉远后出现其他语言的蜂 ---- */
const swarmTexts = [
  { transcript: '快点，来不及了！', beeSpec: { hue: 54.56, posture: 'open', bodyScale: 1.03, spacing: 0.78, tension: 0.71, wingbeatHz: 3.076 }, decoded: false },
  { transcript: '今天天气很好。', beeSpec: { hue: 35.76, posture: 'level', bodyScale: 0.94, spacing: 1.0, tension: 0.26, wingbeatHz: 1.996 }, decoded: false },
];
const swarm = new BeeModule(Object.assign({}, params, { bees: swarmTexts }), config, '你不要给别人添麻烦。', { decoded: false });
assert(swarm.others.length === 2, '两只「别的蜂」被加入（主蜂自己不算）');
assert(swarm.others[0].text === '快点，来不及了！', '别的蜂保留自己的原句');
assert(swarm.others[0].spec.hue === 54.56 && swarm.others[1].spec.hue === 35.76, '别的蜂保留自己的语气色相');
assert(swarm.others.every(bee => bee.strokes.length === bee.segments.length), '别的蜂也有自己的笔画轮廓');
assert(swarm.others[0].world.x !== swarm.others[1].world.x, '两只蜂位置不同（确定性布局）');

const selfOnly = new BeeModule(Object.assign({}, params, { bees: [{ transcript: '你不要给别人添麻烦。', beeSpec: {} }] }), config, '你不要给别人添麻烦。');
assert(selfOnly.others.length === 0, '与主蜂同一句的条目不重复出现');

swarm.update(1 / 60, 'hold', 1, 14);
assert(swarm.bornOthers().length === 0, '14 秒时还没有别的蜂（第一只 15 秒才出现）');
swarm.update(1 / 60, 'hold', 1, 16);
assert(swarm.bornOthers().length === 1, '16 秒时出现第一只别的蜂');
swarm.update(1 / 60, 'hold', 1, 19);
assert(swarm.bornOthers().length === 2, '19 秒时两只都出现');
assert(swarm.others[0].growth === 1, '出现过渡完成后 growth 到 1');
const swarmCtx = recordingCtx([]);
swarm.draw(swarmCtx);
assert(swarmCtx.calls.includes('快') && swarmCtx.calls.includes('今'), '别的蜂的内部也填着它们自己的原句');

swarm.reset();
assert(swarm.others.every(bee => bee.growth === 0), '重置后别的蜂也清空');

console.log(`文字结构蜂测试通过：${passed} 项`);
