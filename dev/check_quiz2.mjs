import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    try {
      const p = window.__pf.contentWindow.videojs.getPlayer('video');
      const d = window.__pf.contentWindow.document;
      const sub = d.querySelector('#videoquiz-submit');
      const opts = d.querySelectorAll('li.ans-videoquiz-opt');
      const okEl = d.querySelector('#spanHas');
      const notEl = d.querySelector('#spanNot');
      const cont = d.querySelector('#videoquiz-continue');
      return JSON.stringify({
        cur: +p.currentTime().toFixed(1), dur: Math.round(p.duration()), paused: p.paused(),
        quizVisible: !!(sub && sub.offsetParent !== null),
        optCount: opts.length,
        okVisible: !!(okEl && okEl.offsetParent !== null),
        notVisible: !!(notEl && notEl.offsetParent !== null),
        contVisible: !!(cont && cont.offsetParent !== null)
      });
    } catch (e) { return 'ERR ' + e.message; }
  })()`, returnByValue: true,
}, page.sessionId, 20000);
console.log(r.result?.value);
cdp.close();
