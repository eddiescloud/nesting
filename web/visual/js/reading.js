/**
 * 筑巢 / Nesting · AI 的理解过程
 * ------------------------------------------------------------
 * 把「机器是怎么听懂这句话的」画出来——不是结果，是过程。
 *
 * 观众说完一句话，画布上部依次展开四层分析：
 *   1. 语气扫描：10 个语气词横排，扫描针扫过，停在 AI 选中的那一个（附强度/节奏与判断依据）
 *   2. 含义提取：一句话概括 + 力的方向 + 分量 + 关键词
 *   3. 分段归位：原句被切成几段，每段标出部位与分量
 *   4. 不确定性：这次解码不能确定什么（机器也会不确定，照样画出来）
 *
 * 每一层显示的都是解码层真实给出的判断（来自 beeSpec.decode），不是装饰。
 * 未接入模型时只显示「未解码」，绝不编造语气与含义——与项目红线一致。
 *
 * 无状态：每层的展开程度只由「当前时间 − 该层起始」算出，不保存中间状态。
 * 因此暂停会冻结、倒退会收回、重播会清空。
 *
 * 模块接口与 bee / ripple / hive / waveform 一致：constructor / update / draw / reset。
 */
(function () {
  'use strict';

  // 与 10-语言解码/derive_bee.py 的 TONE_LABELS 必须逐字一致（改一处须同步另一处）
  const TONE_LABELS = ['平稳', '急促', '迟疑', '压抑', '轻快', '沉重', '克制', '激动', '疏离', '温和'];

  // 分段部位的图形标记（会徽风：最简几何形，不写字）
  const ROLE_MARK = {
    head: 'circle', wing: 'wave', thorax: 'square', abdomen: 'bar', stinger: 'triangle',
  };

  class ReadingModule {
    constructor(params, config, sourceText = '', spec = null) {
      this.params = params || {};
      this.config = config;
      const fromParams = (params && (params.beeSpec || params.bee)) || null;
      this.spec = Object.assign({}, config.NEUTRAL_BEE, fromParams || {}, spec || {});
      // 模型的原始判断；未接入模型时为 null
      this.decode = this.spec.decode || null;
      this.sourceText = typeof sourceText === 'string' ? sourceText : '';
      this.reset();
    }

    reset() {
      this.currentTime = 0;
      this.phase = 'idle';
    }

    update(dt, phase, phaseProgress, totalTime) {
      this.currentTime = Math.max(0, Number(totalTime) || 0);
      this.phase = phase || 'idle';
    }

    /** 某一层在当前时刻的展开进度 0–1（无状态）。 */
    layerProgress(from, to, time = this.currentTime) {
      if (time <= from) return 0;
      if (time >= to) return 1;
      return (time - from) / (to - from);
    }

    /** 整层是否已淡出（把画面还给蜂与涟漪）。 */
    isGone(time = this.currentTime) {
      return time >= this.config.READING.fadeOutAt;
    }

    draw(ctx) {
      const cfg = this.config.READING;
      const time = this.currentTime;
      if (this.isGone(time)) return;

      const fade = 1 - this.config.smoothstep(
        this.config.clamp((time - cfg.doubtTo) / (cfg.fadeOutAt - cfg.doubtTo), 0, 1));
      if (fade <= 0.01) return;

      ctx.save();
      const hue = this.spec.hue;
      const left = 150;

      // 未接入模型：只诚实标注，一句判断都不画
      if (!this.decode) {
        if (time < cfg.toneFrom) { ctx.restore(); return; }
        this._label(ctx, '未解码', left, cfg.bandTop, hue, fade);
        ctx.globalAlpha = fade * 0.75;
        ctx.font = cfg.bodySize + 'px serif';
        ctx.fillStyle = this.config.hsl({ h: hue, s: 22, l: 60 }, 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('语气与含义未接入模型，没有判断可显示', left + 96, cfg.bandTop);
        ctx.restore();
        return;
      }

      let y = cfg.bandTop;
      const tone = this.decode.tone;
      const meaning = this.decode.meaning;
      const segments = this.decode.segments;

      if (tone) {
        const p = this.layerProgress(cfg.toneFrom, cfg.toneTo, time);
        if (p > 0) this._drawTone(ctx, tone, left, y, hue, fade, p, time);
        y += cfg.rowGap;
      }
      if (meaning) {
        const p = this.layerProgress(cfg.meaningFrom, cfg.meaningTo, time);
        if (p > 0) this._drawMeaning(ctx, meaning, left, y, hue, fade, p);
        y += cfg.rowGap;
      }
      if (segments && segments.length) {
        const p = this.layerProgress(cfg.segmentFrom, cfg.segmentTo, time);
        if (p > 0) this._drawSegments(ctx, segments, left, y, hue, fade, p);
        y += cfg.rowGap;
      }
      if (this.decode.uncertainty) {
        const p = this.layerProgress(cfg.doubtFrom, cfg.doubtTo, time);
        if (p > 0) this._drawDoubt(ctx, this.decode.uncertainty, left, y, hue, fade, p);
      }

      ctx.restore();
    }

    /* ---- 第 1 层 · 语气扫描 ---- */
    _drawTone(ctx, tone, x, y, hue, fade, p, time) {
      const cfg = this.config.READING;
      this._label(ctx, '语气', x, y, hue, fade);

      const gap = 64;
      const startX = x + 96;
      const scanP = this.config.clamp((time - cfg.toneFrom) / cfg.scanSeconds, 0, 1);
      const chosen = TONE_LABELS.indexOf(tone.label);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < TONE_LABELS.length; i += 1) {
        const isChosen = i === chosen;
        const passed = (i / TONE_LABELS.length) <= scanP + 0.02;
        const settled = scanP >= 1;
        const a = fade * (settled ? (isChosen ? 0.95 : 0.16) : (passed ? 0.8 : 0.22));
        ctx.globalAlpha = a;
        ctx.font = (settled && isChosen ? cfg.toneSize + 5 : cfg.toneSize) + 'px serif';
        ctx.fillStyle = this.config.hsl(
          { h: hue, s: isChosen ? 70 : 24, l: isChosen ? 68 : 52 }, 1);
        ctx.fillText(TONE_LABELS[i], startX + i * gap, y);
      }

      if (scanP < 1) {
        const sx = startX + scanP * (TONE_LABELS.length - 1) * gap;
        ctx.globalAlpha = fade * 0.85;
        ctx.strokeStyle = this.config.hsl({ h: hue, s: 72, l: 74 }, 1);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, y - 19);
        ctx.lineTo(sx, y + 19);
        ctx.stroke();
      }

      const barY = y + 32;
      this._bar(ctx, startX, barY, tone.intensity, cfg.barWidth, hue, fade * p, '强度');
      this._bar(ctx, startX + cfg.barWidth + 56, barY, tone.pace,
                cfg.barWidth * 0.72, hue, fade * p, '节奏');

      if (p > 0.45 && tone.evidence) {
        ctx.globalAlpha = fade * ((p - 0.45) / 0.55) * 0.5;
        ctx.font = cfg.noteSize + 'px serif';
        ctx.fillStyle = this.config.hsl({ h: hue, s: 16, l: 56 }, 1);
        ctx.textAlign = 'left';
        ctx.fillText('凭什么：' + tone.evidence, startX, barY + 27);
      }
    }

    /* ---- 第 2 层 · 含义提取 ---- */
    _drawMeaning(ctx, meaning, x, y, hue, fade, p) {
      const cfg = this.config.READING;
      this._label(ctx, '含义', x, y, hue, fade);
      const sx = x + 96;

      ctx.globalAlpha = fade * p * 0.92;
      ctx.font = cfg.bodySize + 'px serif';
      ctx.fillStyle = this.config.hsl({ h: hue, s: 42, l: 70 }, 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(meaning.gist || '', sx, y);

      const row2 = y + 34;
      this._arrow(ctx, sx + 10, row2, meaning.direction, hue, fade * p);
      const barX = sx + 54;
      this._bar(ctx, barX, row2 - 2, meaning.weight, cfg.barWidth * 0.62, hue, fade * p, '分量');

      if (meaning.keywords && meaning.keywords.length) {
        ctx.globalAlpha = fade * p * 0.62;
        ctx.font = cfg.noteSize + 'px serif';
        ctx.fillStyle = this.config.hsl({ h: hue, s: 20, l: 58 }, 1);
        ctx.fillText('关键词：' + meaning.keywords.join('、'),
                     barX + cfg.barWidth * 0.62 + 34, row2);
      }
    }

    /* ---- 第 3 层 · 分段归位 ---- */
    _drawSegments(ctx, segments, x, y, hue, fade, p) {
      const cfg = this.config.READING;
      this._label(ctx, '分段', x, y, hue, fade);
      const sx = x + 96;
      let cur = sx;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      for (let i = 0; i < segments.length; i += 1) {
        const seg = segments[i];
        const shown = this.config.clamp((p - i * 0.05) / 0.45, 0, 1);
        if (shown <= 0.01) break;
        ctx.globalAlpha = fade * shown * 0.9;
        ctx.font = cfg.bodySize + 'px serif';
        ctx.fillStyle = this.config.hsl({ h: hue, s: 48, l: 68 }, 1);
        ctx.fillText(seg.text, cur, y);

        const measured = ctx.measureText ? ctx.measureText(seg.text) : null;
        const w = (measured && measured.width) ? measured.width : seg.text.length * cfg.bodySize;
        cur += w + 18;
        this._mark(ctx, cur + 8, y, ROLE_MARK[seg.role] || 'bar', hue, fade * shown);
        cur += 26;
        this._bar(ctx, cur, y - 2, seg.weight, 44, hue, fade * shown, null);
        cur += 44 + 28;
        if (cur > this.config.DESIGN_WIDTH - 150) break;
      }
    }

    /* ---- 第 4 层 · 不确定性 ---- */
    _drawDoubt(ctx, text, x, y, hue, fade, p) {
      const cfg = this.config.READING;
      this._label(ctx, '不确定', x, y, hue, fade);
      ctx.globalAlpha = fade * p * 0.48;
      ctx.font = cfg.noteSize + 'px serif';
      ctx.fillStyle = this.config.hsl({ h: hue, s: 10, l: 54 }, 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text || '', x + 96, y);
    }

    /* ---- 会徽风的零件 ---- */

    _label(ctx, text, x, y, hue, fade) {
      ctx.globalAlpha = fade * 0.4;
      ctx.font = this.config.READING.labelSize + 'px sans-serif';
      ctx.fillStyle = this.config.hsl({ h: hue, s: 16, l: 54 }, 1);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 76, y);
    }

    /** 刻度条：底槽 + 填充 + 末端短竖线（会徽风的刻度端点）。 */
    _bar(ctx, x, y, value, width, hue, alpha, name) {
      const cfg = this.config.READING;
      const v = this.config.clamp(value, 0, 1);
      ctx.globalAlpha = alpha * 0.18;
      ctx.fillStyle = this.config.hsl({ h: hue, s: 20, l: 50 }, 1);
      ctx.fillRect(x, y, width, cfg.barHeight);
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = this.config.hsl({ h: hue, s: 58, l: 62 }, 1);
      ctx.fillRect(x, y, width * v, cfg.barHeight);
      ctx.fillRect(x + width * v - 1, y - 4, 2, cfg.barHeight + 8);
      if (name) {
        ctx.globalAlpha = alpha * 0.5;
        ctx.font = cfg.noteSize + 'px sans-serif';
        ctx.fillStyle = this.config.hsl({ h: hue, s: 14, l: 52 }, 1);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x - 12, y + 2);
      }
    }

    /** 力的方向：向内收 / 向外放 / 平。 */
    _arrow(ctx, x, y, direction, hue, alpha) {
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = this.config.hsl({ h: hue, s: 55, l: 64 }, 1);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (direction === 'inward') {
        ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9);
        ctx.moveTo(x - 5, y + 4); ctx.lineTo(x, y + 9); ctx.lineTo(x + 5, y + 4);
      } else if (direction === 'outward') {
        ctx.moveTo(x, y + 9); ctx.lineTo(x, y - 9);
        ctx.moveTo(x - 5, y - 4); ctx.lineTo(x, y - 9); ctx.lineTo(x + 5, y - 4);
      } else {
        ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
      }
      ctx.stroke();
    }

    /** 部位标记：圆 / 波 / 方 / 条 / 三角。 */
    _mark(ctx, x, y, kind, hue, alpha) {
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = this.config.hsl({ h: hue, s: 40, l: 60 }, 1);
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (kind === 'circle') {
        ctx.arc(x, y, 6, 0, Math.PI * 2);
      } else if (kind === 'wave') {
        ctx.moveTo(x - 7, y + 2);
        ctx.quadraticCurveTo(x - 3, y - 4, x, y + 1);
        ctx.quadraticCurveTo(x + 3, y - 4, x + 7, y + 2);
      } else if (kind === 'square') {
        ctx.rect(x - 5.5, y - 5.5, 11, 11);
      } else if (kind === 'triangle') {
        ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.closePath();
      } else {
        ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
      }
      ctx.stroke();
    }
  }

  window.ReadingModule = ReadingModule;
})();
