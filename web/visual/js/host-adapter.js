/**
 * 筑巢 / Nesting · 视觉模块宿主通信适配
 * ------------------------------------------------------------
 * 实现 docs/INTEGRATION_CONTRACT.md v0.1 协议。
 * 当视觉模块在 iframe 中加载时，通过 postMessage 与交互宿主通信：
 *   接收：hello / load / frame / reset
 *   发送：ready / error
 *
 * 宿主时钟优先：收到 frame 消息后，按宿主提供的 time/phase/playing 更新，
 * 不自走时钟。独立打开（非 iframe）时回退到本地时钟与 UI 控制。
 *
 * 阶段名映射（宿主 → 内部）：
 *   opening → idle      first → enter_a    second → enter_b
 *   weave   → weave     settle → settle    remain → hold
 */

(function () {
  'use strict';

  const CHANNEL = 'nesting';
  const VERSION = '0.1';

  const HOST_TO_INTERNAL_PHASE = {
    opening: 'idle',
    first: 'enter_a',
    second: 'enter_b',
    weave: 'weave',
    settle: 'settle',
    remain: 'hold',
  };

  class HostAdapter {
    constructor({ timeline, config, onLoad, onError }) {
      this.timeline = timeline;
      this.config = config;
      this.onLoad = onLoad;   // 收到 load 时的回调(params)
      this.onError = onError; // 错误回调(message)
      this.sessionId = null;
      this.inIframe = window.parent !== window;
      this.hostOrigin = null;
      this._bound = false;
    }

    /** 是否运行在 iframe 中（由宿主管理） */
    isHosted() {
      return this.inIframe;
    }

    /** 开始监听宿主消息 */
    connect() {
      if (!this.inIframe) return;
      if (this._bound) return;
      this._bound = true;
      window.addEventListener('message', (event) => this._receive(event));
      // 主动发送 ready（有些宿主在 iframe load 后发 hello，有些等待 ready）
      this._send('ready', {});
    }

    /** 发送消息给宿主 */
    _send(type, payload) {
      if (!this.inIframe) return;
      const target = this.hostOrigin || '*';
      window.parent.postMessage(
        { channel: CHANNEL, version: VERSION, type, sessionId: this.sessionId, payload },
        target
      );
    }

    /** 接收宿主消息 */
    _receive(event) {
      const data = event.data;
      if (!data || data.channel !== CHANNEL || data.version !== VERSION) return;

      // 安全校验 1：消息来源必须是宿主窗口（window.parent）
      // 若 event.source 为空（某些边缘情况）则放宽；非空且不等于宿主则忽略
      if (event.source && event.source !== window.parent) return;

      // 安全校验 2：frame 消息必须匹配当前 sessionId，防止过期 session 篡改场景
      if (data.type === 'frame' && data.sessionId !== this.sessionId) return;

      // 记录宿主 origin（第一条消息后）
      if (!this.hostOrigin && event.origin) {
        this.hostOrigin = event.origin;
      }

      try {
        switch (data.type) {
          case 'hello':
            this._send('ready', {});
            break;
          case 'load':
            this._handleLoad(data);
            break;
          case 'frame':
            this._handleFrame(data);
            break;
          case 'reset':
            this._handleReset();
            break;
          default:
            // 未知类型不报错，忽略
            break;
        }
      } catch (err) {
        const msg = err && err.message ? err.message : '视觉模块内部错误';
        if (this.onError) this.onError(msg);
        this._send('error', { message: msg });
      }
    }

    /** 处理 load：载入参数，准备但不开始 */
    _handleLoad(data) {
      this.sessionId = data.sessionId;
      const payload = data.payload || {};
      const output = payload.output;
      if (!output || !output.events || !output.interaction) {
        throw new Error('load 缺少有效的 output 参数');
      }
      // 校验基本结构
      if (!Array.isArray(output.events) || output.events.length !== 2) {
        throw new Error('output.events 必须是两段');
      }
      for (const ev of output.events) {
        for (const key of ['energy', 'dispersion', 'turbulence', 'trace']) {
          if (typeof ev[key] !== 'number' || ev[key] < 0 || ev[key] > 1) {
            throw new Error('事件参数 ' + key + ' 必须是 0-1 的数字');
          }
        }
      }
      if (typeof output.interaction.weave !== 'number' || typeof output.interaction.settle !== 'number') {
        throw new Error('interaction.weave / settle 必须是数字');
      }
      // 通知主入口重新初始化模块
      // 第二个参数保留可选的转写来源（sourceText），不改变旧 output schema。
      if (this.onLoad) this.onLoad(output, payload);
    }

    /** 处理 frame：按宿主时钟更新 */
    _handleFrame(data) {
      const payload = data.payload || {};
      const time = typeof payload.time === 'number' ? payload.time : 0;
      const playing = payload.playing === true;
      // 映射阶段名（如果宿主提供了 phase）
      const hostPhase = payload.phase;
      const internalPhase = hostPhase ? (HOST_TO_INTERNAL_PHASE[hostPhase] || hostPhase) : null;

      // 跳转到宿主时间
      this.timeline.seek(time);
      if (playing) {
        this.timeline.start();
      } else {
        this.timeline.pause();
      }
      // 立即同步模块状态（激活粒子、更新阶段等），确保 seek 后画面与时间一致
      if (typeof this.timeline.sync === 'function') {
        this.timeline.sync();
      }
      // 如果宿主提供了阶段且与当前计算不一致，以宿主为准（记录用）
      this._lastHostPhase = internalPhase;
    }

    /** 处理 reset：清空全部状态 */
    _handleReset() {
      this.sessionId = null;
      this.timeline.reset();
      if (this.onLoad) this.onLoad(null); // 通知主入口清空
    }
  }

  window.HostAdapter = HostAdapter;
  window.HOST_TO_INTERNAL_PHASE = HOST_TO_INTERNAL_PHASE;
})();
