import { config } from './config.js';
import { Session, PHASES, phaseAt } from './session.mjs';
import { VisualBridge, AudioBridge, sameOriginUrl } from './bridge.mjs';
import { VoiceRecorder, decodeTranscript, beeSpecFrom, transcribeCapability, traceRows, loadDemoItems,
         dueVoices, catchUpVoice } from './voice.mjs';

const $ = id => document.getElementById(id);
const session = new Session({ duration: config.duration });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let presets = [];
let selected = null;
let mode = 'preset';
let visual = null;
let lastPhase = '';
let request = null;
let checkEpoch = 0;
let presetRequest = null;
let lastBroadcast = -Infinity;
const recorder = new VoiceRecorder();
const scores = new Map();
// 每只蜂出生时的一声：语气决定它是和缓还是尖锐（见 web/audio/bee-voice.mjs）
const beeVoice = { module: null, played: new Set(), enabled: false };
let pendingBees = [];
const audio = new AudioBridge(message => {
  $('sound').hidden = true;
  showNotice(message);
});

function showNotice(text) { $('notice').textContent = text; }
function clearCheck() {
  checkEpoch += 1;
  request?.abort();
  request = null;
  $('validation').textContent = '';
  $('validate').disabled = false;
  $('validate').textContent = '检查文字格式';
}
function clearPersonal() { clearCheck(); $('personal-form').reset(); }
function showMode() {
  const active = session.state !== 'idle';
  document.body.classList.toggle('session-active', active);
  $('presets-view').hidden = active || mode !== 'preset';
  $('personal-view').hidden = active || mode !== 'personal';
  $('voice-view').hidden = active || mode !== 'voice';
  $('session-view').hidden = !active;
  for (const name of ['preset', 'personal', 'voice']) {
    $(name + '-mode').classList.toggle('active', mode === name);
    $(name + '-mode').setAttribute('aria-pressed', String(mode === name));
  }
}
function resetAll({ focus = true } = {}) {
  visual?.reset();
  audio.reset();
  session.reset();
  clearPersonal();
  clearVoice();
  mode = 'preset';
  lastPhase = '';
  lastBroadcast = -Infinity;
  showNotice('');
  $('sound').textContent = '开启声音';
  $('sound').setAttribute('aria-pressed', 'false');
  beeVoice.enabled = false;
  beeVoice.played.clear();
  beeVoice.module?.stopAll?.();
  updateSoundHint(false);
  showMode();
  render();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (focus) $('preset-mode').focus();
}
/** 退出、切换模式或离开页面时都必须清掉录音：停止音轨、释放回放地址、清空文字。 */
function clearVoice() {
  recorder.dispose();
  $('record').hidden = false;
  $('stop-record').hidden = true;
  $('record-status').textContent = '';
  $('decode-status').textContent = '';
  $('trace-list').replaceChildren();
  $('trace-panel').hidden = true;
  $('trace-panel').open = false;
  const playback = $('record-playback');
  try { playback.pause(); } catch { /* 未播放时忽略 */ }
  playback.removeAttribute('src');
  playback.hidden = true;
  $('transcript').value = '';
}

/** 转写能力由服务端如实告知；未接入时明确提示观众自己写文字。 */
async function refreshTranscribeNote() {
  const capability = await transcribeCapability();
  $('transcript-note').textContent = capability.available
    ? '语音识别已接入：停止录音后会自动填入文字，你可以修改。'
    : '录音只在本机回放，不保存、不上传，结束即清空。' + capability.notice;
}

async function recordVoice() {
  $('record-status').textContent = '正在请求麦克风…';
  try {
    await recorder.start();
    $('record').hidden = true;
    $('stop-record').hidden = false;
    $('record-status').textContent = '正在录音…说完点「停止录音」。';
  } catch (error) {
    $('record-status').textContent = '无法使用麦克风：' + (error?.message || '请检查浏览器权限') + '。也可以直接写下文字。';
  }
}

