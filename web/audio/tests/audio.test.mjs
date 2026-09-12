/**
 * 声音模块无头测试（node --test web/audio/tests/audio.test.mjs）
 * 校验：与 09-声音设计 score 的映射一致性、宿主时钟驱动、静音、重置、暂停恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createAudio, buildLayers, layerEnvelope, peakConcurrent } from '../audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const score = JSON.parse(readFileSync(path.join(ROOT, '09-声音设计/score.example-手工占位.json'), 'utf-8'));
const output = JSON.parse(readFileSync(path.join(ROOT, 'web/visual/params/demo.json'), 'utf-8'));

/* ---- 最小 AudioContext 桩：只记录节点创建与启停 ---- */
function makeMockContext() {
  const oscs = [];
  const param = () => ({
    value: 0,
    calls: [],
    setValueAtTime(...a) { this.calls.push(['setValue', ...a]); },
    linearRampToValueAtTime(...a) { this.calls.push(['ramp', ...a]); },
    exponentialRampToValueAtTime(...a) { this.calls.push(['expRamp', ...a]); },
    setTargetAtTime(...a) { this.calls.push(['target', ...a]); },
  });
  return {
    currentTime: 0,
    destination: {},
    oscs,
    gains: [],
    createOscillator() {
      const osc = { type: '', frequency: param(), connect() {}, start() { osc.started = true; }, stop() { osc.stopped = true; } };
      oscs.push(osc);
      return osc;
    },
    createGain() {
      const gain = { gain: param(), connect() {} };
      this.gains.push(gain);
      return gain;
    },
    resume() { this.resumed = true; },
    close() {},
  };
}

function makeUnlockedAudio(mock = makeMockContext()) {
  const audio = createAudio({ injectedContext: mock });
  return audio.unlock().then(() => audio);
}

test('层参数与离线 score 一致（同一公式）', () => {
  const built = buildLayers(output);
  assert.equal(built.masterGain, score.master_gain);
  assert.equal(built.layers.length, score.layers.length);
  score.layers.forEach((py, i) => {
    const js = built.layers[i];
    assert.equal(js.id, py.id);
    assert.equal(js.grainRate, py.grain_rate, py.id + ' 纹理密度不一致');
    assert.equal(js.gain, py.gain, py.id + ' 增益不一致');
    assert.equal(js.start, py.start);
    assert.equal(js.end, py.end);
  });
  const deposits = built.events.filter((e) => e.cue === 'deposit');
  const pyDeposits = score.events.filter((e) => e.cue === 'deposit');
  assert.equal(deposits.length, pyDeposits.length);
  deposits.forEach((e, i) => assert.ok(Math.abs(e.t - pyDeposits[i].t) < 1e-9));
});

test('峰值并发归一满足总音量上限', () => {
  const built = buildLayers(output);
  assert.ok(peakConcurrent(built.layers) * built.masterGain <= 0.8 + 1e-9);
});

test('层包络：淡入、settle 线性衰减、越界为零', () => {
  const texture = buildLayers(output).layers.find((l) => l.id === 'swarm-a');
  assert.equal(layerEnvelope(texture, 7), 0);
  assert.ok(Math.abs(layerEnvelope(texture, 8.75) - 0.5) < 1e-9); // 1.5s 淡入中点
  assert.ok(Math.abs(layerEnvelope(texture, 52) - 0.5) < 1e-9); // settle 中点衰减到一半
  assert.equal(layerEnvelope(texture, 57), 0);
});

test('未解锁时 load/frame 不发声、不抛错', () => {
  const audio = createAudio({ createRng: () => () => 0.5 });
  audio.load({ output });
  audio.frame({ time: 10 });
  audio.frame({ time: 33 });
  audio.setMuted(false);
  audio.reset();
});

test('解锁前不调度，解锁后 frame 驱动发声', async () => {
  const ctx = makeMockContext();
  const audio = await makeUnlockedAudio(ctx);
  audio.load({ output });
  audio.frame({ time: 8.0 });
  const bedOscs = ctx.oscs.length;
  assert.equal(bedOscs, 3, 'bed 主音 + 失谐拍频 + LFO 共 3 个常驻振荡器');
  // 以 0.2s 步进推进 8→10s（模拟 60fps 宿主时钟），swarm-a 速率 5.5/s
  for (let t = 8.2; t <= 10.001; t += 0.2) audio.frame({ time: Math.round(t * 10) / 10 });
  const grains = ctx.oscs.length - bedOscs;
  assert.ok(grains >= 6 && grains <= 22, '纹理颗粒应与密度大致一致，实际 ' + grains);
});

