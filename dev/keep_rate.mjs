import fs from 'node:fs';
import { CDP } from './lib/cdp.mjs';

const RATE = Number(process.argv[2] || 1.5);
const MINUTES = Number(process.argv[3] || 25);

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);

const expr = `(() => {
  const cards = document.getElementById('iframe')?.contentDocument;
  if (!cards) return '[]';
  const out = [];
  [...cards.querySelectorAll('iframe')].forEach((f, i) => {
    try {
      const v = f.contentWindow.document.querySelector('video');
      if (v && !v.paused) {
        v.playbackRate = ${RATE};
        out.push({i, cur:+v.currentTime.toFixed(0), dur:Math.round(v.duration), rate:v.playbackRate});
      }
    } catch (e) {}
  });
  return JSON.stringify(out);
})()`;

const until = Date.now() + MINUTES * 60000;
let n = 0;
const line = (m) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`);
line(`倍速保持启动 rate=${RATE} 持续 ${MINUTES} 分钟`);

while (Date.now() < until) {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, page.sessionId, 15000);
    const arr = JSON.parse(r.result?.value || '[]');
    if (arr.length) {
      const v = arr[0];
      if (n++ % 6 === 0) line(`保持中 cur=${v.cur}/${v.dur}s rate=${v.rate}`);
      if (v.dur && v.cur >= v.dur - 2) { line('视频已到尾部，退出'); break; }
    } else {
      if (n++ % 10 === 0) line('未检测到播放中的视频');
    }
  } catch (e) {
    line('eval err: ' + e.message);
  }
  await new Promise(r => setTimeout(r, 5000));
}
line('倍速保持结束');
cdp.close();