async function stopVoice() {
  let result = null;
  try {
    result = await recorder.stop();
  } catch {
    result = null;
  }
  $('record').hidden = false;
  $('stop-record').hidden = true;
  const playback = $('record-playback');
  if (result?.url) {
    playback.src = result.url;
    playback.hidden = false;
    $('record-status').textContent = '录到 ' + result.seconds + ' 秒；可以回放确认，然后填写下面的文字。';
  } else {
    playback.hidden = true;
    $('record-status').textContent = '没有录到声音，可以重录，或直接写下文字。';
  }
  $('transcript').focus();
}

let demoItems = [];

/** 演示素材：不需要密钥、不需要麦克风，点一下就能看到完整机制。 */
async function loadDemo() {
  demoItems = await loadDemoItems();
  const row = $('demo-row');
  const list = $('demo-list');
  list.replaceChildren();
  if (!demoItems.length) {
    row.hidden = true;
    return;
  }
  for (const item of demoItems) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'demo-button';
    button.textContent = item.label;
    button.title = item.transcript + '：' + item.summary;
    button.addEventListener('click', () => runDemo(item));
    list.append(button);
  }
  row.hidden = false;
}

/** 用人工占位的演示素材跑完整流程；来源在画面上如实标注。 */
function runDemo(item) {
  if (!presets.length) {
    $('decode-status').textContent = '演示数据未就绪，请刷新后重试。';
    return;
  }
  $('transcript').value = item.transcript;
  $('decode-status').textContent = item.notice + '；语气：' + item.label + '。';
  renderTrace(item);
  selected = {
    id: 'demo-' + item.label,
    title: '演示 · ' + item.label,
    description: '人工编写的语气与含义（未调用模型），用来演示语气如何改变蜂的形态。',
    source: 'manual-placeholder',
    input: { events: [{ id: 'a', utterance: item.transcript, context: '', feeling: '' },
                      { id: 'b', utterance: item.transcript, context: '', feeling: '' }] },
    output: structuredClone(presets[0].output),
  };
  // 演示里把三条素材都带上：视野拉远后，画面里会出现其他语言的蜂
  const bees = demoItems.map((entry, index) => ({
    transcript: entry.transcript,
    beeSpec: Object.assign({}, entry.bee, { decoded: false, caption: '' }),
    decoded: false,
    tone: entry.decode ? entry.decode.tone : null,
    appearAt: index === 0 ? null : 15 + (index - 1) * 3, // 主蜂之外，15 秒起每 3 秒一只（与视觉 SWARM_VIEW 新节奏对齐）
  }));
  start({ sourceText: item.transcript, source: 'demo-placeholder', scoreId: presets[0].id, bees,
          beeSpec: beeSpecFrom({ mode: 'demo', bee: item.bee, decode: item.decode }) });
}

/** 把解码结果到蜂体参数的对应规则显示出来，让「可追溯」是看得见的。 */
function renderTrace(result) {
  const panel = $('trace-panel');
  const list = $('trace-list');
  const rows = traceRows(result);
  list.replaceChildren();
  if (!rows.length) {
    panel.hidden = true;
    return;
  }
  for (const row of rows.slice(0, 24)) {
    const item = document.createElement('li');
    const from = document.createElement('span');
    from.className = 'trace-from';
    from.textContent = row.from;
    const to = document.createElement('span');
    to.className = 'trace-to';
    to.textContent = row.to;
    const rule = document.createElement('span');
    rule.className = 'trace-rule';
    rule.textContent = row.rule;
    // 用分隔符拼成一句可读的话：来源 → 结果（规则）；纯 span 拼接会让读屏与复制糊成一片
    item.append(from, document.createTextNode(' → '), to, document.createTextNode(' · '), rule);
    list.append(item);
  }
  if (rows.length > 24) {
    const more = document.createElement('li');
    more.className = 'trace-more';
    more.textContent = '另有 ' + (rows.length - 24) + ' 条未展开。';
    list.append(more);
  }
  panel.hidden = false;
  panel.open = false;
}

