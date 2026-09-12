/**
 * 筑巢 / Nesting · 声纹（声音波形 · 背景层）
 * ------------------------------------------------------------
 * 把 09-声音设计/build_score.py 推导出的 score 画成铺满画面的流动背景，
 * 让"停顿"不再是一片纯黑。蜂与文字画在它之上。
 *
 * 为什么不自己造一段波形：声音的层、增益、事件时刻都由 score 决定，
 * 波形只是它的可视化。这里不重复实现声音公式，只消费 score；
 * 唯一的例外是层包络（layerEnvelope），它与 web/audio/audio.mjs 的同名函数
 * 必须逐值一致，由 08-视觉原型/test_waveform.js 跨模块比对守卫。
 *
 * 静音时波形照常显示：它画的是"这一刻声音的结构"，观众点开声音后听到的就是它。
 */
(function () {
  'use strict';

  const FADE_IN_SECONDS = 1.5;
  const TEXTURE_FADE_START = 47;
  const LINES = 24;

  /** 层包络：与 web/audio/audio.mjs 的 layerEnvelope 同式，改动必须同步（有守卫测试）。 */
  function layerEnvelope(layer, t) {
    if (t < layer.start || t >= layer.end) return 0;
    let env = 1;
    if (t < layer.start + FADE_IN_SECONDS) env *= (t - layer.start) / FADE_IN_SECONDS;
    if (layer.kind === 'texture' && t > TEXTURE_FADE_START) {
      env *= Math.max(0, (layer.end - t) / (layer.end - TEXTURE_FADE_START));
    }
    return env;
  }

  /** 确定性噪声：同一 (seed, time) 永远得到同一个值，保证无头测试可复算。 */
  function noise(seed, t) {
    const x = Math.sin(seed * 127.1 + t * 311.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }

  class WaveformModule {
    constructor(params, config) {
      this.config = config;
      const score = (params && params.score) || null;
      this.score = score;
      this.layers = (score && Array.isArray(score.layers)) ? score.layers : [];
      this.masterGain = (score && typeof score.master_gain === 'number') ? score.master_gain : 0.8;
      this.events = (score && Array.isArray(score.events) ? score.events : [])
        .filter(event => event && event.cue === 'deposit' && typeof event.t === 'number');
      this.textureLayers = this.layers.filter(layer => layer.kind === 'texture');
      this.textureRate = this.textureLayers.reduce((sum, layer) => sum + (layer.grain_rate || 0), 0);
      this.reset();
    }

    reset() {
      this.time = 0;
      this.anim = 0;
      this.level = 0;
      this.texture = 0;
    }

    /** 当前时刻的响度：与声音模块 masterTarget 同式（层增益 × 包络，再乘归一增益）。 */
    levelAt(t) {
      let peak = 0;
      for (const layer of this.layers) {
        peak += (layer.gain || 0) * layerEnvelope(layer, t);
      }
      return Math.max(0, Math.min(1, peak * this.masterGain));
    }

    /** 当前时刻纹理层的活跃程度（0–1）：决定颗粒多少。 */
    textureAt(t) {
      let peak = 0;
      for (const layer of this.textureLayers) {
        peak += (layer.gain || 0) * layerEnvelope(layer, t);
      }
      return Math.max(0, Math.min(1, peak * this.masterGain / 0.28));
    }

    update(dt, phase, phaseProgress, totalTime) {
      this.anim += Math.max(0, Number(dt) || 0);
      this.time = Math.max(0, Number(totalTime) || 0);
      this.level = this.levelAt(this.time);
      this.texture = this.textureAt(this.time);
    }

    /** 波形采样：低频主体 + 由颗粒密度决定的细节，全部确定性。 */
    _waveAt(index, line, level) {
      const phase = line * 1.7;
      const x = index * 36;
      const body = Math.sin(x * 0.004 + this.anim * 0.6 + phase) * 0.55
                 + Math.sin(x * 0.011 - this.anim * 0.9 + phase * 1.3) * 0.3;
      const detail = noise(index + line * 31, Math.floor(this.anim * 5)) * 0.35;
      return (body + detail) * level;
    }

    /** 铺满画面的背景波形：比纯黑有呼吸感，但压得住，不抢主体。 */
    draw(ctx) {
      const { DESIGN_WIDTH, DESIGN_HEIGHT, COLORS } = this.config;
      const level = this.level;
      const color = COLORS.groupB;
      const margin = DESIGN_HEIGHT * 0.06;
      const span = DESIGN_HEIGHT - margin * 2;
      const samples = 96;
      const step = DESIGN_WIDTH / samples;

      ctx.save();
      for (let line = 0; line < LINES; line += 1) {
        const baseY = margin + span * (line / (LINES - 1));
        const depth = 0.35 + 0.65 * (line / (LINES - 1));
        // 背景要看得见才不算纯黑：静态底噪也给到 0.14，随响度增亮
        ctx.globalAlpha = (0.14 + 0.34 * level) * depth;
        ctx.strokeStyle = this.config.hsl(color, 0.85);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let i = 0; i <= samples; i += 1) {
          const y = baseY + this._waveAt(i, line, level) * DESIGN_HEIGHT * 0.022 * (0.35 + level);
          if (i === 0) ctx.moveTo(i * step, y); else ctx.lineTo(i * step, y);
        }
        ctx.stroke();
      }

      const grains = Math.min(140, Math.round(this.textureRate * 9 * (this.texture || 0)));
      if (grains > 0) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = this.config.hsl(color, 1);
        for (let i = 0; i < grains; i += 1) {
          const gx = (i * 137 + Math.floor(this.anim * 30)) % DESIGN_WIDTH;
          const gy = margin + ((i * 271 + Math.floor(this.anim * 22)) % Math.round(span));
          ctx.beginPath();
          ctx.arc(gx, gy, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const event of this.events) {
        const age = this.time - event.t;
        if (age < 0 || age > 1.8) continue;
        const progress = age / 1.8;
        const u = Math.max(0, Math.min(1, (event.t - 47) / 10));
        ctx.globalAlpha = (1 - progress) * 0.3;
        ctx.strokeStyle = this.config.hsl(color, 0.9);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(DESIGN_WIDTH * (0.15 + u * 0.7), DESIGN_HEIGHT * 0.5,
                24 + progress * DESIGN_WIDTH * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  WaveformModule.layerEnvelope = layerEnvelope;
  WaveformModule.noise = noise;

  window.WaveformModule = WaveformModule;
})();
