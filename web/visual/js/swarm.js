/**
 * 筑巢 / Nesting · 蜂群运动模块
 * ------------------------------------------------------------
 * 管理两组蜂形粒子的运动、进入、轨迹与淡出。
 * 每组固定 48 个粒子，参数来自 output.schema.json 的 events[0]/events[1]。
 *
 * 物理模型（与 03-蜂群与融合规则.md 对齐）：
 *   - 速度 = 12 + 60 × energy（按画布高度缩放）
 *   - 群体半径 = 20 + 100 × dispersion
 *   - 扰动幅度 = 2 + 22 × turbulence
 *   - 残留透明度 = 0.12 + 0.48 × trace
 *
 * 力模型：
 *   1. 朝群体中心的回归力（dispersion 越高，回归越弱，粒子越散）
 *   2. 切向轨道力（energy 越高，轨道速度越快）
 *   3. 随机扰动力（turbulence 越高，方向变化越频繁）
 *
 * 与交织模块的协作：
 *   - 暴露 groups[].particles 供读取位置
 *   - freezeParticle(groupIdx, pIdx) 标记粒子为已沉积（停止运动、逐渐淡出）
 *
 * 模块接口：constructor / update / draw / reset
 */

class SwarmModule {
  constructor(params, config) {
    this.config = config;
    this.params = params;
    this.groups = [];
    this._initGroups();
  }

  /* ---- 初始化 ---- */

  _initGroups() {
    const { SWARM, DESIGN_WIDTH, DESIGN_HEIGHT } = this.config;
    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT / 2;

    for (let gi = 0; gi < 2; gi++) {
      const ev = this.params.events[gi];
      const group = {
        eventId: ev.id,
        energy: ev.energy,
        dispersion: ev.dispersion,
        turbulence: ev.turbulence,
        trace: ev.trace,
        // 群体中心：A 组偏上胸，B 组偏下腹，缓慢漂移
        centerX: cx + (gi === 0 ? -40 : 40),
        centerY: cy + (gi === 0 ? -300 : 50),
        centerVX: 0,
        centerVY: 0,
        // 中心漂移的噪声相位
        noisePhase: gi * 100,
        particles: [],
      };

      for (let pi = 0; pi < SWARM.particlesPerGroup; pi++) {
        // 初始位置：在群体中心周围按角度分布
        const angle = (pi / SWARM.particlesPerGroup) * Math.PI * 2;
        const startRadius = this.config.radiusFor(group.dispersion) * (0.3 + Math.random() * 0.7);
        group.particles.push({
          x: group.centerX + Math.cos(angle) * startRadius,
          y: group.centerY + Math.sin(angle) * startRadius,
          vx: 0,
          vy: 0,
          trail: [],
          alpha: 0,
          active: false,      // 是否已进入
          deposited: false,   // 是否已沉积（冻结并淡出）
          // 个体差异：每个粒子有轻微的参数偏移，避免完全同步
          energyOffset: 0.85 + Math.random() * 0.3,
          turbulenceOffset: 0.7 + Math.random() * 0.6,
          // 轨道方向：一半顺时针，一半逆时针
          orbitDir: Math.random() > 0.5 ? 1 : -1,
          // 进入起点（在人形外部）
          entryX: gi === 0 ? cx + (Math.random() - 0.5) * 300 : cx + (Math.random() > 0.5 ? 400 : -400),
          entryY: gi === 0 ? cy - 900 - Math.random() * 100 : cy + 800 + Math.random() * 200,
        });
      }
      this.groups.push(group);
    }
  }

  /* ---- 公开接口：供交织模块调用 ---- */

  /** 获取指定粒子的当前位置 */
  getParticlePos(groupIdx, pIdx) {
    const p = this.groups[groupIdx].particles[pIdx];
    return { x: p.x, y: p.y, alpha: p.alpha };
  }

  /** 标记粒子为已沉积：停止运动，开始淡出 */
  freezeParticle(groupIdx, pIdx) {
    const p = this.groups[groupIdx].particles[pIdx];
    if (p && !p.deposited) {
      p.deposited = true;
      p.vx = 0;
      p.vy = 0;
    }
  }