/** 解码一句转写文本，然后让这只由文字结构组成的蜂开始生长。 */
async function decodeAndGrow() {
  const transcript = $('transcript').value.trim();
  if (!transcript) {
    $('decode-status').textContent = '请先写下或确认这句话的文字。';
    $('transcript').focus();
    return;
  }
  if (!presets.length) {
    $('decode-status').textContent = '演示数据未就绪，请刷新后重试。';
    return;
  }
  $('decode-start').disabled = true;
  $('decode-status').textContent = '正在解码…';
  try {
    const result = await decodeTranscript(transcript);
    const live = result.mode === 'live';
    selected = {
      id: 'voice',
      title: '你刚刚说的话',
      description: live ? '由模型解码的语气与含义，长成这样一只蜂。' : '未接入模型：只按文字结构生长，语气与含义没有解码。',
      source: live ? 'model-decode' : 'manual-transcript',
      input: { events: [{ id: 'a', utterance: transcript, context: '', feeling: '' },
                        { id: 'b', utterance: transcript, context: '', feeling: '' }] },
      output: structuredClone(presets[0].output),
    };
    $('decode-status').textContent = result.notice || '';
    renderTrace(result);
    start({ sourceText: transcript, beeSpec: beeSpecFrom(result), source: live ? 'model-decode' : 'voice-transcript' });
  } catch (error) {
    $('decode-status').textContent = '未能解码：' + (error?.message || '请确认本机预览服务仍在运行') ;
  } finally {
    $('decode-start').disabled = false;
  }
}