test('deposit 事件越过触发时刻后发声', async () => {
  const ctx = makeMockContext();
  const audio = await makeUnlockedAudio(ctx);
  audio.load({ output });
  audio.frame({ time: 47 });
  const bloomFreqs = [275, 412.5, 550]; // bloom 层 275Hz 的三个分音，与纹理颗粒频率不重叠
  const bloomCount = () => ctx.oscs.filter((o) => bloomFreqs.includes(o.frequency.value)).length;
  audio.frame({ time: 47.4 }); // 覆盖 deposit-01（t=47.2）
  assert.equal(bloomCount(), 3, '一次 bloom = 3 个分音振荡器');
  audio.frame({ time: 47.8 }); // 覆盖 deposit-02（t=47.6）
  assert.equal(bloomCount(), 6, '第二次 bloom 再加 3 个');
});

test('setMuted 使 master 目标为 0；解除后为正', async () => {
  const ctx = makeMockContext();
  const audio = await makeUnlockedAudio(ctx);
  audio.load({ output });
  audio.setMuted(false);
  audio.frame({ time: 30 });
  const master = ctx.gains[0];
  const last = master.gain.calls[master.gain.calls.length - 1];
  assert.equal(last[0], 'target');
  assert.ok(last[1] > 0, '解除静音后目标增益应为正');
  audio.setMuted(true);
  const mutedCall = master.gain.calls[master.gain.calls.length - 1];
  assert.equal(mutedCall[1], 0);
});

test('大时间跳跃不补排（暂停恢复防爆音）', async () => {
  const ctx = makeMockContext();
  const audio = await makeUnlockedAudio(ctx);
  audio.load({ output });
  audio.frame({ time: 21 });
  const count = ctx.oscs.length;
  audio.frame({ time: 46 }); // 25 秒跳跃
  assert.equal(ctx.oscs.length, count, '跳跃窗口内不应补排颗粒');
  audio.frame({ time: 46.3 }); // 恢复正常推进
  assert.ok(ctx.oscs.length > count, '恢复后继续发声');
});

test('reset 清空状态，之后 frame 不复活；重新 load 可重播', async () => {
  const ctx = makeMockContext();
  const audio = await makeUnlockedAudio(ctx);
  audio.load({ output });
  audio.frame({ time: 10 });
  audio.reset();
  const count = ctx.oscs.length;
  audio.frame({ time: 40 });
  assert.equal(ctx.oscs.length, count, 'reset 后 frame 不应产生新节点');
  audio.load({ output });
  audio.frame({ time: 9 });
  assert.ok(ctx.oscs.length > 0, '重新 load 后可继续调度');
});

test('结对数/沉积数采用 half-up，与 Python 端一致', () => {
  // 48 × 0.46875 = 22.5 是 Py/JS 取整分歧点：银行家舍入得 22，half-up 得 23。
  const atHalf = JSON.parse(JSON.stringify(output));
  atHalf.interaction.weave = 0.46875;
  atHalf.interaction.settle = 1.0;
  const deposits = buildLayers(atHalf).events.filter((e) => e.cue === 'deposit');
  assert.equal(deposits.length, 23, '22.5 应进位为 23（银行家舍入会得 22）');
});

test('cue 事件时刻与 score.phases 边界一致（锁定本模块硬编码的相位）', () => {
  // audio.mjs 的 buildLayers 直接写死 0/8/20/32/47/57；若相位表变更而未同步，
  // 这里的逐项比对会失败，从而暴露与 09-声音设计/build_score.py 的漂移。
  const built = buildLayers(output);
  const cues = built.events.filter((e) => e.cue !== 'deposit').map((e) => e.t);
  const starts = score.phases.map((p) => p.start);
  assert.deepEqual(cues, starts, 'cue 时刻应与 score.phases 的 start 逐项相同');
});

test('满参数事件数不超过 score schema 的 events 上限', () => {
  const schema = JSON.parse(readFileSync(path.join(ROOT, '09-声音设计/score.schema.json'), 'utf-8'));
  const atMax = JSON.parse(JSON.stringify(output));
  atMax.interaction.weave = 1.0;
  atMax.interaction.settle = 1.0;
  const built = buildLayers(atMax);
  assert.equal(built.events.length, 54, '6 个 cue + 48 个 deposit');
  assert.ok(
    built.events.length <= schema.properties.events.maxItems,
    '事件数 ' + built.events.length + ' 超过 schema 上限 ' + schema.properties.events.maxItems
  );
});
