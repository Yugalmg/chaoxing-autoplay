import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC';
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};
for (let i = 1; i <= 8; i++) {
  const r = await ev(`(async () => {
    const p = window.__pf.contentWindow.videojs.getPlayer('video');
    const before = p.currentTime();
    p.currentTime(before + 300);
    await new Promise(r => setTimeout(r, 1500));
    return JSON.stringify({ before: +before.toFixed(0), after: +p.currentTime().toFixed(0), paused: p.paused() });
  })()`);
  console.log(`step ${i}: ${r}`);
  const o = JSON.parse(r);
  if (o.after >= 1100) { console.log('已到达 1100+'); break; }
}
cdp.close();