  /** 获取某组中未沉积的活跃粒子数量 */
  getActiveCount(groupIdx) {
    return this.groups[groupIdx].particles.filter(p => p.active && !p.deposited).length;
  }

  /* ---- 更新 ---- */

  update(dt, phase, phaseProgress, totalTime) {
    for (let gi = 0; gi < 2; gi++) {
      const group = this.groups[gi];

      // 更新群体中心（缓慢漂移，仅在人形内部）
      this._updateGroupCenter(group, dt, gi);

      const maxSpeed = this.config.speedFor(group.energy);
      const groupRadius = this.config.radiusFor(group.dispersion);
      const turbAmp = this.config.turbulenceFor(group.turbulence);
      const trailMax = this.config.trailPointsFor(group.trace);

      for (let pi = 0; pi < group.particles.length; pi++) {
        const p = group.particles[pi];

        // 进入阶段：从外部飞入
        const isEntering = (gi === 0 && phase === 'enter_a') || (gi === 1 && phase === 'enter_b');
        // 该组是否已过进入阶段（用于兜底激活）
        const groupEntered = (gi === 0 && phase !== 'idle' && phase !== 'enter_a')
                           || (gi === 1 && phase !== 'idle' && phase !== 'enter_a' && phase !== 'enter_b');

        if (isEntering && !p.active) {
          // 逐个激活：前 70% 阶段内依次激活
          const activateThreshold = (pi / group.particles.length) * 0.7;
          if (phaseProgress >= activateThreshold) {
            p.active = true;
            p.x = p.entryX;
            p.y = p.entryY;
          }
        } else if (groupEntered && !p.active) {
          // 兜底：进入阶段已过但仍未激活的粒子，直接在群体中心附近激活
          p.active = true;
          const angle = Math.random() * Math.PI * 2;
          const r = groupRadius * 0.5;
          p.x = group.centerX + Math.cos(angle) * r;
          p.y = group.centerY + Math.sin(angle) * r;
        }

        if (!p.active) continue;

        // 已沉积：淡出，不运动（必须在淡入之前检查，否则淡入速率大于淡出速率会冲突）
        if (p.deposited) {
          p.alpha = Math.max(0, p.alpha - dt * 0.3);
          // 轨迹也逐渐缩短
          if (p.trail.length > 0 && Math.random() < dt * 2) {
            p.trail.shift();
          }
          continue;
        }

        // 淡入（仅未沉积粒子）
        if (p.alpha < 1) {
          p.alpha = Math.min(1, p.alpha + dt * 1.5);
        }

        // 进入阶段：朝群体中心的目标位置飞
        if (isEntering) {
          const targetX = group.centerX + (p.x - group.centerX) * 0.02;
          const targetY = group.centerY + (p.y - group.centerY) * 0.02;
          p.vx += (targetX - p.x) * dt * 3;
          p.vy += (targetY - p.y) * dt * 3;
        } else {
          // 正常蜂群运动

          // 1. 回归力：朝群体中心（dispersion 高则回归弱）
          const toCenterX = group.centerX - p.x;
          const toCenterY = group.centerY - p.y;
          const distToCenter = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
          if (distToCenter > 1) {
            // 超过群体半径时回归力增强，在半径内回归力弱（允许散开）
            const overRadius = Math.max(0, distToCenter - groupRadius);
            const returnStrength = (0.3 + overRadius / groupRadius * 2) * (1 - group.dispersion * 0.6);
            p.vx += (toCenterX / distToCenter) * returnStrength * dt * 60;
            p.vy += (toCenterY / distToCenter) * returnStrength * dt * 60;
          }

          // 2. 切向轨道力
          if (distToCenter > 1) {
            const tangentX = -toCenterY / distToCenter;
            const tangentY = toCenterX / distToCenter;
            const orbitStrength = maxSpeed * 0.5 * p.orbitDir;
            p.vx += tangentX * orbitStrength * dt * 2;
            p.vy += tangentY * orbitStrength * dt * 2;
          }

          // 3. 随机扰动力（turbulence）
          const turb = turbAmp * p.turbulenceOffset;
          // 使用平滑噪声：每帧小幅随机改变方向
          p._noiseAngle = (p._noiseAngle || Math.random() * Math.PI * 2)
            + (Math.random() - 0.5) * group.turbulence * 3 * dt * 60;
          p.vx += Math.cos(p._noiseAngle) * turb * dt * 30;
          p.vy += Math.sin(p._noiseAngle) * turb * dt * 30;
        }

        // 限速
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const effectiveMax = maxSpeed * p.energyOffset;
        if (speed > effectiveMax) {
          p.vx = (p.vx / speed) * effectiveMax;
          p.vy = (p.vy / speed) * effectiveMax;
        }
        // 阻尼
        p.vx *= 0.98;
        p.vy *= 0.98;

        // 更新位置
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // 约束在人形内部
        const constrained = this.config.constrainToHumanoid(p.x, p.y);
        if (constrained.x !== p.x || constrained.y !== p.y) {
          // 碰到边界时反弹一部分速度
          p.vx *= -0.3;
          p.vy *= -0.3;
        }
        p.x = constrained.x;
        p.y = constrained.y;

        // 记录轨迹
        p.trail.push({ x: p.x, y: p.y });
        while (p.trail.length > trailMax) {
          p.trail.shift();
        }
      }
    }
  }

