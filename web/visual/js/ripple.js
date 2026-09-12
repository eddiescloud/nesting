/**
 * 筑巢 / Nesting · 语言传播涟漪
 * ------------------------------------------------------------
 * 一句话被说出 → 从蜂体向外推出同心波纹 → 扩散到画面边缘 → 消失。
 * 说出口的话离开身体，再也收不回来。
 *
 * 算法（全部确定性：同一份输入在同一时刻永远得到同一组波）：
 *   - 触发：蜂体成形（config.RIPPLE.firstAt）起，每隔 gap 秒推出一圈，共 count 圈；
 *   - 波速：由 wingbeatHz 派生（wingbeatHz 又由语气强度派生）→ 说得越激动，传得越快；
 *   - 强度：由 tension 派生（体节绷紧程度，含语气强度与分量）→ 分量越重，波越粗越久；
 *   - 形态：圆环由沿切线的短笔画组成，呼应蜂体的会徽风笔画轮廓。语言离开身体时
 *           笔画已被拆散，所以这里只取最简形态（线段 / 点 / 弧），不再对应具体的字；
 *   - 衰减：越远越淡、越细、笔画越短；到 maxRadius 完全消失。
 *
 * 无状态：波的半径只由「当前时间 − 发出时刻」算出，不保存中间状态。
 * 因此暂停会冻结、倒退会收回、重播会清空——波始终跟着宿主时间，不会自己跑掉。
 *
 * 模块接口与 bee.js / waveform.js / hive.js 一致：constructor / update / draw / reset。
 */
(function () {
  'use strict';

  /**
   * 波面上的短笔画：与 bee.js 的笔画同源，但只取最简形态。
   * 语言离开身体后笔画已被拆散，不再对应具体的字，所以不查 CHAR_STROKE 表。
   */
  const STROKE_KINDS = ['line', 'line', 'dot', 'line', 'arc', 'line', 'dot', 'line'];

  // 圆周上短笔画的数量上限：波传得越远笔画越稀疏（语言散开了），同时避免大圈时笔画过多
  const MAX_STROKES = 140;

  class RippleModule {
    constructor(params, config, sourceText = '', spec = null) {
      this.params = params || {};
      this.config = config;
      const fromParams = (params && (params.beeSpec || params.bee)) || null;
      this.spec = Object.assign({}, config.NEUTRAL_BEE, fromParams || {}, spec || {});
      this.sourceText = typeof sourceText === 'string' ? sourceText : '';
      this.reset();
    }

    /**
     * 波速与强度：由蜂体规格确定性派生，可追溯到语气强度与分量。
     *   wingbeatHz = 1.6 + 1.8 × 语气强度  →  反解出强度，再映射到速度增量
     *   tension    = 0.5 × 语气强度 + 0.5 × 分量
     */
    _derive() {
      const cfg = this.config.RIPPLE;
      const clamp = this.config.clamp;
      const drive = clamp(((this.spec.wingbeatHz || 1.6) - 1.6) / 1.8, 0, 1);
      this.speed = cfg.baseSpeed + cfg.speedRange * drive;
      this.strength = 0.45 + 0.55 * clamp(this.spec.tension ?? 0.5, 0, 1);
    }

    reset() {
      this.currentTime = 0;
      this.phase = 'idle';
      this._derive();
    }

    update(dt, phase, phaseProgress, totalTime) {
      this.currentTime = Math.max(0, Number(totalTime) || 0);
      this.phase = phase || 'idle';
    }

    /** 某一圈波在给定时刻的半径；还没发出或已扩散到边缘则返回 null。 */
    radiusAt(index, time = this.currentTime) {
      const cfg = this.config.RIPPLE;
      const age = time - (cfg.firstAt + index * cfg.gap);
      if (age < 0) return null;
      const radius = age * this.speed;
      return radius >= cfg.maxRadius ? null : radius;
    }

    /** 当前可见的波（按索引顺序，先发的在前）。 */
    visibleWaves(time = this.currentTime) {
      const cfg = this.config.RIPPLE;
      const list = [];
      for (let i = 0; i < cfg.count; i += 1) {
        const radius = this.radiusAt(i, time);
        if (radius !== null && radius > 0) list.push({ index: i, radius });
      }
      return list;
    }

    draw(ctx) {
      const cfg = this.config.RIPPLE;
      const waves = this.visibleWaves();
      if (!waves.length) return;

      const cx = this.config.DESIGN_WIDTH / 2;
      const cy = this.config.DESIGN_HEIGHT * cfg.originYRatio;
      const hue = this.spec.hue;

      ctx.save();
      for (const wave of waves) {
        const life = wave.radius / cfg.maxRadius;   // 0 = 刚发出，1 = 到边缘
        const fade = 1 - life;                      // 越远越淡
        const alpha = cfg.minAlpha * fade * fade * this.strength;
        if (alpha <= 0.004) continue;

        const circumference = 2 * Math.PI * wave.radius;
        const n = Math.max(6, Math.min(MAX_STROKES, Math.round(circumference / cfg.strokeGap)));
        const width = Math.max(0.6, cfg.baseWidth * fade * (0.55 + this.strength * 0.65));
        const len = cfg.strokeLen * (0.3 + fade * 0.7);

        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.config.hsl({ h: hue, s: 60, l: 68 }, alpha);
        ctx.fillStyle = ctx.strokeStyle;

        for (let k = 0; k < n; k += 1) {
          const t = (k / n) * Math.PI * 2;
          const kind = STROKE_KINDS[k % STROKE_KINDS.length];
          ctx.save();
          ctx.translate(cx + Math.cos(t) * wave.radius, cy + Math.sin(t) * wave.radius);
          ctx.rotate(t + Math.PI / 2);              // 短笔画沿切线方向
          if (kind === 'dot') {
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(0.6, width * 1.15), 0, Math.PI * 2);
            ctx.fill();
          } else if (kind === 'arc') {
            ctx.beginPath();
            ctx.arc(0, 0, len * 0.5, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(-len / 2, 0);
            ctx.lineTo(len / 2, 0);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  window.RippleModule = RippleModule;
})();
