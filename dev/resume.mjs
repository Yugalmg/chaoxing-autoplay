import fs from 'node:fs';
import { CDP } from './lib/cdp.mjs';

const RATE = Number(process.argv[2] || 1.5);
const OBJECT_ID = process.argv[3] || '4b9ec2babd03bea2e67ab1a32154c6a4';
const MAX_MIN = Number(process.argv[4] || 25);

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('NO PAGE'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);

const line = (m) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`);

// 定位目标 iframe 索引（按 objectId 子串匹配 currentSrc）
async function locate() {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.getElementById('iframe')?.contentDocument;
      if (!cards) return JSON.stringify({idx:-1});
      let idx = -1;
      [...cards.querySelectorAll('iframe')].forEach((f, i) => {
        try { const v = f.contentWindow.document.querySelector('video');
          if (v && (v.currentSrc||'').includes('${OBJECT_ID}')) idx = i; } catch (e) {}
      });
      return JSON.stringify({idx});
    })()`, returnByValue: true,
  }, page.sessionId, 20000);
  return JSON.parse(r.result?.value || '{"idx":-1}').idx;
}

const idx = await locate();
line(`目标 iframe 索引: ${idx}`);
if (idx < 0) { console.log('未找到目标视频'); process.exit(1); }

const drive = `(() => {
  const cards = document.getElementById('iframe').contentDocument;
  const f = cards.querySelectorAll('iframe')[${idx}];
  const v = f.contentWindow.document.querySelector('video');
  if (!v) return JSON.stringify({ok:false, why:'no video'});
  v.muted = true;
  if (v.playbackRate !== ${RATE}) { try { v.playbackRate = ${RATE}; } catch (e) {} }
  if (v.paused && !v.ended) { try { v.play(); } catch (e) {} }
  return JSON.stringify({ok:true, cur:+v.currentTime.toFixed(1), dur:Math.round(v.duration||0), paused:v.paused, rate:v.playbackRate, ended:v.ended, ready:v.readyState});
})()`;

const until = Date.now() + MAX_MIN * 60000;
let n = 0, done = false;

while (Date.now() < until) {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: drive, returnByValue: true }, page.sessionId, 20000);
    const s = JSON.parse(r.result?.value || '{}');
    if (!s.ok) { line(`异常: ${s.why}`); }
    else {
      if (n++ % 8 === 0) line(`cur=${s.cur}/${s.dur}s rate=${s.rate} paused=${s.paused} ready=${s.ready}`);
      if (s.ended || (s.dur && s.cur >= s.dur - 1.5)) { done = true; line(`到达片尾 cur=${s.cur}/${s.dur}`); break; }
    }
  } catch (e) {
    line('eval err: ' + e.message);
  }
  await new Promise(r => setTimeout(r, 3000));
}
line(done ? '✓ watchdog 结束：视频已播完' : 'watchdog 结束：未到片尾');
cdp.close();
