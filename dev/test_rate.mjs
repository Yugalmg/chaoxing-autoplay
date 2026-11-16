import { CDP } from './lib/cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);

const ev = async (expr, t = 20000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 150);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

// 找当前正在播放（或 cur 最大）的视频
const probe = `(() => {
  const cd = document.getElementById('iframe')?.contentDocument;
  if (!cd) return 'no cards';
  const out = [];
  [...cd.querySelectorAll('iframe')].forEach((f, i) => {
    try {
      const v = f.contentWindow.document.querySelector('video');
      if (v && v.currentSrc && v.currentSrc.startsWith('blob:')) {
        out.push({ i, cur: +v.currentTime.toFixed(1), dur: Math.round(v.duration || 0), paused: v.paused, rate: v.playbackRate });
      }
    } catch (e) {}
  });
  out.sort((a, b) => b.cur - a.cur);
  return JSON.stringify(out);
})()`;

console.log('=== 播放中的 blob 视频 ===');
const r0 = await ev(probe);
console.log(r0);
let arr = [];
try { arr = JSON.parse(r0); } catch {}
if (!arr.length) { console.log('没有正在播放的视频，退出'); process.exit(0); }
const tgt = arr[0];
console.log(`\n目标 iframe=${tgt.i} cur=${tgt.cur} dur=${tgt.dur} rate=${tgt.rate}`);

const setRate = (idx, rate) => `(() => {
  const cd = document.getElementById('iframe').contentDocument;
  const f = cd.querySelectorAll('iframe')[${idx}];
  const p = f.contentWindow.videojs.getPlayer('video');
  try { p.playbackRate(${rate}); } catch (e) { return 'setErr:' + e.message; }
  return JSON.stringify({ rate: p.playbackRate(), cur: +p.currentTime().toFixed(1), paused: p.paused() });
})()`;

const read = (idx) => `(() => {
  const cd = document.getElementById('iframe').contentDocument;
  const f = cd.querySelectorAll('iframe')[${idx}];
  const p = f.contentWindow.videojs.getPlayer('video');
  return JSON.stringify({ cur: +p.currentTime().toFixed(1), paused: p.paused(), rate: p.playbackRate() });
})()`;

console.log('\n--- 设置 1.5 倍速 ---');
console.log(await ev(setRate(tgt.i, 1.5)));

for (let k = 0; k < 6; k++) {
  await new Promise(r => setTimeout(r, 5000));
  console.log(`  [+${(k + 1) * 5}s]`, await ev(read(tgt.i)));
}

console.log('\n--- 恢复 1.0（若加速失败）---');
console.log(await ev(setRate(tgt.i, 1.0)));
await new Promise(r => setTimeout(r, 3000));
console.log('  最终:', await ev(read(tgt.i)));
cdp.close();
