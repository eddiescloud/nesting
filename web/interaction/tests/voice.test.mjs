import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceRecorder, decodeTranscript, beeSpecFrom, transcribeCapability, traceRows, loadDemoItems,
         dueVoices, catchUpVoice } from '../voice.mjs';

function fakeRecorderClass(log) {
  return class FakeRecorder {
    constructor(stream) { this.stream = stream; this.state = 'inactive'; this.listeners = {}; log.push('new'); }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    start() { this.state = 'recording'; log.push('start'); }
    stop() {
      this.state = 'inactive';
      log.push('stop');
      for (const fn of this.listeners.dataavailable || []) fn({ data: { size: 12, type: 'audio/webm' } });
      for (const fn of this.listeners.stop || []) fn();
    }
  };
}

function fakeDevice(log, { fail = false } = {}) {
  const track = { stopped: false, stop() { this.stopped = true; log.push('track-stop'); } };
  return {
    track,
    mediaDevices: {
      getUserMedia: async () => {
        if (fail) throw new Error('NotAllowedError');
        log.push('getUserMedia');
        return { getTracks: () => [track] };
      },
    },
  };
}

function fakeUrl(log) {
  return {
    createObjectURL: () => { log.push('create-url'); return 'blob:fake'; },
    revokeObjectURL: (url) => { log.push('revoke:' + url); },
  };
}

test('录音 → 停止 → 回放地址，并在退出时释放音轨与地址', async () => {
  const log = [];
  const device = fakeDevice(log);
  const recorder = new VoiceRecorder({
    mediaDevices: device.mediaDevices,
    Recorder: fakeRecorderClass(log),
    urlApi: fakeUrl(log),
    now: (() => { let t = 1000; return () => (t += 3000); })(),
  });
  assert.equal(await recorder.start(), true);
  assert.equal(recorder.recording, true);
  const result = await recorder.stop();
  assert.equal(result.url, 'blob:fake');
  assert.equal(result.seconds, 3);
  assert.equal(device.track.stopped, true, '停止录音后音轨必须立刻归还');
  assert.deepEqual(log, ['getUserMedia', 'new', 'start', 'stop', 'track-stop', 'create-url']);
  recorder.dispose();
  assert.ok(log.includes('revoke:blob:fake'), '退出时必须释放 Blob 地址');
});

test('未授权时给出可读错误且不留下音轨', async () => {
  const log = [];
  const device = fakeDevice(log, { fail: true });
  const recorder = new VoiceRecorder({ mediaDevices: device.mediaDevices, Recorder: fakeRecorderClass(log), urlApi: fakeUrl(log) });
  await assert.rejects(() => recorder.start(), /NotAllowedError/);
  assert.equal(recorder.stream, null);
  assert.equal(recorder.recording, false);
});

test('dispose 可在未录音时安全调用', () => {
  const log = [];
  const recorder = new VoiceRecorder({ mediaDevices: fakeDevice(log).mediaDevices, Recorder: fakeRecorderClass(log), urlApi: fakeUrl(log) });
  recorder.dispose();
  assert.equal(recorder.recording, false);
  assert.equal(recorder.url, null);
});

test('不支持录音的环境会明确拒绝而不是静默失败', async () => {
  const recorder = new VoiceRecorder({ mediaDevices: null, Recorder: null });
  assert.equal(VoiceRecorder.supported({ navigator: {}, MediaRecorder: undefined }), false);
  await assert.rejects(() => recorder.start(), /不支持录音/);
});

test('解码结果标注来源：未接入模型时不得写成模型结论', () => {
  const undecoded = beeSpecFrom({ mode: 'undecoded', bee: { hue: 38, segmentCount: 3 } });
  assert.equal(undecoded.decoded, false);
  assert.match(undecoded.caption, /未解码/);
  const live = beeSpecFrom({ mode: 'live', bee: { hue: 200, segmentCount: 5 }, decode: { tone: { label: '压抑' }, meaning: { direction: 'inward' } } });
  assert.equal(live.decoded, true);
  assert.equal(live.hue, 200);
  assert.match(live.caption, /压抑/);
  assert.equal(beeSpecFrom(null), null);
});

