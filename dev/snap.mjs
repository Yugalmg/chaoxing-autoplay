import fs from 'node:fs';
import { CDP } from './lib/cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page', list.map(t => t.type + ' ' + t.url.slice(0, 60))); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('log/live.png', Buffer.from(shot.data, 'base64'));
const st = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.getElementById('iframe')?.contentDocument;
    if (!cards) return 'no cards';
    const vs = [...cards.querySelectorAll('iframe')].map(f => {
      try { const v = f.contentWindow.document.querySelector('video'); return v && !v.paused ? {cur:+v.currentTime.toFixed(0), dur:v.duration, rate:v.playbackRate} : null; } catch(e){ return null; }
    }).filter(Boolean);
    return JSON.stringify(vs);
  })()`, returnByValue: true,
});
console.log('playing:', st.result?.value);
console.log('shot -> log/live.png');
cdp.close();