function choosePreset(id) {
  selected = presets.find(item => item.id === id) ?? null;
  $('start').disabled = !selected;
  $('story-detail').hidden = !selected;
  $('quote-a').textContent = selected ? `“${selected.input.events[0].utterance}”` : '';
  $('quote-b').textContent = selected ? `“${selected.input.events[1].utterance}”` : '';
  showNotice('');
}
async function loadPresets() {
  presetRequest?.abort();
  const controller = new AbortController();
  presetRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 5000);
  $('start').disabled = true;
  $('reload').hidden = true;
  try {
    const response = await fetch('/api/presets', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('preset unavailable');
    const data = await response.json();
    if (!Array.isArray(data.presets) || !data.presets.length) throw new Error('empty presets');
    if (presetRequest !== controller) return;
    presets = data.presets;
    $('stories').replaceChildren();
    const legend = document.createElement('legend');
    legend.className = 'sr-only';
    legend.textContent = '选择一个故事';
    $('stories').append(legend);
    for (const [index, preset] of presets.entries()) {
      const label = document.createElement('label');
      label.className = 'story-option';
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'story'; radio.value = preset.id; radio.checked = index === 0;
      radio.addEventListener('change', () => choosePreset(preset.id));
      const text = document.createElement('span');
      const title = document.createElement('span'); title.className = 'story-name'; title.textContent = preset.title;
      const desc = document.createElement('span'); desc.className = 'story-desc'; desc.textContent = preset.description;
      text.append(title, desc); label.append(radio, text); $('stories').append(label);
    }
    choosePreset(presets[0].id);
  } catch {
    if (presetRequest !== controller) return;
    presets = []; selected = null;
    $('stories').textContent = '故事暂时无法读取。';
    $('story-detail').hidden = true;
    $('reload').hidden = false;
    showNotice('请确认本机预览服务仍在运行，然后重新读取故事。');
  } finally {
    clearTimeout(timeout);
    if (presetRequest === controller) presetRequest = null;
  }
}
/** extra：录音流程传入的转写文本与解码出的蜂体规格；不传时沿用故事预设。 */
/** 预取每个预设的音画同步时间线，供声纹可视化使用；取不到就只画基线。 */
async function loadScores() {
  await Promise.all(presets.map(async preset => {
    try {
      const response = await fetch('/api/score?id=' + encodeURIComponent(preset.id), { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.score) scores.set(preset.id, data.score);
    } catch { /* 没有 score 时声纹只画基线，不编造波形 */ }
  }));
}

/** extra：录音流程传入的转写文本与解码出的蜂体规格；不传时沿用故事预设。 */
function start(extra = null) {
  if (!selected || !session.start(selected)) return;
  clearPersonal();
  showNotice('');
  $('session-title').textContent = selected.title;
  $('session-description').textContent = selected.description;
  const sourceText = extra?.sourceText
    ?? (selected.input?.events?.map(event => event.utterance || '').filter(Boolean).join(' ') || '');
  const payload = { output: structuredClone(selected.output), sourceText,
    source: extra?.source ?? 'manual-preset', duration: config.duration, reducedMotion: reducedMotion.matches };
  if (extra?.beeSpec) payload.beeSpec = extra.beeSpec;
  if (extra?.bees) payload.bees = extra.bees;
  pendingBees = extra?.bees || [];
  beeVoice.played.clear();
  const score = scores.get(extra?.scoreId || selected.id);
  if (score) payload.score = score;
  visual?.load(session.sessionId, payload);
  audio.load(payload);
  showMode();
  lastPhase = '';
  render();
  broadcast();
  $('pause').focus();
}
function broadcast() {
  const frame = session.frame();
  visual?.frame(frame);
  audio.frame(frame);
  playDueVoices();
}

/** 到点的蜂各发一声；静音期间不标记已播，暂停时不补发，重播时重置。 */
function playDueVoices() {
  if (!beeVoice.module || !beeVoice.enabled || session.state !== 'playing') return;
  for (const bee of dueVoices(pendingBees, beeVoice.played, session.time)) {
    beeVoice.played.add(bee.transcript);
    beeVoice.module.play(bee.beeSpec, bee.tone);
  }
}

/** 静音期间错过的蜂，取消静音时补最近的一只：让观众立刻听到「蜂的声音」是什么。 */
function catchUpBeeVoice() {
  if (!beeVoice.module || !beeVoice.enabled) return;
  const bee = catchUpVoice(pendingBees, beeVoice.played, session.time);
  if (!bee) return;
  beeVoice.played.add(bee.transcript);
  beeVoice.module.play(bee.beeSpec, bee.tone);
}

/** 声音未开启时让入口显眼一点，并在脚注里说清「每只蜂都有自己的声音」。 */
function updateSoundHint(enabled) {
  const button = $('sound');
  if (!audio.module && !beeVoice.module) return;
  button.hidden = false;
  button.classList.toggle('attention', !enabled);
  button.title = enabled
    ? '关闭声音'
    : '每只蜂都有自己的声音：和缓的语气听起来和蔼，尖锐的语气听起来刺耳';
  if (session.preset) $('visual-note').textContent = soundNote(enabled);
}

/** 视觉就绪时脚注该写什么：声音没开就提醒一句，观众才知道每只蜂都有声音。 */
function soundNote(enabled = beeVoice.enabled) {
  return enabled ? '人工编排的虚构故事。' : '点右上角「开启声音」：每只蜂都有自己的声音。';
}
function pause() {
  if (!session.pause()) return;
  beeVoice.module?.stopAll?.();
  broadcast(); render();
}
function render() {
  const state = session.state;
  const phase = phaseAt(session.time);
  const seconds = Math.floor(session.time);
  $('elapsed').textContent = `00:${String(seconds).padStart(2, '0')}`;
  if (seconds === 60) $('elapsed').textContent = '01:00';
  $('timeline').setAttribute('aria-valuenow', String(Math.floor(session.time)));
  $('timeline').setAttribute('aria-valuetext', `${phase.label}，${Math.floor(session.time)} 秒，共 60 秒`);
  for (const [index, part] of [...$('timeline').children].entries()) {
    const p = PHASES[index];
    part.style.setProperty('--fill', Math.max(0, Math.min(1, (session.time-p.start)/(p.end-p.start))));
  }
  $('pause').hidden = state === 'complete';
  $('pause').textContent = state === 'paused' ? '继续' : '暂停';
  $('replay').hidden = state !== 'complete';
  $('phase-label').textContent = state === 'idle' ? '等待开始' : `${phase.label}${state === 'paused' ? ' · 已暂停' : state === 'complete' ? ' · 体验结束' : ''}`;
  const phaseKey = state === 'idle' ? 'idle' : phase.id;
  if (lastPhase === phaseKey) return;
  lastPhase = phaseKey;
  const events = session.preset?.input.events;
  const copy = {
    idle: ['有些话，\n会在身体里筑巢。', '话语停下以后，什么还留在这里。'],
    opening: ['有些话，\n会在身体里筑巢。', '从一段经历开始，给它一点停留的时间。'],
    first: ['文字开始聚成蜂体。', events?.[0].utterance || '转写文字进入画面。'],
    second: ['语气让翅膀开始振动。', events?.[1].utterance || '声音的节律留下痕迹。'],
    weave: ['句子的结构，\n开始长出形状。', '每个字都成为蜂体的一部分。'],
    settle: ['声音慢慢远去，\n蜂的结构留下来。', '文字不再只是内容，而成为一只蜂。'],
    remain: ['话语停下以后，\n这只蜂还在这里。', '你可以停留，也可以重新开始。'],
  };
  $('stage-quote').textContent = copy[phaseKey][0];
  $('stage-caption').textContent = copy[phaseKey][1];
  $('stage-index').textContent = phaseKey === 'idle' ? '01 — 06' : `${String(PHASES.indexOf(phase)+1).padStart(2,'0')} — 06`;
}
for (const phase of PHASES) {
  const part = document.createElement('span');
  part.className = 'timeline-part';
  part.style.setProperty('--weight', phase.end-phase.start);
  part.title = phase.label;
  $('timeline').append(part);
}
$('preset-mode').addEventListener('click', () => { clearPersonal(); clearVoice(); mode = 'preset'; showNotice(''); showMode(); });
$('personal-mode').addEventListener('click', () => { clearVoice(); mode = 'personal'; showNotice(''); showMode(); $('utterance-a').focus(); });
$('voice-mode').addEventListener('click', () => { clearPersonal(); mode = 'voice'; showNotice(''); showMode(); refreshTranscribeNote(); $('record').focus(); });
$('record').addEventListener('click', recordVoice);
$('stop-record').addEventListener('click', stopVoice);
$('decode-start').addEventListener('click', decodeAndGrow);
$('start').addEventListener('click', () => start());
$('replay').addEventListener('click', () => { visual?.reset(); audio.reset(); session.reset(); $('sound').textContent='开启声音'; $('sound').setAttribute('aria-pressed','false'); start(); });
$('pause').addEventListener('click', () => { if (session.state === 'playing') pause(); else { session.resume(); broadcast(); render(); } });
$('exit').addEventListener('click', () => resetAll());
$('reset-all').addEventListener('click', () => resetAll());
$('reload').addEventListener('click', loadPresets);
$('clear-input').addEventListener('click', () => { clearPersonal(); $('utterance-a').focus(); });
$('personal-form').addEventListener('input', clearCheck);
$('personal-form').addEventListener('submit', async event => {
  event.preventDefault();
  clearCheck();
  const epoch = checkEpoch;
  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(), 5000);
  $('validate').disabled = true;
  $('validate').textContent = '正在检查…';
  const source = { events: ['a', 'b'].map(id => ({ id, utterance: $(`utterance-${id}`).value.trim(), context: $(`context-${id}`).value.trim(), feeling: $(`feeling-${id}`).value.trim() })) };
  try {
    const response = await fetch('/api/validate-input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source), signal: controller.signal });
    const data = await response.json();
    if (epoch !== checkEpoch || mode !== 'personal') return;
    $('validation').textContent = response.ok ? data.message : data.error || '文字格式未通过检查。';
  } catch {
    if (epoch === checkEpoch && mode === 'personal') $('validation').textContent = '本机检查暂未完成。请确认预览服务正在运行，再试一次。';
  } finally {
    clearTimeout(timeout);
    if (epoch === checkEpoch) { request = null; $('validate').disabled = false; $('validate').textContent = '检查文字格式'; }
  }
});
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('stage').requestFullscreen(); }
  catch { showNotice('当前浏览器不支持全屏，可以直接使用窗口预览。'); }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏'; });
