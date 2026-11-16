import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 160);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

const read = `(() => { const v = window.__pf.contentWindow.document.querySelector('video'); return JSON.stringify({cur:+v.currentTime.toFixed(1), rate:v.playbackRate, paused:v.paused}); })()`;

console.log('当前:', await ev(read));

console.log('\n设置 video.playbackRate = 1.5 …');
console.log(await ev(`(async () => {
  const v = window.__pf.contentWindow.document.querySelector('video');
  v.playbackRate = 1.5;
  await new Promise(r => setTimeout(r, 1200));
  return JSON.stringify({ rate: v.playbackRate, cur: +v.currentTime.toFixed(1), paused: v.paused });
})()`));

console.log('\n观察 15 秒增速:');
let prev = null;
for (let i = 0; i < 5; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const s = await ev(read);
  if (!s || s.startsWith('EXC') || s.startsWith('ERR')) { console.log('  ' + s); continue; }
  const o = JSON.parse(s);
  const delta = prev === null ? 0 : +(o.cur - prev).toFixed(1);
  console.log(`  [+${(i+1)*3}s] cur=${o.cur} rate=${o.rate} paused=${o.paused} 实际=${(delta/3).toFixed(2)}x`);
  prev = o.cur;
}
cdp.close();
