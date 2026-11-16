import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const ev = async (expr, t = 25000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};
console.log('设置前:', await ev(`(() => { const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1),dur:Math.round(p.duration()),paused:p.paused()}); })()`));
console.log('seek 1089:', await ev(`(async () => {
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  p.currentTime(1089);
  await new Promise(r => setTimeout(r, 800));
  const a = p.currentTime();
  await new Promise(r => setTimeout(r, 2500));
  const b = p.currentTime();
  return JSON.stringify({ after800ms: +a.toFixed(1), after3300ms: +b.toFixed(1), paused: p.paused() });
})()`));
console.log('播放后:', await ev(`(async () => {
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  try { await p.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({cur:+p.currentTime().toFixed(1), paused:p.paused()});
})()`));
cdp.close();
