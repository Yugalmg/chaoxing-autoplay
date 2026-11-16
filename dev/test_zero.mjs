import { CDP } from './lib/cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);

const ev = async (expr, t = 25000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 160);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('调整前:', await ev(`(() => { const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1), dur:Math.round(p.duration()), paused:p.paused()}); })()`));

console.log('\n设为 0 并播放:', await ev(`(async () => {
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  p.currentTime(0);
  await new Promise(r => setTimeout(r, 1500));
  try { p.playbackRate(1.5); } catch (e) {}
  try { p.play(); } catch (e) { return 'playerr ' + e.message; }
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ cur: +p.currentTime().toFixed(1), paused: p.paused(), rate: p.playbackRate() });
})()`));

for (let i = 0; i < 4; i++) {
  await new Promise(r => setTimeout(r, 6000));
  console.log(`  [+${(i + 1) * 6}s]`, await ev(`(() => { const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1),paused:p.paused(),rate:p.playbackRate()}); })()`));
}

console.log('\n尝试 seek 到 900:', await ev(`(async () => {
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  p.currentTime(900);
  await new Promise(r => setTimeout(r, 2000));
  try { p.play(); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));
  return JSON.stringify({ cur: +p.currentTime().toFixed(1), paused: p.paused() });
})()`));
for (let i = 0; i < 3; i++) {
  await new Promise(r => setTimeout(r, 6000));
  console.log(`  [+${(i + 1) * 6}s]`, await ev(`(() => { const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1),paused:p.paused()}); })()`));
}
cdp.close();
