const CHANNEL = 'nesting';
const VERSION = '0.1';
export function sameOriginUrl(path, location) {
  const url = new URL(path, location.href);
  if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('模块必须来自同一本地服务');
  return url.href;
}
export class VisualBridge {
  constructor({ frame, url, onStatus, onError, scope = window }) {
    this.scope = scope;
    this.element = frame;
    this.onStatus = onStatus;
    this.onError = onError;
    this.ready = false;
    this.current = null;
    this.lastFrame = null;
    this.timeout = null;
    this.listener = event => this.receive(event);
    this.onLoad = () => this.hello();
    this.scope.addEventListener('message', this.listener);
    this.element.addEventListener('load', this.onLoad);
    if (url) {
      this.element.src = sameOriginUrl(url, this.scope.location);
      this.timeout = this.scope.setTimeout(() => {
        if (!this.ready) this.onStatus('unavailable');
      }, 8000);
    }
  }
  post(type, payload, sessionId = this.current?.sessionId ?? null) {
    this.element.contentWindow?.postMessage({ channel: CHANNEL, version: VERSION, type, sessionId, payload }, this.scope.location.origin);
  }
  hello() { this.ready = false; this.post('hello', {}); }
  receive(event) {
    if (event.origin !== this.scope.location.origin || event.source !== this.element.contentWindow) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.version !== VERSION) return;
    if (data.type === 'ready') {
      if (this.ready) return;
      this.ready = true;
      this.scope.clearTimeout(this.timeout);
      this.onStatus('ready');
      if (this.current) {
        this.post('load', this.current.payload);
        if (this.lastFrame) this.post('frame', this.lastFrame);
      } else this.post('reset', {});
    }
    if (data.type === 'error' && this.current && data.sessionId === this.current.sessionId) {
      this.onError('视觉暂时无法播放。已暂停，可以退出后重新开始。');
    }
  }
  load(sessionId, payload) {
    this.reset();
    this.current = { sessionId, payload };
    this.lastFrame = null;
    if (this.ready) this.post('load', payload);
  }
  frame(payload) {
    if (!this.current) return;
    this.lastFrame = payload;
    if (this.ready) this.post('frame', payload);
  }
  reset() {
    if (this.ready) this.post('reset', {});
    this.current = null;
    this.lastFrame = null;
  }
  dispose() {
    this.reset();
    this.scope.clearTimeout(this.timeout);
    this.scope.removeEventListener('message', this.listener);
    this.element.removeEventListener('load', this.onLoad);
    this.element.removeAttribute('src');
  }
}
export class AudioBridge {
  constructor(onError) { this.module = null; this.enabled = false; this.onError = onError; this.epoch = 0; this.toggling = false; }
  attach(module) {
    for (const key of ['unlock', 'load', 'frame', 'setMuted', 'reset', 'dispose']) {
      if (typeof module?.[key] !== 'function') throw new Error('声音模块接口不完整');
    }
    this.module = module;
    this.call('setMuted', true);
  }
  call(method, ...args) {
    try {
      const active = this.module;
      const epoch = this.epoch;
      const result = active?.[method](...args);
      if (result?.catch) result.catch(() => { if (this.module === active && this.epoch === epoch) this.fail(); });
      return result;
    } catch { this.fail(); }
  }
  fail() {
    const old = this.module;
    this.module = null;
    this.enabled = false;
    try { const result = old?.reset(); result?.catch?.(() => {}); } catch { /* Already failing; do not recurse. */ }
    this.onError('声音暂不可用，画面仍可继续。');
  }
  async toggle() {
    if (!this.module || this.toggling) return this.enabled;
    const epoch = this.epoch;
    this.toggling = true;
    try {
      if (!this.enabled) await this.module.unlock();
      if (!this.module || epoch !== this.epoch) return false;
      this.enabled = !this.enabled;
      this.call('setMuted', !this.enabled);
      return this.enabled;
    } catch {
      if (epoch === this.epoch) this.fail();
      return false;
    } finally { if (epoch === this.epoch) this.toggling = false; }
  }
  load(payload) { this.call('load', payload); }
  frame(payload) { this.call('frame', payload); }
  reset() { this.epoch += 1; this.toggling = false; this.call('reset'); this.enabled = false; this.call('setMuted', true); }
  dispose() { this.reset(); this.call('dispose'); this.module = null; }
}