test('到点的蜂才算该发声，已经响过的不重复', () => {
  const bees = [
    { transcript: '甲', appearAt: 20 },
    { transcript: '乙', appearAt: 24 },
    { transcript: '主蜂', appearAt: null },
  ];
  assert.deepEqual(dueVoices(bees, new Set(), 19).map(b => b.transcript), [], '还没到点');
  assert.deepEqual(dueVoices(bees, new Set(), 25).map(b => b.transcript), ['甲', '乙']);
  assert.deepEqual(dueVoices(bees, new Set(['甲']), 25).map(b => b.transcript), ['乙'], '响过的不重复');
  assert.deepEqual(dueVoices(null, new Set(), 25), [], '没有群蜂时返回空');
});

test('取消静音只补最近的一只，不是全部一起响', () => {
  const bees = [{ transcript: '甲', appearAt: 20 }, { transcript: '乙', appearAt: 24 }, { transcript: '丙', appearAt: 28 }];
  assert.equal(catchUpVoice(bees, new Set(), 25).transcript, '乙', '补最近出现过的那只');
  assert.equal(catchUpVoice(bees, new Set(), 31).transcript, '丙');
  assert.equal(catchUpVoice(bees, new Set(), 10), null, '还没出现过就不用补');
  assert.equal(catchUpVoice(bees, new Set(['甲', '乙', '丙']), 40), null, '都响过了不用补');
});

test('演示素材：有语气值但绝不标成模型判断', () => {
  const demo = beeSpecFrom({ mode: 'demo', bee: { hue: 30.64, segmentCount: 10 }, decode: { tone: { label: '压抑' }, meaning: { direction: 'inward' } } });
  assert.equal(demo.decoded, false);
  assert.match(demo.caption, /人工占位示例/);
  assert.match(demo.caption, /未调用模型/);
  assert.match(demo.caption, /压抑/);
  assert.doesNotMatch(demo.caption, /^语气/);
});

test('演示素材读取失败时返回空数组，界面据此隐藏入口', async () => {
  const items = await loadDemoItems({ fetchImpl: async () => ({ ok: true, json: async () => ({ items: [{ id: 'a' }] }) }) });
  assert.equal(items.length, 1);
  assert.deepEqual(await loadDemoItems({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), []);
  assert.deepEqual(await loadDemoItems({ fetchImpl: async () => { throw new Error('offline'); } }), []);
});

test('证据行只保留完整记录且保持原顺序', () => {
  const rows = traceRows({ trace: [
    { from: 'tone.intensity=0.58', to: 'bee.wingbeatHz=2.644', rule: '1.6 + 1.8 × 语气强度' },
    { from: '缺字段' },
    { to: 'bee.tension=0.65', rule: 'x' },
    null,
    { from: 'a', to: 'b', rule: 'c' },
  ] });
  assert.deepEqual(rows.map(r => r.from), ['tone.intensity=0.58', 'a']);
  assert.equal(rows[0].rule, '1.6 + 1.8 × 语气强度');
});

test('没有证据时返回空数组而不是编造', () => {
  assert.deepEqual(traceRows(null), []);
  assert.deepEqual(traceRows({}), []);
  assert.deepEqual(traceRows({ trace: 'not-an-array' }), []);
});

test('转写能力探测：不可用时不假装可用', async () => {
  const unavailable = await transcribeCapability({ fetchImpl: async () => ({ ok: true, json: async () => ({ available: false, notice: '语音识别未接入' }) }) });
  assert.equal(unavailable.available, false);
  assert.match(unavailable.notice, /未接入/);

  const available = await transcribeCapability({ fetchImpl: async () => ({ ok: true, json: async () => ({ available: true, notice: '已接入' }) }) });
  assert.equal(available.available, true);
});

test('转写探测失败一律按不可用处理，绝不猜测', async () => {
  const failed = await transcribeCapability({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(failed.available, false);
  assert.match(failed.notice, /输入框/);

  const broken = await transcribeCapability({ fetchImpl: async () => ({ ok: false, json: async () => { throw new Error('no body'); } }) });
  assert.equal(broken.available, false);
});

test('解码请求把原话放在请求体，错误信息原样抛出', async () => {
  let seen = null;
  const ok = await decodeTranscript('你不要给别人添麻烦。', {
    fetchImpl: async (url, options) => {
      seen = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ mode: 'undecoded' }) };
    },
  });
  assert.equal(seen.url, '/api/decode');
  assert.equal(seen.body.transcript, '你不要给别人添麻烦。');
  assert.equal(ok.mode, 'undecoded');

  await assert.rejects(() => decodeTranscript('不要。', {
    fetchImpl: async () => ({ ok: false, json: async () => ({ error: '原话请控制在 120 字以内' }) }),
  }), /120 字以内/);
});
