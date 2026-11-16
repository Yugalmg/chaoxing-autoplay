import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no studentstudy page:', list.map(t=>t.type+':'+t.url.slice(0,60))); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    try {
      const p = window.__pf.contentWindow.videojs.getPlayer('video');
      const v = window.__pf.contentWindow.document.querySelector('video');
      const d = document.getElementById('iframe')?.contentDocument;
      return JSON.stringify({
        cur: +p.currentTime().toFixed(1), dur: Math.round(p.duration()),
        paused: p.paused(), rate: p.playbackRate(),
        videoEl: { rs: v.readyState, ns: v.networkState, err: v.error ? v.error.code : null },
        hasCards: !!d, quizSubmitVisible: !!(d && d.querySelector('#videoquiz-submit') && d.querySelector('#videoquiz-submit').offsetParent !== null)
      });
    } catch (e) { return 'ERR ' + e.message; }
  })()`, returnByValue: true,
}, page.sessionId, 20000);
console.log(r.result?.value || JSON.stringify(r).slice(0,300));
cdp.close();
