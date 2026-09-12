import test from 'node:test';
import assert from 'node:assert/strict';
import { createBeeVoice, voicePlan, warmthFor, CONSONANT, DISSONANT } from '../bee-voice.mjs';

/** 最小 AudioContext 桩：记录节点、参数自动化与启停。 */
function stubContext() {
  const oscs = [], gains = [], buffers = [], sources = [];
  const param = () => ({
    value: 0, calls: [],
    setValueAtTime(v, t) { this.value = v; this.calls.push(['set', v, t]); },
    linearRampToValueAtTime(v, t) { this.value = v; this.calls.push(['ramp', v, t]); },
  });
  return {
    currentTime: 0, sampleRate: 44100, destination: {}, oscs, gains, buffers, sources,
    createOscillator() {
      // stop() 不带参数表示"立刻停止"，别把它记成 undefined
      const node = { type: 'sine', frequency: param(), connect() {},
                     start(t) { this.startTime = t; }, stop(t) { this.stopped = true; this.stopAt = t; } };
      oscs.push(node);
      return node;
    },
    createGain() { const node = { gain: param(), connect() {} }; gains.push(node); return node; },
    createBiquadFilter() { return { type: '', frequency: param(), connect() {} }; },
    createBuffer(channels, frames) {
      const data = new Float32Array(frames);
      const buffer = { frames, data, getChannelData: () => data };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const node = { buffer: null, connect() {}, start(t) { this.startTime = t; },
                     stop(t) { this.stopped = true; this.stopAt = t; } };
      sources.push(node);
      return node;
    },
    resume: () => Promise.resolve(),
    closed: false,
    close() { this.closed = true; return Promise.resolve(); },
  };
}

test('和缓的语气得到协和音程与慢起音', () => {
  const plan = voicePlan({ hue: 38 }, { label: '温和', intensity: 0.5 });
  assert.ok(plan.warmth > 0.9, '和缓度接近 1');
  assert.equal(plan.ratios[0], 1, '根音不变');
  plan.ratios.slice(1).forEach((ratio, index) => {
    const i = index + 1;
    assert.ok(Math.abs(ratio - CONSONANT[i]) < Math.abs(ratio - DISSONANT[i]),
      '音程更靠向协和音 ' + CONSONANT[i] + '（实际 ' + ratio.toFixed(3) + '）');
  });
  assert.ok(plan.attack > 0.3, '起音慢（' + plan.attack.toFixed(2) + 's）');
  assert.ok(plan.noiseGain < 0.03, '几乎没有噪声');
});

test('尖锐的语气得到不协和音程与硬起音', () => {
  const plan = voicePlan({ hue: 38 }, { label: '急促', intensity: 0.86 });
  assert.ok(plan.warmth < 0.25, '和缓度很低');
  plan.ratios.forEach((ratio, i) => {
    const distance = Math.abs(ratio - DISSONANT[i]);
    assert.ok(distance < Math.abs(ratio - CONSONANT[i]) + 0.001, '音程更靠向不协和音');
  });
  assert.ok(plan.attack < 0.08, '起音很硬（' + plan.attack.toFixed(3) + 's）');
  assert.ok(plan.noiseGain > 0.15, '带明显噪声起音');
});

test('同一个语气标签每次都得到同一把声音，且音高由色相决定', () => {
  const a = voicePlan({ hue: 30.64 }, { label: '压抑', intensity: 0.58 });
  const b = voicePlan({ hue: 30.64 }, { label: '压抑', intensity: 0.58 });
  assert.deepEqual(a, b, '确定性');
  const other = voicePlan({ hue: 54.56 }, { label: '压抑', intensity: 0.58 });
  assert.notEqual(a.baseFrequency, other.baseFrequency, '不同色相 → 不同音高');
});

test('没有解码结果时取中性，不猜测语气', () => {
  assert.equal(warmthFor(undefined), 0.5);
  assert.equal(warmthFor({ label: '不存在的标签' }), 0.5);
  const plan = voicePlan({ hue: 38 }, undefined);
  assert.ok(plan.warmth === 0.5 && plan.edge === 0.5, '中性');
});

test('play 真正创建声源，静音时不发声但也不报错', () => {
  const context = stubContext();
  const voice = createBeeVoice({ injectedContext: context });
  voice.setMuted(true);
  const plan = voice.play({ hue: 38 }, { label: '温和', intensity: 0.5 });
  assert.ok(plan, '返回了这次的声音参数');
  assert.ok(context.oscs.length >= 3, '至少三个振荡器');
  const scheduled = context.gains.filter(gain => gain.gain.calls.length > 0);
  assert.ok(scheduled.length >= 3, '三个音的增益都被显式调度（' + scheduled.length + ' 个）');
  assert.ok(scheduled.every(gain => gain.gain.value === 0), '静音时增益为 0');
  assert.ok(context.oscs.every(osc => typeof osc.startTime === 'number'), '全部已启动');
  voice.setMuted(false);
  voice.play({ hue: 38 }, { label: '温和', intensity: 0.5 });
  assert.ok(context.gains.some(gain => gain.gain.value > 0), '取消静音后确实有增益');
});

test('尖锐的语气会额外产生噪声源', () => {
  const calm = stubContext();
  const calmVoice = createBeeVoice({ injectedContext: calm });
  calmVoice.play({ hue: 38 }, { label: '温和', intensity: 0.5 });
  const harsh = stubContext();
  const harshVoice = createBeeVoice({ injectedContext: harsh });
  harshVoice.play({ hue: 38 }, { label: '急促', intensity: 0.86 });
  assert.equal(calm.sources.length, 0, '和缓的声音不加噪声');
  assert.ok(harsh.sources.length >= 1, '尖锐的声音加噪声');
  assert.ok(harsh.buffers.length >= 1, '噪声用确定性缓冲区，不用随机数');
});

test('dispose 停掉所有声源并关闭上下文', () => {
  const context = stubContext();
  const voice = createBeeVoice({ injectedContext: context });
  voice.play({ hue: 38 }, { label: '急促', intensity: 0.8 });
  voice.dispose();
  assert.ok(context.oscs.every(osc => osc.stopped === true), '振荡器全部停止');
  assert.ok(context.closed === true, '上下文已关闭');
  assert.equal(voice.play({ hue: 38 }, { label: '急促', intensity: 0.8 }), null, '释放后不再发声');
});

test('没有 AudioContext 时给出可读错误而不是静默失败', () => {
  const voice = createBeeVoice({ audioContextCtor: null, injectedContext: null });
  assert.throws(() => voice.unlock(), /AudioContext 不可用/);
  assert.equal(voice.play({ hue: 38 }, { label: '温和' }), null, '无法发声时返回 null，不抛错');
});
