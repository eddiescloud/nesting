/**
 * 筑巢 / Nesting · 声音模块（web/audio/audio.mjs）
 * ------------------------------------------------------------
 * 实现 docs/INTEGRATION_CONTRACT.md v0.1 的声音 ES module 接口：
 * createAudio() → { unlock, load, frame, setMuted, reset, dispose }
 *
 * 原则：
 * - 不另起播放时钟：一切发声由宿主 frame({ time }) 驱动。
 * - 参数映射与 09-声音设计/build_score.py 保持同一公式（单一事实来源）；
 *   离线 score（score.json）与本模块的层参数可互相对照。
 * - 默认静音；未 unlock 前不创建 AudioContext，load 仅记录待播状态。
 * - 音色为占位升级版（失谐铺底、主链低通、下滑脉冲）；最终音色由 Scott 调整。
 * - 不把人工占位参数标为真实 AI 结果；本模块不产生任何"转译"语义。
 */

const DURATION = 60;
const LOUDNESS_CAP = 0.8;
const SWARM_COUNT = 48;
const TEXTURE_RATE_BASE = 2.0;
const TEXTURE_RATE_SPAN = 14.0;
const GAIN_BED = 0.15;
const GAIN_SWARM = 0.28;
const GAIN_PULSE = 0.22;
const GAIN_BLOOM = 0.30;
const FADE_IN = 1.5;
const GRAIN_MIN = 0.06;
const GRAIN_MAX = 0.15;
const BLOOM_SECONDS = 1.5;
const CATCHUP_LIMIT = 0.5; // frame 时间跳跃超过此值则跳过补排，防止暂停恢复后爆音
const MASTER_LP_HZ = 4000; // 主链低通，软化颗粒边缘（音色占位升级）
const DRONE_BEAT_HZ = 0.4; // 铺底微失谐拍频，与离线渲染一致
const PULSE_DROP_RATIO = 0.78; // 脉冲下滑比例，与离线渲染一致

/* 相位时间结构（0–8 静置 / 8–20 第一组 / 20–32 第二组 / 32–47 交织 / 47–57 沉积 / 57–60 存留）
 * 不在此重复声明常量：各层的 start/end 就是相位边界的唯一表达，且已由
 * tests/audio.test.mjs 与 09-声音设计/score.example-手工占位.json 逐层交叉校验，
 * 间接锁定与 build_score.PHASES 的一致性。 */

function floor4(value) {
  return Math.floor(value * 1e4) / 1e4;
}

/* 与 build_score.r4 一致的四位小数舍入，保证跨语言数值一致 */
function r4(value) {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * 与 build_score.round_half_up、config.roundHalfUp 一致的取整：.5 一律进位（输入为非负）。
 * 本模块不 import 视觉 config（保持独立），故同名函数在此重复实现；
 * 三处实现必须同步修改，否则结对数/沉积数会跨端失配。
 */
function roundHalfUp(value) {
  return Math.floor(Number(value) + 0.5);
}

/* 确定性伪随机（mulberry32）；种子由 output 哈希 + 层 ID 派生 */
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seedText) {
  let state = hashString(seedText) || 1;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- 参数映射：与 build_score.build() 相同的公式 ---- */

export function peakConcurrent(layers) {
  // 去重端点（与 build_score.peak_concurrent 的 set 行为一致），避免零宽段把相邻层同时计入。
  const points = [...new Set([0, DURATION, ...layers.map((l) => l.start), ...layers.map((l) => l.end)])]
    .sort((a, b) => a - b);
  let peak = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const middle = (points[i] + points[i + 1]) / 2;
    peak = Math.max(peak, layers
      .filter((l) => l.start <= middle && middle <= l.end)
      .reduce((sum, l) => sum + l.gain, 0));
  }
  return peak;
}

export function buildLayers(output) {
  const [first, second] = output.events;
  const { weave, settle } = output.interaction;
  const pairs = roundHalfUp(SWARM_COUNT * weave);
  const deposits = roundHalfUp(pairs * settle);

  const layers = [
    { id: 'bed', kind: 'drone', sourceEvent: 'none', start: 0, end: DURATION, baseFrequency: 55, grainRate: 0, gain: GAIN_BED },
    { id: 'swarm-a', kind: 'texture', sourceEvent: first.id, start: 8, end: 57, baseFrequency: 220, grainRate: r4(TEXTURE_RATE_BASE + TEXTURE_RATE_SPAN * first.energy), gain: GAIN_SWARM },
    { id: 'swarm-b', kind: 'texture', sourceEvent: second.id, start: 20, end: 57, baseFrequency: 330, grainRate: r4(TEXTURE_RATE_BASE + TEXTURE_RATE_SPAN * second.energy), gain: GAIN_SWARM },
    { id: 'weave-pulse', kind: 'pulse', sourceEvent: 'none', start: 32, end: 47, baseFrequency: 440, grainRate: r4(0.5 + 1.5 * weave), gain: GAIN_PULSE },
    { id: 'settle-bloom', kind: 'bloom', sourceEvent: 'none', start: 47, end: 57, baseFrequency: 275, grainRate: 0, gain: GAIN_BLOOM },
  ];

  const events = [
    { id: 'cue-01', t: 0, layer: 'bed', cue: 'showcase-start' },
    { id: 'cue-02', t: 8, layer: 'swarm-a', cue: 'swarm-a-enter' },
    { id: 'cue-03', t: 20, layer: 'swarm-b', cue: 'swarm-b-enter' },
    { id: 'cue-04', t: 32, layer: 'weave-pulse', cue: 'weave-start' },
    { id: 'cue-05', t: 47, layer: 'settle-bloom', cue: 'settle-start' },
    { id: 'cue-06', t: 57, layer: 'bed', cue: 'residual-start' },
  ];
  for (let i = 0; i < deposits; i += 1) {
    events.push({
      id: 'deposit-' + String(i + 1).padStart(2, '0'),
      t: r4(47 + ((i + 0.5) * 10) / deposits),
      layer: 'settle-bloom',
      cue: 'deposit',
      gain: GAIN_BLOOM,
    });
  }

  return {
    layers,
    events,
    masterGain: floor4(Math.min(1, LOUDNESS_CAP / peakConcurrent(layers))),
  };
}

