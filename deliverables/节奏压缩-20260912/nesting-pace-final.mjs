import fs from 'node:fs';

const HOST = 'http://127.0.0.1:9223';
const OUT = process.argv[2];
const list = await (await fetch(`${HOST}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method) events.push(m);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Console.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?demo=1' });
await sleep(2500);

const clickByText = (text) => evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return 'missing'; b.click(); return 'ok'; })()`);
console.log('demo sentence:', await clickByText('急促'));
await sleep(1000);
console.log('start:', await clickByText('开始这段体验'));

const readSeconds = () => evalJs(`(() => {
  const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^\\d{2}:\\d{2}$/.test(e.textContent.trim()));
  if (!el) return -1;
  const [m, s] = el.textContent.trim().split(':').map(Number);
  return m * 60 + s;
})()`);

const t0 = Date.now();
fs.mkdirSync(OUT, { recursive: true });
for (const target of [4, 12, 17, 26, 34]) {
  for (;;) {
    const cur = await readSeconds();
    if (cur >= target || Date.now() - t0 > (target + 25) * 1000) break;
    await sleep(500);
  }
  const cur = await readSeconds();
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/pace-${target}s.png`, Buffer.from(shot.data, 'base64'));
  console.log(`shot at clock=${cur}s -> ${OUT}/pace-${target}s.png`);
}

const info = await evalJs(`(() => {
  const f = document.querySelector('iframe');
  const d = f && f.contentDocument;
  return JSON.stringify({
    phase: d?.getElementById('phase-name')?.textContent,
    time: d?.getElementById('time-display')?.textContent,
  });
})()`);
console.log('iframe:', info);
const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text);
console.log('exceptions:', errs.length ? errs.slice(0, 3) : 'none');
ws.close();
