import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 250);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('=== 播放器配置的倍速选项 ===');
console.log(await ev(`(() => {
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  return JSON.stringify({
    playbackRates: p.options_ && p.options_.playbackRates,
    rateSetting: p.playbackRate(),
    techRate: p.tech(true).playbackRate
  });
})()`));

console.log('\n=== 展开菜单 ===');
console.log(await ev(`(async () => {
  const d = window.__pf.contentWindow.document;
  const mb = d.querySelector('.vjs-playback-rate .vjs-menu-button') || d.querySelector('.vjs-playback-rate');
  if (!mb) return 'no button';
  mb.click();
  await new Promise(r => setTimeout(r, 900));
  const menu = d.querySelector('.vjs-menu');
  const items = [...d.querySelectorAll('.vjs-menu-item')];
  return JSON.stringify({
    menuOpen: menu ? menu.className : 'none',
    items: items.map(i => i.innerText.trim()),
    itemCount: items.length
  });
})()`, 30000));

console.log('\n=== 点击 1.5x ===');
console.log(await ev(`(async () => {
  const w = window.__pf.contentWindow;
  const d = w.document;
  const p = w.videojs.getPlayer('video');
  const before = { rate: p.playbackRate(), cur: +p.currentTime().toFixed(1), paused: p.paused() };
  const items = [...d.querySelectorAll('.vjs-menu-item')];
  const t = items.find(i => /1\\.5|1\\.5x/.test(i.innerText));
  if (!t) return JSON.stringify({ ok:false, items: items.map(i=>i.innerText) });
  t.click();
  await new Promise(r => setTimeout(r, 2000));
  return JSON.stringify({ ok:true, before, after: { rate: p.playbackRate(), cur: +p.currentTime().toFixed(1), paused: p.paused() } });
})()`, 40000));

console.log('\n=== 15 秒验证 ===');
for (let i = 0; i < 3; i++) {
  await new Promise(r => setTimeout(r, 5000));
  console.log(`  [+${(i+1)*5}s] ` + await ev(`(() => { const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1),rate:p.playbackRate(),paused:p.paused()}); })()`));
}
cdp.close();
