'use strict';
// 蜂巢模块（巢由语言筑成）测试：布局梨形与确定性、巢位取用、房内字可追溯、
// 过渡节奏、宿主时钟（暂停/回退/重播）、时间线绘制顺序。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..', 'web', 'visual', 'js');
const ctxStub = () => ({ save(){}, restore(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){},
  fill(){}, arc(){}, ellipse(){}, clip(){}, fillText(){}, drawImage(){}, closePath(){},
  translate(){}, scale(){}, rotate(){} });
const scope = vm.createContext({ window: {}, console, URL, Math,
  document: { createElement: () => ({ width: 0, height: 0, getContext: ctxStub }) } });
for (const name of ['config.js', 'hive.js', 'timeline.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), scope);
const { HiveModule: Hive, NestingConfig: config, Timeline } = scope.window;

const hive = new Hive({}, config);
assert.equal(hive.ready, true, '无外部素材：构造即可用');
assert(hive.cells.length >= 40 && hive.cells.length <= 140, '巢房数量落在可辨识区间');
for (const cell of hive.cells) {
  assert(cell.x >= hive.rect.x && cell.x <= hive.rect.x + hive.rect.width, '巢房不超出巢脾横向');
  assert(cell.y >= hive.rect.y && cell.y <= hive.rect.y + hive.rect.height, '巢房不超出巢脾纵向');
}
// 水滴形悬垂轮廓：中部带宽于顶部与底部
const bands = [0, 1, 2, 3, 4].map(() => ({ min: Infinity, max: -Infinity }));
for (const cell of hive.cells) {
  const band = Math.min(4, Math.floor((cell.y - hive.rect.y) / hive.rect.height * 5));
  bands[band].min = Math.min(bands[band].min, cell.x);
  bands[band].max = Math.max(bands[band].max, cell.x);
}
const span = b => (b.max === -Infinity ? 0 : b.max - b.min);
assert(span(bands[2]) > span(bands[0]) && span(bands[2]) > span(bands[4]), '中部巢房带宽于顶部与底部');
assert(span(bands[0]) > 0 && span(bands[4]) > 0, '顶部与底部仍有巢房（收尖而非截断）');
// 确定性：两次构造逐格一致
assert.deepEqual(new Hive({}, config).cells, hive.cells, '巢房布局确定性一致');
// 从巢心向外排序：距离单调不减
for (let i = 1; i < hive.cells.length; i += 1) assert(hive.cells[i].d >= hive.cells[i - 1].d, '巢房按离巢心距离排序');
// 巢位取用：不同序号落到不同巢房
const t0 = hive.target(0, 3), t2 = hive.target(2, 3);
assert(t0 && t2 && (t0.x !== t2.x || t0.y !== t2.y), '不同别的蜂落到不同巢房');
assert.equal(hive.target(0, 1).x, hive.cells[Math.round(0.5 * (hive.cells.length - 1))].x, '巢位在巢房序列上均匀取用');
// 过渡节奏：20 → 33 秒
assert.equal(hive.progress(19), 0); assert.equal(hive.progress(20), 0); assert.equal(hive.progress(33), 1);
assert(hive.progress(26.5) > 0 && hive.progress(26.5) < 1);
// 房内字可追溯：只来自主蜂原句与其他蜂的句子，主句在前
hive.bee = { segments: [{ char: '你' }, { char: '好' }], others: [{ segments: [{ char: '慢' }] }] };
assert.deepEqual(hive._charPool(), ['你', '好', '慢'], '字池=主句+他句，按来源顺序');
assert.equal(new Hive({}, config)._charPool().length, 0, '未链接蜂时字池为空、不编造文字');
// 宿主时钟：暂停冻结、回退跟随、重播清空
const timeline = new Timeline(config, { hive }); timeline.seek(36); timeline.sync();
assert.equal(hive.time, 36); timeline.pause(); timeline.tick(4); assert.equal(hive.time, 36, '暂停冻结点亮');
timeline.seek(25); timeline.sync(); assert.equal(hive.time, 25, '回退跟随宿主时钟');
hive.stamp = {}; timeline.reset(); assert.equal(hive.time, 0); assert.equal(hive.stamp, null, '重播清空缓存印记');
// 绘制顺序：声纹背景 → 蜂巢 → 蜂
const order = []; const layered = new Timeline(config, { waveform: { draw() { order.push('wave'); } }, hive: { draw() { order.push('hive'); } }, bee: { draw() { order.push('bee'); } } });
layered.draw({ save() {}, restore() {}, translate() {}, scale() {} }); assert.deepEqual(order, ['wave', 'hive', 'bee']);
// 无蜂链接时绘制不抛错、不产生印记（23 秒前不画任何东西）
const bare = new Hive({}, config); bare.draw(ctxStub());
bare.time = 36; bare.draw(ctxStub()); assert.equal(bare.stamp, null, '未链接蜂时不产生印记');
console.log('Hive: 23 checks passed (teardrop layout, determinism, targets, traceable cell chars, progress, pause, seek, reset, draw order, no-bee draw).');