  /** 群体中心缓慢漂移，保持在人形内部 */
  _updateGroupCenter(group, dt, gi) {
    group.noisePhase += dt * 0.3;
    // 使用正弦叠加产生平滑漂移
    const driftX = Math.sin(group.noisePhase * 0.7) * 30
                 + Math.sin(group.noisePhase * 1.3 + gi) * 15;
    const driftY = Math.cos(group.noisePhase * 0.5) * 40
                 + Math.cos(group.noisePhase * 1.1 + gi * 2) * 20;

    const baseY = this.config.DESIGN_HEIGHT / 2 + (gi === 0 ? -300 : 50);
    const baseX = this.config.DESIGN_WIDTH / 2 + (gi === 0 ? -40 : 40);

    const targetX = baseX + driftX;
    const targetY = baseY + driftY;

    // 平滑跟随
    group.centerX += (targetX - group.centerX) * dt * 0.5;
    group.centerY += (targetY - group.centerY) * dt * 0.5;

    // 确保中心在人形内部
    const c = this.config.constrainToHumanoid(group.centerX, group.centerY);
    group.centerX = c.x;
    group.centerY = c.y;
  }

  /* ---- 绘制 ---- */

  draw(ctx) {
    const { SWARM, COLORS } = this.config;

    for (let gi = 0; gi < 2; gi++) {
      const group = this.groups[gi];
      const color = gi === 0 ? COLORS.groupA : COLORS.groupB;
      const traceAlpha = this.config.traceAlphaFor(group.trace);

      for (const p of group.particles) {
        if (!p.active || p.alpha <= 0.01) continue;

        // 绘制轨迹
        if (p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let i = 1; i < p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y);
          }
          // 轨迹渐变透明度：尾部淡，头部接近粒子
          const gradient = ctx.createLinearGradient(
            p.trail[0].x, p.trail[0].y,
            p.trail[p.trail.length - 1].x, p.trail[p.trail.length - 1].y
          );
          gradient.addColorStop(0, this.config.hsl(color, 0));
          gradient.addColorStop(1, this.config.hsl(color, traceAlpha * p.alpha * 0.7));
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // 绘制粒子（带发光）
        ctx.save();
        ctx.globalAlpha = p.alpha;
        // 外发光
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, SWARM.particleGlow);
        glow.addColorStop(0, this.config.hsl(color, 0.8));
        glow.addColorStop(0.4, this.config.hsl(color, 0.3));
        glow.addColorStop(1, this.config.hsl(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, SWARM.particleGlow, 0, Math.PI * 2);
        ctx.fill();
        // 核心
        ctx.fillStyle = this.config.hsl(color, 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, SWARM.particleSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ---- 重置 ---- */

  reset() {
    this.groups = [];
    this._initGroups();
  }
}

window.SwarmModule = SwarmModule;