/* ---- 层包络（与 render_score.py layer_envelope 一致） ---- */

export function layerEnvelope(layer, t) {
  if (t < layer.start || t >= layer.end) return 0;
  let env = 1;
  if (t < layer.start + FADE_IN) env *= (t - layer.start) / FADE_IN;
  if (layer.kind === 'texture' && t > 47) env *= Math.max(0, (layer.end - t) / (layer.end - 47));
  return env;
}

/* ---- 模块主体 ---- */

export function createAudio(options = {}) {
  const createRng = options.createRng || makeRng;
  let context = null; // AudioContext，unlock 后创建或注入
  let unlocked = false;
  let muted = true; // 默认静音
  let disposed = false;
  let session = null; // { output, layers, events, masterGain, lastTime, nextGrainIndex }
  let masterNode = null;
  let masterFilter = null;
  let bedNodes = null;
  let liveNodes = []; // 需要在 reset/dispose 时停止的节点

  function setupMaster() {
    masterNode = context.createGain();
    masterNode.gain.value = 0;
    // 主链低通软化颗粒边缘；测试桩不支持时直接连输出。
    if (typeof context.createBiquadFilter === 'function') {
      masterFilter = context.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.value = MASTER_LP_HZ;
      masterNode.connect(masterFilter);
      masterFilter.connect(context.destination);
    } else {
      masterNode.connect(context.destination);
    }
  }

  function ensureContext() {
    if (context) return context;
    const Ctor = options.audioContextCtor || globalThis.AudioContext;
    if (!Ctor) throw new Error('AudioContext 不可用');
    context = new Ctor();
    setupMaster();
    return context;
  }

  function stopNode(node) {
    try {
      if (node && typeof node.stop === 'function') node.stop();
    } catch (error) { /* 已停止的节点忽略 */ }
  }

  function clearLiveNodes() {
    liveNodes.forEach(stopNode);
    liveNodes = [];
    if (bedNodes) {
      stopNode(bedNodes.osc);
      stopNode(bedNodes.beat);
      stopNode(bedNodes.lfo);
      bedNodes = null;
    }
  }

  function startBed(time) {
    if (!context || bedNodes) return;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const beat = context.createOscillator(); // 微失谐正弦，产生缓慢拍频（与离线渲染一致）
    beat.type = 'sine';
    beat.frequency.value = 55 + DRONE_BEAT_HZ;
    const gain = context.createGain();
    gain.gain.value = 0;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.1;
    osc.connect(gain);
    beat.connect(gain);
    gain.connect(masterNode);
    osc.start(context.currentTime);
    beat.start(context.currentTime);
    lfo.start(context.currentTime);
    bedNodes = { osc, gain, lfo, beat };
  }

  function masterTarget(time) {
    if (!session || muted || !unlocked) return 0;
    let peak = 0;
    session.layers.forEach((layer) => {
      peak += layer.gain * layerEnvelope(layer, time);
    });
    return Math.min(1, peak * session.masterGain);
  }

  function spawnGrain(layer, time, rng) {
    const freq = layer.baseFrequency * (0.88 + 0.24 * rng());
    const duration = GRAIN_MIN + (GRAIN_MAX - GRAIN_MIN) * rng();
    const level = layer.gain * (0.6 + 0.4 * rng());
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = context.createGain();
    const startAt = context.currentTime; // 立即调度：场景时间仅用于决定播什么，不用于何时播
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(level, startAt + duration / 2);
    gain.gain.linearRampToValueAtTime(0, startAt + duration);
    osc.connect(gain);
    gain.connect(masterNode);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
    liveNodes.push(osc);
    if (liveNodes.length > 400) liveNodes.splice(0, 200); // 只保留近期节点用于停止
  }

  function spawnPulse(layer, time, rng) {
    const freq = layer.baseFrequency * (0.97 + 0.06 * rng());
    const osc = context.createOscillator();
    osc.type = 'sine';
    // 频率下滑（与离线渲染 add_pitch_drop 一致）：水滴感短脉冲。
    osc.frequency.setValueAtTime(freq, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * PULSE_DROP_RATIO,
      context.currentTime + 0.09);
    const gain = context.createGain();
    const startAt = context.currentTime; // 立即调度
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(layer.gain, startAt + 0.02);
    gain.gain.linearRampToValueAtTime(0, startAt + 0.09);
    osc.connect(gain);
    gain.connect(masterNode);
    osc.start(startAt);
    osc.stop(startAt + 0.11);
    liveNodes.push(osc);
  }

  function spawnBloom(event, time) {
    const layer = session.layers.find((l) => l.id === event.layer);
    if (!layer) return;
    [[1, 1], [1.5, 0.5], [2, 0.25]].forEach(([multiple, weight]) => {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = layer.baseFrequency * multiple;
      const gain = context.createGain();
      const startAt = context.currentTime; // 立即调度
      const level = event.gain * weight;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(level, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + BLOOM_SECONDS);
      osc.connect(gain);
      gain.connect(masterNode);
      osc.start(startAt);
      osc.stop(startAt + BLOOM_SECONDS + 0.05);
      liveNodes.push(osc);
    });
  }

  /* 在 (lastTime, time] 窗口内按层密度补排纹理颗粒与脉冲 */
  function scheduleWindow(layer, from, to, rng) {
    const span = to - from;
    if (span <= 0) return;
    const count = Math.floor(layer.grainRate * span + rng());
    for (let i = 0; i < count; i += 1) {
      const at = from + (i + rng()) * (span / Math.max(1, count));
      if (layer.kind === 'texture') {
        if (layerEnvelope(layer, at) > 0.01) spawnGrain(layer, at, rng);
      } else if (layer.kind === 'pulse') {
        spawnPulse(layer, at, rng);
      }
    }
  }

  function advance(time) {
    if (!session || !context) return;
    const clamped = Math.max(0, Math.min(DURATION, time));
    if (clamped < session.lastTime) session.lastTime = clamped; // 回退（重播内 seek）时重新对齐
    const from = session.lastTime;
    const to = clamped;
    if (to - from > CATCHUP_LIMIT) {
      session.lastTime = to - 0.05; // 跳过暂停期间积压，不补排
      return;
    }
    session.layers.forEach((layer) => {
      if (layer.kind !== 'texture' && layer.kind !== 'pulse') return;
      const rng = session.rngs[layer.id];
      scheduleWindow(layer, Math.max(from, layer.start), Math.min(to, layer.end), rng);
    });
    session.events.forEach((event) => {
      if (event.cue !== 'deposit') return;
      if (event.t > from && event.t <= to) spawnBloom(event, event.t);
    });
    session.lastTime = to;
  }

  return {
    unlock() {
      unlocked = true;
      if (options.injectedContext) {
        context = options.injectedContext;
        setupMaster();
        return Promise.resolve();
      }
      ensureContext();
      return context.resume ? Promise.resolve(context.resume()).catch(() => {}) : Promise.resolve();
    },

    load({ output }) {
      if (disposed) return;
      clearLiveNodes();
      const built = buildLayers(output);
      const seedBase = (output && output.interaction ? JSON.stringify(output.interaction) : '');
      session = {
        output,
        layers: built.layers,
        events: built.events,
        masterGain: built.masterGain,
        lastTime: 0,
        rngs: {},
      };
      built.layers.forEach((layer) => {
        session.rngs[layer.id] = createRng(seedBase + '|' + layer.id);
      });
      if (context && unlocked) startBed(0);
    },

    frame({ time, playing }) {
      if (!session || disposed) return;
      const timeValue = typeof time === 'number' && isFinite(time) ? time : session.lastTime;
      const isPlaying = playing !== false; // 默认播放，显式 false 才暂停
      if (context && unlocked) {
        if (isPlaying) {
          advance(timeValue);
          const target = masterTarget(timeValue);
          masterNode.gain.setTargetAtTime(target, context.currentTime, 0.05);
        } else {
          // 暂停：主增益归零，停止所有活跃声源（颗粒/脉冲/铺底）
          session.lastTime = timeValue;
          masterNode.gain.setTargetAtTime(0, context.currentTime, 0.02);
          clearLiveNodes();
        }
      } else {
        session.lastTime = timeValue; // 未解锁时仅跟随时钟，不发声
      }
    },

    setMuted(value) {
      muted = Boolean(value);
      if (context && masterNode) {
        masterNode.gain.setTargetAtTime(muted ? 0 : masterTarget(session ? session.lastTime : 0),
          context.currentTime, 0.03);
      }
    },

    reset() {
      clearLiveNodes();
      session = null;
      if (masterNode) masterNode.gain.value = 0;
    },

    dispose() {
      disposed = true;
      clearLiveNodes();
      session = null;
      if (context && typeof context.close === 'function') {
        try { context.close(); } catch (error) { /* 忽略关闭异常 */ }
      }
      context = null;
      masterNode = null;
    },
  };
}

export default createAudio;