if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
$('sound').addEventListener('click', async () => {
  const enabled = await audio.toggle();
  beeVoice.enabled = enabled;
  if (beeVoice.module) {
    if (enabled) { try { await beeVoice.module.unlock(); } catch { /* 无声音也能继续 */ } }
    beeVoice.module.setMuted(!enabled);
  }
  updateSoundHint(enabled);
  if (enabled) catchUpBeeVoice();
  $('sound').textContent = enabled ? '关闭声音' : '开启声音';
  $('sound').setAttribute('aria-pressed', String(enabled));
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => { resetAll({ focus: false }); clearVoice(); presetRequest?.abort(); });
if (config.visualUrl) {
  try {
    visual = new VisualBridge({ frame: $('visual'), url: config.visualUrl,
      onStatus: status => {
        const ready = status === 'ready';
        $('visual').hidden = !ready;
        $('stage').classList.toggle('connected', ready);
        $('preview-kind').textContent = ready ? '作品预览' : '分镜预览';
        // onStatus 会在 load 之后触发，所以这里也要按当前声音状态决定脚注
        $('visual-note').textContent = ready ? soundNote() : '视觉暂未就绪，当前显示分镜预览。';
      }, onError: message => { pause(); showNotice(message); } });
  } catch { showNotice('视觉暂未就绪，当前显示分镜预览。'); }
}
if (config.audioModuleUrl) {
  try {
    import(sameOriginUrl(config.audioModuleUrl, location)).then(imported => {
      audio.attach(imported.createAudio());
      if (session.preset) {
        audio.load({ output: structuredClone(session.preset.output), duration: config.duration, source: 'manual-preset' });
        audio.frame(session.frame());
      }
      updateSoundHint(false);
    }).catch(() => showNotice('声音暂未就绪，仍可使用静音预览。'));
  } catch { showNotice('声音暂未就绪，仍可使用静音预览。'); }
}
// 蜂的声音：每只蜂出生时各发一声；加载失败只是没有这一层，不影响画面
if (config.beeVoiceModuleUrl) {
  try {
    import(sameOriginUrl(config.beeVoiceModuleUrl, location)).then(imported => {
      beeVoice.module = imported.createBeeVoice();
      beeVoice.module.setMuted(true);
      updateSoundHint(false);
    }).catch(() => { /* 没有蜂声也能看完整段 */ });
  } catch { /* 同上 */ }
}
function animate(now) {
  if (session.tick(now)) {
    render();
    if (now - lastBroadcast >= 1000/30 || session.state === 'complete') { broadcast(); lastBroadcast = now; }
  }
  requestAnimationFrame(animate);
}
showMode(); render(); loadDemo(); requestAnimationFrame(animate);

// 预设读完后预取 score：声纹画的是真实的声音结构，取不到就只画基线
loadPresets().then(() => loadScores());

// 演示入口：?demo=1 直接落到「说一句话」并显示演示句
if (new URLSearchParams(location.search).has('demo')) {
  mode = 'voice';
  showMode();
  refreshTranscribeNote();
  loadDemo().then(() => $('demo-list').querySelector('button')?.focus());
}
