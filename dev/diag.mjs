import fs from 'node:fs';
import { CDP } from './lib/cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('NO PAGE — chrome gone'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);

const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.getElementById('iframe')?.contentDocument;
    if (!cards) return JSON.stringify({err:'no cards', top: location.href.slice(0,120)});
    const out = [];
    [...cards.querySelectorAll('iframe')].forEach((f, i) => {
      try {
        const d = f.contentWindow.document;
        const v = d.querySelector('video');
        if (!v) { out.push({i, novideo:true}); return; }
        out.push({
          i, cur:+v.currentTime.toFixed(1), dur: v.duration ? +v.duration.toFixed(1) : null,
          paused: v.paused, ended: v.ended, rate: v.playbackRate, ready: v.readyState,
          err: v.error ? v.error.code : null, muted: v.muted,
          src: (v.currentSrc||'').slice(60,120),
          hidden: d.hidden, vis: d.visibilityState
        });
      } catch (e) { out.push({i, err: String(e.message).slice(0,50)}); }
    });
    return JSON.stringify({
      docHidden: document.hidden, docVis: document.visibilityState,
      hasFocus: document.hasFocus(), frames: out
    }, null, 1);
  })()`, returnByValue: true,
}, page.sessionId, 20000);

console.log(r.result?.value || JSON.stringify(r).slice(0, 600));
cdp.close();
