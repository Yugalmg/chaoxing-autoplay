import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('无章节页面'); process.exit(0); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    try {
      const f = window.__pf;
      const cd = f ? f.contentWindow.document : null;
      const v = cd ? cd.querySelector('video') : null;
      if (!v) return 'no video el';
      return JSON.stringify({
        cur: +v.currentTime.toFixed(2), dur: v.duration, paused: v.paused,
        readyState: v.readyState, networkState: v.networkState,
        error: v.error ? { code: v.error.code, msg: v.error.message } : null,
        buffered: (() => { try { const b=[]; for(let i=0;i<v.buffered.length;i++) b.push([+v.buffered.start(i).toFixed(1), +v.buffered.end(i).toFixed(1)]); return b; } catch(e){ return 'err'; } })(),
        src: (v.currentSrc||'').slice(0,50),
        videoWidth: v.videoWidth, videoHeight: v.videoHeight
      }, null, 1);
    } catch (e) { return 'ERR ' + e.message; }
  })()`, returnByValue: true,
}, page.sessionId, 20000);
console.log(r.result?.value || JSON.stringify(r).slice(0,300));
cdp.close();
