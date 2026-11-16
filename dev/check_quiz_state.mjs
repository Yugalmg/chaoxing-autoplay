import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    try {
      const p = window.__pf.contentWindow.videojs.getPlayer('video');
      const w = window.__pf.contentWindow;
      const d = w.document;
      const bodyText = d.body ? d.body.innerText.replace(/\s+/g,' ').slice(0, 400) : '';
      const visibles = [...d.querySelectorAll('div')].filter(e => e.offsetParent !== null && e.children.length < 30 && (e.innerText||'').trim().length > 4 && (e.innerText||'').length < 300).map(e => ({cls:String(e.className).slice(0,50), txt:(e.innerText||'').replace(/\s+/g,' ').slice(0,120)})).slice(0, 15);
      return JSON.stringify({ cur: +p.currentTime().toFixed(1), paused: p.paused(), bodyText, visibles });
    } catch (e) { return 'ERR ' + e.message; }
  })()`, returnByValue: true,
}, page.sessionId, 20000);
console.log(r.result?.value || JSON.stringify(r).slice(0,500));
cdp.close();
