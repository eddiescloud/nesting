export const PHASES = Object.freeze([
  { id: 'opening', start: 0, end: 8, label: '整句与拆解' },
  { id: 'first', start: 8, end: 20, label: '蜂体成形' },
  { id: 'second', start: 20, end: 32, label: '存留' },
  { id: 'weave', start: 32, end: 47, label: '声音进入' },
  { id: 'settle', start: 47, end: 57, label: '声音远去' },
  { id: 'remain', start: 57, end: 60, label: '留存' },
]);
export const phaseAt = time => PHASES.find(p => time < p.end) ?? PHASES.at(-1);

export class Session {
  constructor({ duration = 60, id = () => globalThis.crypto.randomUUID() } = {}) {
    this.duration = duration;
    this.makeId = id;
    this.reset();
  }
  reset() {
    this.state = 'idle';
    this.time = 0;
    this.lastNow = null;
    this.sessionId = null;
    this.preset = null;
  }
  start(preset) {
    if (this.state === 'playing' || this.state === 'paused') return false;
    if (!preset?.output) throw new Error('需要已校验的预设');
    this.sessionId = this.makeId();
    this.preset = preset;
    this.time = 0;
    this.lastNow = null;
    this.state = 'playing';
    return true;
  }
  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    this.lastNow = null;
    return true;
  }
  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    this.lastNow = null;
    return true;
  }
  tick(now) {
    if (this.state !== 'playing') return false;
    if (!Number.isFinite(now) || (this.lastNow !== null && now < this.lastNow)) return false;
    if (this.lastNow !== null) this.time = Math.min(this.duration, this.time + Math.max(0, now - this.lastNow) / 1000);
    this.lastNow = now;
    if (this.time >= this.duration) {
      this.state = 'complete';
      this.lastNow = null;
    }
    return true;
  }
  frame() {
    return { time: this.time, phase: phaseAt(this.time).id, playing: this.state === 'playing' };
  }
}
