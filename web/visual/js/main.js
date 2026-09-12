/**
 * 筑巢 / Nesting · 视觉模块主入口（web/visual 集成版）
 * ------------------------------------------------------------
 * 支持两种运行模式：
 *   1. 独立模式（直接打开 index.html）：本地时钟 + UI 控制（开始/暂停/重播）
 *   2. 宿主模式（在交互页面 iframe 中加载）：通过 postMessage 接收宿主时钟与指令，
 *      隐藏 UI 控制，不自走时钟。
 *
 * 协议见 docs/INTEGRATION_CONTRACT.md v0.1。
 * 参数格式见 04-AI转译/output.schema.json。
 */

(function () {
  'use strict';

  const config = window.NestingConfig;

  /* ---- 画布设置 ---- */
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / config.DESIGN_WIDTH, ch / config.DESIGN_HEIGHT);
    canvas.width = config.DESIGN_WIDTH;
    canvas.height = config.DESIGN_HEIGHT;
    canvas.style.width = (config.DESIGN_WIDTH * scale) + 'px';
    canvas.style.height = (config.DESIGN_HEIGHT * scale) + 'px';
  }
  window.addEventListener('resize', resizeCanvas);

  /* ---- 模块状态 ---- */
  let timeline = null;
  let hostAdapter = null;
  let currentParams = null;

  function getDefaultParams() {
    return {
      version: '0.1',
      sourceText: '你可以慢慢说。',
      events: [
        { id: 'a', energy: 0.25, dispersion: 0.2, turbulence: 0.3, trace: 0.8,
          rationale: '用集中的慢速轨迹表现不敢提出需要，以较长轨迹对应逐渐形成的习惯。' },
        { id: 'b', energy: 0.45, dispersion: 0.4, turbulence: 0.7, trace: 0.55,
          rationale: '方向的反复对应想表达却不知道如何开口。' },
      ],
      interaction: { weave: 0.8, settle: 0.65,
        explanation: '先前压低需要的经验，与后来被询问时表达受阻的感受，在叙述中相互关联。' },
      uncertainty: '这是基于两段简短描述的艺术解释，不能确定实际影响的程度与持续时间。',
    };
  }

  function onTimelineComplete() {
    if (!hostAdapter || !hostAdapter.isHosted()) {
      document.getElementById('btn-replay').disabled = false;
      document.getElementById('btn-play').textContent = '重播';
    }
    updatePhaseDisplay();
  }

  /**
   * （重新）初始化文字结构蜂。
   * 入口页现在只加载 bee.js（见 index.html）：旧人形/蜂群模块仍留在仓库里作为历史脚手架，
   * 但不再被加载，所以这里不再保留「未加载 bee.js 就回退旧脚手架」的死分支 ——
   * 那条分支会去 new 未定义的类并必然抛错，属于静默失败。缺失时直接报错。
   */
  function initModules(params, sourceText = '', beeSpec = null, score = null) {
    currentParams = params;
    if (!window.BeeModule) {
      throw new Error('bee.js 未加载：视觉入口缺少文字结构蜂模块');
    }
    const modules = {
      bee: new window.BeeModule(params, config, sourceText || params.sourceText, beeSpec),
    };
    if (window.HiveModule) {
      modules.hive = new window.HiveModule(params, config);
      modules.bee.hive = modules.hive;
      modules.hive.bee = modules.bee;
    }
    // 语言传播涟漪：一句话说出口，从蜂体向外扩散到画面边缘后消失。
    // 与蜂共用同一份 sourceText / beeSpec，所以波速与粗细同样可追溯到语气与分量。
    if (window.RippleModule) {
      modules.ripple = new window.RippleModule(
        params, config, sourceText || params.sourceText, beeSpec);
    }
    // AI 的理解过程：把模型对这句声音的判断（语气/含义/分段/不确定）逐层画出来。
    // decode 由 beeSpec.decode 下发，未接入模型时为 null，模块只画「未解码」，不编造。
    if (window.ReadingModule) {
      modules.reading = new window.ReadingModule(
        params, config, sourceText || params.sourceText, beeSpec);
    }
    // 声纹：消费 09-声音设计 推导出的 score；没有 score 时只画基线，不编造波形
    if (window.WaveformModule) {
      modules.waveform = new window.WaveformModule(
        Object.assign({}, params, { score: score || params.score || null }), config);
    }
    timeline = new window.Timeline(config, modules);
    timeline.onComplete = onTimelineComplete;
  }

  /* ---- 动画循环 ---- */
  let lastTime = 0;

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    ctx.fillStyle = config.COLORS.background;
    ctx.fillRect(0, 0, config.DESIGN_WIDTH, config.DESIGN_HEIGHT);

    if (timeline) {
      // 宿主模式下：timeline 由宿主 frame 消息驱动 seek/start/pause，
      // tick 仅在 playing 时推进；独立模式下 tick 自走。
      timeline.tick(dt);
      timeline.draw(ctx);
      updatePhaseDisplay();
    }

    requestAnimationFrame(frame);
  }

  /* ---- UI（仅独立模式可见） ---- */
  function updatePhaseDisplay() {
    if (!timeline) return;
    const info = timeline.getPhaseInfo();
    const phaseNames = {
      // 单蜂主线的阶段文字：与 config.DECOMPOSE 的压缩节奏对齐
      idle: '整句与拆解', enter_a: '蜂体成形', enter_b: '存留',
      weave: '声音进入', settle: '声音远去', hold: '留存',
    };
    const phaseEl = document.getElementById('phase-name');
    const timeEl = document.getElementById('time-display');
    const bar = document.getElementById('progress-bar');
    if (phaseEl) phaseEl.textContent = phaseNames[info.phase] || info.phase;
    if (timeEl) timeEl.textContent = info.time.toFixed(1) + ' / ' + info.total + 's';
    if (bar) bar.style.width = (info.time / info.total * 100) + '%';
  }

  function togglePlay() {
    if (!timeline) return;
    if (timeline.playing) {
      timeline.pause();
      document.getElementById('btn-play').textContent = '继续';
    } else {
      if (timeline.currentTime >= timeline.totalDuration) timeline.reset();
      timeline.start();
      document.getElementById('btn-play').textContent = '暂停';
      document.getElementById('btn-replay').disabled = true;
    }
  }

  function replay() {
    if (!timeline) return;
    timeline.reset();
    timeline.start();
    document.getElementById('btn-play').textContent = '暂停';
    document.getElementById('btn-replay').disabled = true;
  }

  /* ---- 宿主模式回调 ---- */
  function onHostLoad(output, payload = {}) {
    if (output) {
      // bees 在 payload 顶层（与 output 平级）；BeeModule 读 params.bees，需显式合并
      const params = Array.isArray(payload.bees) && payload.bees.length
        ? Object.assign({}, output, { bees: payload.bees })
        : output;
      initModules(params, payload.sourceText || output.sourceText || '',
                  payload.beeSpec || null, payload.score || null);
      // load 后准备好但不开始，等待 frame 指令
      timeline.externalClock = true; // 保持宿主时钟模式
      timeline.pause();
      timeline.seek(0);
      // 关键：重建模块后必须同步更新 hostAdapter 的 timeline 引用，
      // 否则 frame 消息仍操作旧实例
      if (hostAdapter) hostAdapter.timeline = timeline;
    } else {
      // reset：清空
      if (timeline) timeline.reset();
      currentParams = null;
    }
  }

  function onHostError(message) {
    console.error('[视觉模块] 宿主错误:', message);
  }

  /* ---- 启动 ---- */
  async function main() {
    resizeCanvas();

    // 判断是否在 iframe 中
    const inIframe = window.parent !== window;

    if (inIframe) {
      // 宿主模式：隐藏 UI，等待宿主指令
      document.getElementById('controls').style.display = 'none';
      document.getElementById('header').style.display = 'none';
      // 先用默认参数初始化（宿主 load 后会替换）
      initModules(getDefaultParams());
      timeline.externalClock = true; // 宿主模式：时间由宿主 frame 消息驱动，不自走时钟
      timeline.pause();
      // 连接宿主
      hostAdapter = new window.HostAdapter({
        timeline, config,
        onLoad: onHostLoad,
        onError: onHostError,
      });
      hostAdapter.connect();
    } else {
      // 独立模式：加载 params/demo.json（失败则用内置默认），显示 UI
      let params = getDefaultParams();
      let score = null;
      try {
        const resp = await fetch('params/demo.json');
        if (resp.ok) params = await resp.json();
      } catch (e) {
        console.warn('无法加载 params/demo.json，使用内置默认参数。');
      }
      try {
        const resp = await fetch('params/score.demo.json');
        if (resp.ok) score = await resp.json();
      } catch (e) {
        console.warn('无法加载 params/score.demo.json，声纹只画基线。');
      }
      initModules(params, params.sourceText || '', params.beeSpec || null, score);

      document.getElementById('btn-play').addEventListener('click', togglePlay);
      document.getElementById('btn-replay').addEventListener('click', replay);

      // 显示文字来源；旧脚手架未加载时仍显示参数信息
      const infoEl = document.getElementById('param-info');
      if (infoEl && window.BeeModule) {
        infoEl.textContent = '文字样本：' + (params.sourceText || '有些话会留下') +
          (params.beeSpec && params.beeSpec.caption ? ' · ' + params.beeSpec.caption : ' · 未解码');
      } else if (infoEl && params.events) {
        infoEl.textContent =
          'weave=' + params.interaction.weave +
          '  settle=' + params.interaction.settle +
          '  |  A: e=' + params.events[0].energy +
          ' d=' + params.events[0].dispersion +
          ' t=' + params.events[0].turbulence +
          ' tr=' + params.events[0].trace +
          '  |  B: e=' + params.events[1].energy +
          ' d=' + params.events[1].dispersion +
          ' t=' + params.events[1].turbulence +
          ' tr=' + params.events[1].trace;
      }
    }

    lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
