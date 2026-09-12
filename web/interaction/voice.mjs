/**
 * 筑巢 / Nesting · 录音采集（web/interaction/voice.mjs）
 * ------------------------------------------------------------
 * 只做一件事：把观众对着麦克风说的一句话录下来，并在退出时彻底清掉。
 *
 * 隐私约定（与 AGENTS.md 一致）：
 * - 不落盘、不上传、不写日志；录音只存在于当前页面的内存与 Blob URL 中。
 * - dispose() 必须停止全部音轨并释放 Blob URL；退出、切换模式、离开页面都要调用。
 * - 转写不在这里做：ASR 未接入时由调用方提供并明确标注，见 decodeTranscript。
 *
 * 之所以独立成模块：录音生命周期（申请权限 → 录制 → 停止 → 释放）
 * 是隐私与设备权限的关键路径，必须能在 Node 里用桩测试，而不是只在浏览器里手点。
 */

export class VoiceRecorder {
  constructor({ mediaDevices, Recorder, urlApi, now } = {}) {
    this.mediaDevices = mediaDevices ?? globalThis.navigator?.mediaDevices ?? null;
    this.Recorder = Recorder ?? globalThis.MediaRecorder ?? null;
    this.urlApi = urlApi ?? globalThis.URL ?? null;
    this.now = now ?? (() => Date.now());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.url = null;
    this.startedAt = 0;
    this.seconds = 0;
  }

  static supported(scope = globalThis) {
    return Boolean(scope.navigator?.mediaDevices?.getUserMedia && scope.MediaRecorder);
  }

  get recording() {
    return Boolean(this.recorder && this.recorder.state === 'recording');
  }

  async start() {
    if (this.recording) return false;
    if (!this.mediaDevices?.getUserMedia || !this.Recorder) {
      throw new Error('当前浏览器不支持录音');
    }
    this.releaseUrl();
    this.stream = await this.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new this.Recorder(this.stream);
    this.recorder.addEventListener('dataavailable', event => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start();
    this.startedAt = this.now();
    return true;
  }

  /** 停止录音；返回可回放的 Blob URL 与时长，不返回音频数据本身。 */
  async stop() {
    if (!this.recorder) return null;
    const recorder = this.recorder;
    const stopped = new Promise(resolve => {
      recorder.addEventListener('stop', resolve, { once: true });
    });
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    this.seconds = Math.max(0, Math.round((this.now() - this.startedAt) / 1000));
    this.stopTracks();
    const blob = new Blob(this.chunks, { type: this.chunks[0]?.type || 'audio/webm' });
    this.chunks = [];
    this.recorder = null;
    this.url = blob.size > 0 && this.urlApi ? this.urlApi.createObjectURL(blob) : null;
    return { url: this.url, seconds: this.seconds, bytes: blob.size };
  }

  /** 只在停止录音时调用：权限与音轨必须立刻归还，不能让麦克风在后台继续开着。 */
  stopTracks() {
    for (const track of this.stream?.getTracks?.() ?? []) {
      try { track.stop(); } catch { /* 已停止的音轨忽略 */ }
    }
    this.stream = null;
  }

  releaseUrl() {
    if (this.url && this.urlApi?.revokeObjectURL) {
      try { this.urlApi.revokeObjectURL(this.url); } catch { /* 已释放的 URL 忽略 */ }
    }
    this.url = null;
  }

  /** 退出、切换模式或离开页面时必须调用：停止音轨、释放 URL、清空分片。 */
  dispose() {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch { /* 已停止的录制器忽略 */ }
    this.recorder = null;
    this.stopTracks();
    this.chunks = [];
    this.releaseUrl();
    this.seconds = 0;
  }
}

/**
 * 探测语音识别能力。
 * ASR 未接入时服务端如实返回 available:false，客户端据此提示观众自己写文字，
 * 而不是假装录音已经被识别；探测失败也按「不可用」处理，绝不猜测可用。
 */
export async function transcribeCapability({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl('/api/transcribe', { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    return { available: Boolean(data.available), notice: data.notice || '' };
  } catch {
    return { available: false, notice: '语音识别未接入：请把这句话写进输入框。' };
  }
}

/**
 * 解码一句转写文本。ASR 未接入：转写由调用方提供，服务端会明确标注
 * 结果是不是模型判断，前端不得把「未解码」显示成模型结论。
 */
export async function decodeTranscript(transcript, { fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl('/api/decode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '解码未完成');
  return data;
}

/**
 * 从解码结果里取出可追溯证据（逐项对应表的行）。
 * 只做清洗与保序，不改写内容：界面上要展示的必须是派生时写下的原话规则。
 */
export function traceRows(decoded) {
  const rows = Array.isArray(decoded?.trace) ? decoded.trace : [];
  return rows
    .filter(row => row && typeof row.from === 'string' && typeof row.to === 'string' && typeof row.rule === 'string')
    .map(row => ({ from: row.from, to: row.to, rule: row.rule }));
}

/** 由解码结果生成视觉模块需要的蜂体规格与来源标注。 */
export function beeSpecFrom(decoded) {
  if (!decoded || !decoded.bee) return null;
  const mode = decoded.mode;
  const tone = decoded.decode?.tone;
  const meaning = decoded.decode?.meaning;
  let caption;
  let isLive = false;
  if (mode === 'live' && tone) {
    isLive = true;
    caption = '语气：' + tone.label + (meaning ? ' · 方向：' + meaning.direction : '');
  } else if (mode === 'demo' && tone) {
    // 演示素材：有语气值，但它是人工写的，不能标成模型判断
    caption = '人工占位示例（未调用模型）· 语气：' + tone.label;
  } else {
    caption = '未解码 · 语气与含义未接入模型';
  }
  // decode 是模型的原始判断（语气证据 / 关键词 / 分段角色 / 不确定性）。
  // 视觉层要用它画出「AI 是怎么听懂这句话的」，所以必须随 beeSpec 一起下发；
  // 未接入模型时为 null，视觉层据此标注「未解码」，不得编造。
  return Object.assign({}, decoded.bee, {
    decoded: isLive,
    caption,
    decode: decoded.decode || null,
  });
}

/**
 * 到点但还没发声的蜂。
 * played 里只记"真的响过"的那些：静音期间出现过的蜂不记，取消静音时才有得补。
 */
export function dueVoices(bees, played, time) {
  if (!Array.isArray(bees)) return [];
  return bees.filter(bee => bee && typeof bee.transcript === 'string'
    && typeof bee.appearAt === 'number'
    && time >= bee.appearAt
    && !played.has(bee.transcript));
}

/**
 * 补一声：静音期间错过了几只，取消静音时只补最近的那一只 ——
 * 一次把所有错过的一起放出来只会变成噪音，补最近一只才听得清"蜂的声音"是什么。
 */
export function catchUpVoice(bees, played, time) {
  const due = dueVoices(bees, played, time);
  if (!due.length) return null;
  return due.reduce((latest, bee) => (bee.appearAt >= latest.appearAt ? bee : latest), due[0]);
}

/** 读取演示素材（人工占位解码结果）。失败时返回空数组，界面据此隐藏演示入口。 */
export async function loadDemoItems({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl('/api/demo', { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}
