import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268092949', KID = '1265127910';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const target = c.jobs.find(j => j.kid === KID && j.type === 'video');
console.log(`目标: ${target.no} ${target.name} ${target.duration}s obj=${target.objectId}`);

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1280,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(16000);

const ev = async (expr, t = 90000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 300);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('\n=== iframe 清单 ===');
console.log(await ev(`(() => {
  const cd = document.getElementById('iframe').contentDocument;
  return JSON.stringify([...cd.querySelectorAll('iframe')].map((f,i)=>{
    try { const v = f.contentWindow.document.querySelector('video');
      return { i, srcTail: v ? (v.currentSrc||v.src||'').slice(-40) : null, match: v ? (v.currentSrc||v.src||'').includes('${target.objectId}') : false, rs: v?v.readyState:null };
    } catch(e){ return {i, err:1}; }
  }));
})()`, 25000));

console.log('\n=== PREP ===');
console.log(await ev(`(async () => {
  const cd = document.getElementById('iframe').contentDocument;
  let f = null, idx = -1;
  [...cd.querySelectorAll('iframe')].forEach((x, i) => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || y.src || '').includes('${target.objectId}')) { f = x; idx = i; } } catch (e) {}
  });
  if (!f) return JSON.stringify({ ok:false, why:'no frame' });
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const url = v.currentSrc || v.src;
  const out = { ok:true, idx, hasVideojs: !!w.videojs, urlTail: (url||'').slice(-40) };
  if (!url) return JSON.stringify({ ok:false, why:'no url', idx });
  const resp = await w.fetch(url, { credentials: 'omit' });
  const blob = await resp.blob();
  out.mb = +(blob.size / 1048576).toFixed(1);
  const burl = w.URL.createObjectURL(blob);
  const p = w.videojs.getPlayer('video');
  out.playerName = 'video';
  p.src({ src: burl, type: 'video/mp4' });
  let d = 0;
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 500)); try { d = p.duration() || 0; } catch (e) {} if (d > 0) break; }
  out.dur = Math.round(d);
  out.cur = p.currentTime();
  out.paused = p.paused();
  out.rs = p.readyState();
  window.__pf = f;
  return JSON.stringify(out);
})()`, 150000));

console.log('\n=== unlock 90% + play ===');
console.log(await ev(`(async () => {
  if (!window.__pf) return 'no frame';
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  const d = p.duration() || 0;
  if (d > 0) p.currentTime(d * 0.9);
  await new Promise(r => setTimeout(r, 1500));
  try { p.play(); } catch (e) {}
  await new Promise(r => setTimeout(r, 4000));
  return JSON.stringify({ cur: p.currentTime(), dur: p.duration(), paused: p.paused(), rs: p.readyState() });
})()`, 40000));

for (let i = 0; i < 3; i++) {
  await sleep(6000);
  console.log(`  [+${(i + 1) * 6}s]`, await ev(`(() => { if(!window.__pf) return 'x'; const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1),paused:p.paused()}); })()`, 20000));
}
try { proc.kill(); } catch {}
