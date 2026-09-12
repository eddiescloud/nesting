/**
 * 筑巢 / Nesting · 交织与沉积模块
 * ------------------------------------------------------------
 * 负责两组蜂群的交织连线与薄层沉积。
 *
 * 规则（与 03-蜂群与融合规则.md 对齐）：
 *   1. 32–47 秒（weave 阶段）：每组前 round(48 × weave) 个粒子按固定顺序结对，
 *      连接轨迹逐渐显现；其余粒子保持自身轨迹。
 *   2. 47–57 秒（settle 阶段）：结对轨迹中 round(配对数 × settle) 对转为薄层网纹；
 *      未沉积的线条逐渐淡出。
 *   3. 薄层颜色混合两个来源；基础透明度取两组残留透明度的均值。
 *   4. 每个转成薄层的粒子同步淡出，不新增"下一代"蜜蜂。
 *
 * 依赖：需要 SwarmModule 实例以读取粒子位置并冻结已沉积粒子。
 *
 * 模块接口：constructor(params, config, swarmModule) / update / draw / reset
 */

class WeaveModule {
  constructor(params, config, swarmModule) {
    this.config = config;
    this.params = params;
    this.swarm = swarmModule;

    const weave = params.interaction.weave;
    const settle = params.interaction.settle;
    const { SWARM } = config;

    // 结对数量 = round(48 × weave)；取整走 half-up，与 09 声音端一致
    this.pairCount = config.roundHalfUp(SWARM.particlesPerGroup * weave);
    // 沉积数量 = round(配对数 × settle)
    this.depositedCount = config.roundHalfUp(this.pairCount * settle);

    // 结对列表：A 组第 i 个 ↔ B 组第 i 个（固定顺序）
    this.pairs = [];
    for (let i = 0; i < this.pairCount; i++) {
      this.pairs.push({ aIdx: i, bIdx: i, deposited: i < this.depositedCount });
    }

    // 薄层基础透明度 = 两组残留透明度的均值
    const traceAlphaA = config.traceAlphaFor(params.events[0].trace);
    const traceAlphaB = config.traceAlphaFor(params.events[1].trace);
    this.baseMeshAlpha = (traceAlphaA + traceAlphaB) / 2;

    // 混合颜色
    this.meshColor = config.mixHSL(config.COLORS.groupA, config.COLORS.groupB, 0.5);

    // 运行时状态
    this._resetState();
  }

  _resetState() {
    // 连线透明度（weave 阶段淡入）
    this.lineAlpha = 0;
    // 已沉积对的网格端点（冻结时记录）
    this.depositedEndpoints = []; // [{ax, ay, bx, by}]
    // 网格是否已冻结
    this.meshFrozen = false;
    // 网格形成进度 0-1
    this.meshProgress = 0;
    // 未沉积连线的淡出进度 0-1（1=完全淡出）
    this.undepositedFade = 0;
    // 是否已通知 swarm 冻结粒子
    this._frozenNotified = false;
  }

  reset() {
    this._resetState();
  }

  /* ---- 更新 ---- */

  update(dt, phase, phaseProgress, totalTime) {
    const { WEAVE } = this.config;

    if (phase === 'weave') {
      // 连线淡入：前 lineFadeInRatio 阶段内淡入
      if (phaseProgress < WEAVE.lineFadeInRatio) {
        this.lineAlpha = phaseProgress / WEAVE.lineFadeInRatio;
      } else {
        this.lineAlpha = 1;
      }
    } else if (phase === 'settle') {
      // 在 settle 阶段开始时冻结已沉积粒子（仅一次）
      if (!this._frozenNotified) {
        this._freezeDepositedParticles();
        this._frozenNotified = true;
      }

      // 网格形成：前 depositFormRatio 阶段内逐渐形成
      if (phaseProgress < WEAVE.depositFormRatio) {
        this.meshProgress = phaseProgress / WEAVE.depositFormRatio;
      } else {
        this.meshProgress = 1;
      }

      // 未沉积连线淡出
      if (phaseProgress < WEAVE.undepositedFadeRatio) {
        this.undepositedFade = phaseProgress / WEAVE.undepositedFadeRatio;
      } else {
        this.undepositedFade = 1;
      }
    } else if (phase === 'hold') {
      // 保持最终状态
      this.meshProgress = 1;
      this.undepositedFade = 1;
    }
  }

