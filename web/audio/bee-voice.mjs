/**
 * 筑巢 / Nesting · 蜂的声音（web/audio/bee-voice.mjs）
 * ------------------------------------------------------------
 * 每只蜂有自己的声音：一只蜂出现时，它那句话的语气决定这把声音的"倾向"。
 *
 * 映射（语气 → 音色）是艺术选择，不是对说话人的评价，也不做心理判断：
 *   - 语气偏和缓（温和/轻快/平稳…）→ 音程用协和音（根音 + 五度 + 八度）、
 *     起音慢、带轻微颤动，听起来"和蔼"；
 *   - 语气偏尖锐（压抑/沉重/激动/急促…）→ 音程掺入小二度与三全音、
 *     起音硬、加噪声与颤音，听起来"不顺耳"。
 * 同一个语气标签每次都得到同一把声音；音高由该只蜂的色相决定（0–1 语义 → 五声音阶）。
 *
 * 与 web/audio/audio.mjs 的分工：那边是整条时间线的环境声（score 驱动），
 * 这边是"每只蜂出生时的一声"，两者互不干扰、各自有测试。
 */

  // 语气标签 → 和缓程度（1 = 最和蔼，0 = 最尖锐）。表外一律取中性 0.5。
  export const TONE_WARMTH = {
    '温和': 0.95, '轻快': 0.90, '平稳': 0.75, '克制': 0.62, '迟疑': 0.50,
    '疏离': 0.45, '压抑': 0.34, '沉重': 0.30, '激动': 0.25, '急促': 0.20,
  };

  export const CONSONANT = [1, 1.5, 2];      // 根音 / 纯五度 / 八度
  export const DISSONANT = [1, 1.06, 1.414]; // 根音 / 小二度 / 三全音
  export const SCALE = [220, 247, 277, 330, 370]; // 五声音阶候选基频（Hz）
  export const DURATION = 2.2;

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** 语气 → 和缓程度；没有解码结果（未解码）时取中性。 */
  export function warmthFor(tone) {
    if (!tone || typeof tone.label !== 'string') return 0.5;
    const base = Object.prototype.hasOwnProperty.call(TONE_WARMTH, tone.label)
      ? TONE_WARMTH[tone.label] : 0.5;
    // 强度只做小幅修正：强度越高，越靠向这一标签本身的方向
    const intensity = clamp01(tone.intensity === undefined ? 0.5 : tone.intensity);
    return clamp01(base + (base - 0.5) * (intensity - 0.5) * 0.6);
  }

  /** 该只蜂的声音参数：同一份 beeSpec + tone 永远得到同一把声音。 */
  export function voicePlan(beeSpec, tone) {
    const warmth = warmthFor(tone);
    const edge = 1 - warmth;
    const hue = beeSpec && typeof beeSpec.hue === 'number' ? beeSpec.hue : 38;
    const base = SCALE[Math.abs(Math.round(hue / 12)) % SCALE.length];
    return {
      warmth,
      edge,
      baseFrequency: base,
      ratios: CONSONANT.map((ratio, i) => lerp(ratio, DISSONANT[i], edge)),
      attack: lerp(0.35, 0.02, edge),
      vibratoHz: lerp(4.5, 9, edge),
      vibratoDepth: lerp(0.004, 0.02, edge),
      tremoloDepth: lerp(0.05, 0.45, edge),
      noiseGain: edge * 0.22,
      peak: lerp(0.22, 0.3, edge),
      duration: DURATION,
    };
  }

  export function createBeeVoice(options = {}) {
    const Ctor = options.audioContextCtor || globalThis.AudioContext || globalThis.webkitAudioContext;
    let context = options.injectedContext || null;
    let master = null;
    let muted = true;
    let disposed = false;
    let live = [];

    function ensureContext() {
      if (!context) {
        if (!Ctor) throw new Error('AudioContext 不可用');
        context = new Ctor();
      }
      // 注入上下文时也要建主增益，否则 play() 无声可发（曾因此静默失败）
      if (!master) {
        master = context.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(context.destination);
      }
      return context;
    }

    function unlock() {
      ensureContext();
      return context.resume ? Promise.resolve(context.resume()).catch(() => {}) : Promise.resolve();
    }

    function stopAll() {
      for (const node of live) {
        try { if (typeof node.stop === 'function') node.stop(); } catch { /* 已停止的节点忽略 */ }
      }
      live = [];
    }

    /** 让一只蜂发声。未 unlock 或静音时不发声，但也不报错。 */
    function play(beeSpec, tone) {
      if (disposed) return null;
      try { ensureContext(); } catch { return null; }
      if (!master) return null;
      const plan = voicePlan(beeSpec, tone);
      const now = context.currentTime;
      const level = muted ? 0 : plan.peak;

      // 三个音：协和 ↔ 不协和由 edge 混合
      plan.ratios.forEach((ratio, index) => {
        const osc = context.createOscillator();
        osc.type = index === 2 ? 'triangle' : 'sine';
        osc.frequency.value = plan.baseFrequency * ratio;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(level / (index + 1.4), now + plan.attack);
        gain.gain.linearRampToValueAtTime(0, now + plan.duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now);
        osc.stop(now + plan.duration + 0.05);
        live.push(osc);

        // 颤音/颤振：和缓时只是轻微晃动，尖锐时抖动明显
        const lfo = context.createOscillator();
        lfo.frequency.value = plan.vibratoHz + index * 0.7;
        const lfoGain = context.createGain();
        lfoGain.gain.value = plan.baseFrequency * ratio * plan.vibratoDepth;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        lfo.stop(now + plan.duration + 0.05);
        live.push(lfo);
      });

      // 只有明显尖锐的语气才加噪声起音；和缓的声音完全不加，规则清晰可测
      if (plan.noiseGain >= 0.05) {
        const frames = Math.max(1, Math.floor(context.sampleRate * 0.18));
        const buffer = context.createBuffer(1, frames, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i += 1) {
          // 确定性噪声：不用 Math.random，保证可复算与可测试
          data[i] = Math.sin(i * 12.9898) * 43758.5453 % 1 * 2 - 1;
        }
        const noise = context.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = context.createGain();
        noiseGain.gain.setValueAtTime(level * plan.noiseGain, now);
        noiseGain.gain.linearRampToValueAtTime(0, now + 0.18);
        const filter = context.createBiquadFilter ? context.createBiquadFilter() : null;
        noise.connect(filter || noiseGain);
        if (filter) {
          filter.type = 'bandpass';
          filter.frequency.value = plan.baseFrequency * 4;
          filter.connect(noiseGain);
        }
        noiseGain.connect(master);
        noise.start(now);
        noise.stop(now + 0.2);
        live.push(noise);
      }

      if (live.length > 60) live.splice(0, live.length - 60);
      return plan;
    }

    function setMuted(value) {
      muted = Boolean(value);
      if (master) master.gain.value = muted ? 0 : 1;
    }

    function dispose() {
      disposed = true;
      stopAll();
      if (context && typeof context.close === 'function') {
        try { context.close(); } catch { /* 忽略关闭异常 */ }
      }
      context = null;
      master = null;
    }

    return { unlock, play, setMuted, stopAll, dispose,
             get unlocked() { return Boolean(context); }, get muted() { return muted; } };
  }

export default createBeeVoice;
