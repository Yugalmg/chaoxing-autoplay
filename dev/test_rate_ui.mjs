import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 300);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('=== 倍速控件 DOM ===');
console.log(await ev(`(() => {
  const d = window.__pf.contentWindow.document;
  const btn = d.querySelector('.vjs-playback-rate');
  const items = [...d.querySelectorAll('.vjs-playback-rate .vjs-menu-item')];
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  return JSON.stringify({
    hasBtn: !!btn, btnVisible: btn ? btn.offsetParent !== null : false,
    items: items.map(i => ({ text: i.innerText.trim(), cls: i.className.slice(0,60), selected: /selected/.test(i.className) })),
    curRate: p.playbackRate(), cur: +p.currentTime().toFixed(1)
  }, null, 1);
})()`));

console.log('\n=== 尝试点击 1.5 倍速 ===');
console.log(await ev(`(async () => {
  const w = window.__pf.contentWindow;
  const d = w.document;
  const p = w.videojs.getPlayer('video');
  const before = { rate: p.playbackRate(), cur: p.currentTime(), paused: p.paused() };
  const items = [...d.querySelectorAll('.vjs-playback-rate .vjs-menu-item')];
  const target = items.find(i => /1\\.5/.test(i.innerText));
  if (!target) return JSON.stringify({ ok:false, why:'no 1.5 item', items: items.map(i=>i.innerText) });
  target.click();
  await new Promise(r => setTimeout(r, 2500));
  const after = { rate: p.playbackRate(), cur: p.currentTime(), paused: p.paused() };
  return JSON.stringify({ ok:true, before, after, accelerated: after.rate > before.rate, delta: +(after.cur - before.cur).toFixed(1) });
})()`, 40000));

console.log('\n=== 10 秒后验证是否持续加速 ===');
for (let i = 0; i < 3; i++) {
  await new Promise(r => setTimeout(r, 5000));
  console.log(`  [+${(i+1)*5}s] ` + await ev(`(() => { const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1),rate:p.playbackRate(),paused:p.paused()}); })()`));
}
cdp.close();
