/**
 * 筑巢 / Nesting · 人形模块
 * ------------------------------------------------------------
 * 负责绘制外表平静的人形轮廓与内部空间。
 * 外轮廓在整个 60 秒内保持稳定；仅有极轻微的呼吸感。
 * 内部空间由 config.HUMANOID 中的一组椭圆定义，供蜂群模块约束粒子。
 *
 * 模块接口（所有动画模块统一）：
 *   constructor(params, config)
 *   update(dt, phase, phaseProgress, totalTime)
 *   draw(ctx)
 *   reset()
 */

class HumanoidModule {
  constructor(params, config) {
    this.config = config;
    this.params = params;
    // 呼吸相位（秒），极缓慢
    this.breathPhase = 0;
    this.breathPeriod = 5.5; // 一次呼吸 5.5 秒
    this.reset();
  }

  reset() {
    this.breathPhase = 0;
    this.currentScale = 1.0;
    this.currentGlow = 1.0;
  }

  update(dt, phase, phaseProgress, totalTime) {
    // 呼吸：极轻微的缩放与光晕脉动，仅在 idle 阶段稍明显，之后几乎不可察
    this.breathPhase += dt;
    const t = (this.breathPhase % this.breathPeriod) / this.breathPeriod;
    const breath = Math.sin(t * Math.PI * 2);
    // 缩放幅度 ±0.004，肉眼几乎不可察但有生命感
    this.currentScale = 1.0 + breath * 0.004;
    // 光晕脉动 ±0.15
    this.currentGlow = 1.0 + breath * 0.15;
  }

  draw(ctx) {
    const { DESIGN_WIDTH, DESIGN_HEIGHT, COLORS, HUMANOID } = this.config;
    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.currentScale, this.currentScale);
    ctx.translate(-cx, -cy);

    // 外发光层（柔和）
    ctx.save();
    ctx.globalAlpha = 0.08 * this.currentGlow;
    ctx.fillStyle = 'rgba(140, 150, 200, 1)';
    ctx.filter = 'blur(40px)';
    this._drawBodyEllipses(ctx, cx, cy, HUMANOID, true);
    ctx.restore();

    // 主体填充
    ctx.fillStyle = COLORS.humanoid.fill;
    this._drawBodyEllipses(ctx, cx, cy, HUMANOID, true);

    // 轮廓线
    ctx.strokeStyle = COLORS.humanoid.outline;
    ctx.lineWidth = 1.5;
    this._drawBodyEllipses(ctx, cx, cy, HUMANOID, false);

    ctx.restore();
  }

  /**
   * 绘制身体所有椭圆。
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - 画布中心 x
   * @param {number} cy - 画布中心 y
   * @param {Object} regions - HUMANOID 椭圆定义
   * @param {boolean} fill - true 填充，false 描边
   */
  _drawBodyEllipses(ctx, cx, cy, regions, fill) {
    ctx.beginPath();
    for (const key of Object.keys(regions)) {
      const [ox, oy, rx, ry] = regions[key];
      ctx.moveTo(cx + ox + rx, cy + oy);
      ctx.ellipse(cx + ox, cy + oy, rx, ry, 0, 0, Math.PI * 2);
    }
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
}

window.HumanoidModule = HumanoidModule;