  /** 冻结已沉积对的粒子，并记录端点位置 */
  _freezeDepositedParticles() {
    this.depositedEndpoints = [];
    for (const pair of this.pairs) {
      if (!pair.deposited) continue;
      const a = this.swarm.getParticlePos(0, pair.aIdx);
      const b = this.swarm.getParticlePos(1, pair.bIdx);
      this.depositedEndpoints.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      // 通知蜂群模块冻结这两个粒子
      this.swarm.freezeParticle(0, pair.aIdx);
      this.swarm.freezeParticle(1, pair.bIdx);
    }
  }

  /* ---- 绘制 ---- */

  draw(ctx) {
    if (this.pairCount === 0) return;

    const { WEAVE, COLORS } = this.config;

    // 1. 绘制结对连线（weave 阶段 + settle 阶段未沉积的对）
    if (this.lineAlpha > 0.01) {
      for (let i = 0; i < this.pairs.length; i++) {
        const pair = this.pairs[i];

        // 已沉积的对：在网格中绘制，不在这里画动态连线
        if (pair.deposited && this.meshFrozen) continue;

        // 未沉积的对：在 settle 阶段逐渐淡出
        let alpha = this.lineAlpha;
        if (!pair.deposited) {
          alpha *= (1 - this.undepositedFade);
        }
        if (alpha <= 0.01) continue;

        const a = this.swarm.getParticlePos(0, pair.aIdx);
        const b = this.swarm.getParticlePos(1, pair.bIdx);

        // 只有两个粒子都可见时才画线
        if (a.alpha <= 0.01 || b.alpha <= 0.01) continue;

        // 连线颜色：从 A 色渐变到 B 色
        const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        gradient.addColorStop(0, this.config.hsl(COLORS.groupA, alpha * COLORS.weaveLine.alpha));
        gradient.addColorStop(1, this.config.hsl(COLORS.groupB, alpha * COLORS.weaveLine.alpha));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = WEAVE.pairLineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // 2. 绘制薄层网格（settle 阶段及之后）
    if (this.meshProgress > 0.01 && this.depositedEndpoints.length > 0) {
      this._drawMesh(ctx);
    }
  }

  /** 绘制薄层网纹 */
  _drawMesh(ctx) {
    const { WEAVE, COLORS } = this.config;
    const alpha = this.baseMeshAlpha * this.config.smoothstep(this.meshProgress) * COLORS.depositMesh.alpha;

    if (alpha <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.config.hsl(this.meshColor, 1);
    ctx.lineWidth = WEAVE.meshLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 收集所有端点
    const endpoints = [];
    for (const ep of this.depositedEndpoints) {
      endpoints.push({ x: ep.ax, y: ep.ay });
      endpoints.push({ x: ep.bx, y: ep.by });
    }

    // 2a. 结对连线（A_i ↔ B_i）
    ctx.beginPath();
    for (const ep of this.depositedEndpoints) {
      ctx.moveTo(ep.ax, ep.ay);
      ctx.lineTo(ep.bx, ep.by);
    }
    ctx.stroke();

    // 2b. 交叉连接：距离小于阈值的端点之间连线，形成网纹
    const crossThreshold = 180 * this.config.HEIGHT_SCALE;
    ctx.beginPath();
    for (let i = 0; i < endpoints.length; i++) {
      for (let j = i + 1; j < endpoints.length; j++) {
        const dx = endpoints[i].x - endpoints[j].x;
        const dy = endpoints[i].y - endpoints[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < crossThreshold) {
          // 越近的线越完整，远的线只画一部分（用透明度区分，但这里统一 alpha）
          ctx.moveTo(endpoints[i].x, endpoints[i].y);
          ctx.lineTo(endpoints[j].x, endpoints[j].y);
        }
      }
    }
    ctx.stroke();

    // 2c. 端点处的小结点（纤维交叉点）
    ctx.fillStyle = this.config.hsl(this.meshColor, 0.8);
    for (const ep of endpoints) {
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2d. 微弱发光层
    ctx.globalAlpha = alpha * 0.3;
    ctx.filter = 'blur(4px)';
    ctx.strokeStyle = this.config.hsl(this.meshColor, 1);
    ctx.lineWidth = WEAVE.meshLineWidth * 2;
    ctx.beginPath();
    for (const ep of this.depositedEndpoints) {
      ctx.moveTo(ep.ax, ep.ay);
      ctx.lineTo(ep.bx, ep.by);
    }
    ctx.stroke();
    ctx.filter = 'none';

    ctx.restore();

    // 标记网格已冻结（用于跳过动态连线绘制）
    if (this.meshProgress >= 1) {
      this.meshFrozen = true;
    }
  }
}

window.WeaveModule = WeaveModule;
