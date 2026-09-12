/**
 * 筑巢 / Nesting · 时间线编排器
 * ------------------------------------------------------------
 * 管理 60 秒展示时间线，按阶段调度视觉模块。
 *
 * 阶段（与 02-体验与分镜.md 对齐）：
 *   idle     0–8s   平静人形等待
 *   enter_a  8–20s  第一组蜂群进入
 *   enter_b  20–32s 第二组蜂群进入
 *   weave    32–47s 两组交织
 *   settle   47–57s 沉积薄层
 *   hold     57–60s 静止存留
 *
 * 用法：
 *   const timeline = new Timeline(config, modules);
 *   timeline.start();
 *   timeline.tick(dt);  // 每帧调用
 *   timeline.draw(ctx); // 每帧调用
 *   timeline.reset();    // 重播
 */

class Timeline {
  constructor(config, modules) {
    this.config = config;
    this.modules = modules; // MVP: { bee }；旧脚手架仍支持 { humanoid, swarm, weave }
    this.phases = config.TIMELINE.phases;
    this.totalDuration = config.TIMELINE.total;
    this.currentTime = 0;
    this.currentPhase = 'idle';
    this.phaseProgress = 0;
    this.playing = false;
    this.onComplete = null; // 结束回调
    // externalClock = true 时，时间由宿主 frame 消息驱动，tick 不推进 currentTime，
    // 仅更新模块状态（粒子物理等），保证 hosted 模式下不自走时钟。
    this.externalClock = false;
  }

  start() {
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  reset() {
    this.currentTime = 0;
    this.currentPhase = 'idle';
    this.phaseProgress = 0;
    this.playing = false;
    for (const key of Object.keys(this.modules)) {
      if (this.modules[key] && typeof this.modules[key].reset === 'function') {
        this.modules[key].reset();
      }
    }
  }

  /** 跳转到指定时间（秒） */
  seek(time) {
    this.currentTime = this.config.clamp(time, 0, this.totalDuration);
    this._updatePhase();
  }

  /**
   * 立即同步所有模块状态（不推进时间、不检查 playing）。
   * 宿主模式下收到 frame 消息后调用，确保粒子激活、阶段状态等立即生效。
   */
  sync() {
    this._updatePhase();
    for (const key of Object.keys(this.modules)) {
      const mod = this.modules[key];
      if (mod && typeof mod.update === 'function') {
        mod.update(0, this.currentPhase, this.phaseProgress, this.currentTime);
      }
    }
  }

  /** 每帧推进 */
  tick(dt) {
    if (!this.playing) return;

    if (!this.externalClock) {
      // 独立模式：本地时钟推进
      this.currentTime += dt;
      if (this.currentTime >= this.totalDuration) {
        this.currentTime = this.totalDuration;
        this.playing = false;
        if (typeof this.onComplete === 'function') {
          this.onComplete();
        }
      }
    }
    // externalClock 模式：不推进 currentTime（由宿主 seek 控制），
    // 但仍更新模块状态以保证粒子运动平滑

    this._updatePhase();
    this.camera = this.cameraScale();

    // 调用所有模块的 update
    for (const key of Object.keys(this.modules)) {
      const mod = this.modules[key];
      if (mod && typeof mod.update === 'function') {
        mod.update(dt, this.currentPhase, this.phaseProgress, this.currentTime);
      }
    }
  }

  /**
   * 视野缩放：17 秒前近景看这一只；17–34 秒拉远，画面里出现其他语言的蜂。
   * 拉远只作用于蜂这一层——声纹是背景，始终铺满画面。
   */
  cameraScale(time = this.currentTime) {
    const camera = this.config.CAMERA;
    if (!camera) return 1;
    if (time <= camera.holdUntil) return camera.startScale;
    const p = Math.min(1, (time - camera.holdUntil) / (camera.zoomOutUntil - camera.holdUntil));
    return camera.startScale + (camera.endScale - camera.startScale) * this.config.smoothstep(p);
  }

  /** 绘制所有模块；有 bee 时不再绘制人形或旧粒子层。
   *  声纹必须在蜂之前画（它是背景）；蜂巢在蜂之下：蜂飞进巢房。 */
  draw(ctx) {
    if (this.modules.waveform && typeof this.modules.waveform.draw === 'function') {
      this.modules.waveform.draw(ctx);
    }
    if (this.modules.hive) this.modules.hive.draw(ctx);
    // 涟漪画在蜂之下：波心被蜂挡住，观众只看到向外推的环——
    // 说出口的话离开身体，收不回来。
    if (this.modules.ripple && typeof this.modules.ripple.draw === 'function') {
      this.modules.ripple.draw(ctx);
    }
    // 理解过程画在画面上部（与蜂不重叠）：先看机器怎么听懂，再看蜂长成什么样。
    if (this.modules.reading && typeof this.modules.reading.draw === 'function') {
      this.modules.reading.draw(ctx);
    }
    if (this.modules.bee) {
      const scale = this.cameraScale();
      const cx = this.config.DESIGN_WIDTH / 2;
      const cy = this.config.DESIGN_HEIGHT / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      this.modules.bee.draw(ctx);
      ctx.restore();
      return;
    }
    const order = ['humanoid', 'swarm', 'weave'];
    for (const key of order) {
      const mod = this.modules[key];
      if (mod && typeof mod.draw === 'function') {
        mod.draw(ctx);
      }
    }
  }

  /** 根据当前时间计算阶段和阶段内进度 */
  _updatePhase() {
    for (const phase of this.phases) {
      if (this.currentTime >= phase.start && this.currentTime < phase.end) {
        this.currentPhase = phase.name;
        this.phaseProgress = (this.currentTime - phase.start) / (phase.end - phase.start);
        return;
      }
    }
    // 时间到终点
    const last = this.phases[this.phases.length - 1];
    this.currentPhase = last.name;
    this.phaseProgress = 1;
  }

  /** 获取当前阶段信息 */
  getPhaseInfo() {
    return {
      phase: this.currentPhase,
      progress: this.phaseProgress,
      time: this.currentTime,
      total: this.totalDuration,
    };
  }
}

window.Timeline = Timeline;
