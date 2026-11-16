import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const read = `(() => { const v = window.__pf.contentWindow.document.querySelector('video'); return JSON.stringify({cur:+v.currentTime.toFixed(1), rate:v.playbackRate, paused:v.paused}); })()`;
const ev = async (expr) => { try { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, page.sessionId, 20000); return r.result?.value; } catch(e) { return 'ERR'; } };
const a = await ev(read);
await new Promise(r => setTimeout(r, 20000));
const b = await ev(read);
try {
  const oa = JSON.parse(a), ob = JSON.parse(b);
  const delta = ob.cur - oa.cur;
  console.log(`20 秒实测: ${oa.cur} -> ${ob.cur}  推进 ${delta.toFixed(1)}s  实际倍速 ${(delta/20).toFixed(2)}x  rate=${ob.rate}`);
} catch(e) { console.log(a, b); }
cdp.close();
