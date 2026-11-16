import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(0); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => { try { const p = window.__pf.contentWindow.videojs.getPlayer('video'); const v = window.__pf.contentWindow.document.querySelector('video');
    return JSON.stringify({ cur: +v.currentTime.toFixed(2), dur: v.duration, rs: v.readyState, paused: v.paused, ended: v.ended, rate: v.playbackRate }); } catch(e) { return 'ERR ' + e.message; } })()`,
  returnByValue: true,
}, page.sessionId, 15000);
console.log(r.result?.value);
cdp.close();
