import { CDP } from './lib/cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);

const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cd = document.getElementById('iframe')?.contentDocument;
    if (!cd) return 'no cards';
    const out = [];
    [...cd.querySelectorAll('iframe')].forEach((f, i) => {
      try {
        const v = f.contentWindow.document.querySelector('video');
        if (!v) return;
        let buf = [];
        try { for (let k = 0; k < v.buffered.length; k++) buf.push([Math.round(v.buffered.start(k)), Math.round(v.buffered.end(k))]); } catch (e) {}
        out.push({
          i, cur: +v.currentTime.toFixed(1), dur: Math.round(v.duration || 0),
          paused: v.paused, rate: v.playbackRate, rs: v.readyState, ns: v.networkState,
          buf, err: v.error ? v.error.code : null,
          src: (v.currentSrc || '').slice(0, 24)
        });
      } catch (e) {}
    });
    return JSON.stringify(out);
  })()`, returnByValue: true,
}, page.sessionId, 20000);

const arr = JSON.parse(r.result?.value || '[]');
console.log('video 元素:');
for (const v of arr) {
  console.log(`  [${v.i}] cur=${v.cur}/${v.dur} paused=${v.paused} rate=${v.rate} rs=${v.rs} ns=${v.ns} buf=${JSON.stringify(v.buf)} src=${v.src}`);
}

// 采样两次看推进速度
const read = async () => {
  const x = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cd = document.getElementById('iframe')?.contentDocument;
      const out = [];
      [...cd.querySelectorAll('iframe')].forEach(f => {
        try { const v = f.contentWindow.document.querySelector('video'); if (v) out.push(+v.currentTime.toFixed(1)); } catch (e) {}
      });
      out.sort((a,b)=>b-a);
      return String(out[0] ?? -1);
    })()`, returnByValue: true,
  }, page.sessionId, 15000);
  return Number(x.result?.value);
};

const a = await read();
await new Promise(r => setTimeout(r, 20000));
const b = await read();
console.log(`\n20 秒实测: ${a} -> ${b}  (推进 ${(b - a).toFixed(1)}s, 速率 ${((b - a) / 20).toFixed(2)}x)`);
cdp.close();
