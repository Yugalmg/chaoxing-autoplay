import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268092949', KID = '1265127910';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const target = c.jobs.find(j => j.kid === KID && j.type === 'video');
const OBJ = target.objectId;
console.log(`目标 ${target.name} ${target.duration}s obj=${OBJ}`);

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
await sleep(15000);

const ev = async (expr, t = 90000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 300);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('\n=== PREP（带每轮 duration 计时）===');
console.log(await ev(`(async () => {
  const t0 = Date.now();
  const cd = document.getElementById('iframe').contentDocument;
  let f = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || y.src || '').includes('${OBJ}')) f = x; } catch (e) {}
  });
  if (!f) return 'no frame';
  window.__pf = f;
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const srcUrl = v.currentSrc || v.src;
  const tFetch = Date.now();
  const resp = await w.fetch(srcUrl, { credentials: 'omit' });
  const blob = await resp.blob();
  const tBlob = Date.now();
  const burl = w.URL.createObjectURL(blob);
  const p = w.videojs.getPlayer('video');
  p.src({ src: burl, type: 'video/mp4' });
  const marks = [];
  let d = 0;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try { d = p.duration() || 0; } catch (e) { marks.push('exc@' + i); }
    if (i < 4 || d > 0) marks.push(i + ':' + Math.round(d * 10) / 10);
    if (d > 0) break;
  }
  return JSON.stringify({
    fetchMs: tBlob - tFetch, totalMs: Date.now() - t0, mb: +(blob.size / 1048576).toFixed(1),
    dur: Math.round(d), marks: marks.slice(0, 8),
    elState: { rs: v.readyState, ns: v.networkState, err: v.error ? v.error.code : null, buf: v.buffered.length }
  });
})()`, 120000));

console.log('\n=== DRIVE（await play，捕获拒绝原因）===');
console.log(await ev(`(async () => {
  const w = window.__pf.contentWindow;
  const p = w.videojs.getPlayer('video');
  const v = w.document.querySelector('video');
  const out = { before: { cur: p.currentTime(), dur: p.duration(), paused: p.paused(), rs: p.readyState() } };

  // 监听 play 事件
  let firedPlay = false, firedSeeking = false, firedError = null;
  const onPlay = () => { firedPlay = true; };
  v.addEventListener('play', onPlay);
  v.addEventListener('seeking', () => { firedSeeking = true; });
  v.addEventListener('error', () => { firedError = v.error ? v.error.code + ':' + v.error.message : 'unknown'; });

  try { p.currentTime(p.duration() * 0.9); } catch (e) { out.seekErr = String(e.message).slice(0, 80); }
  await new Promise(r => setTimeout(r, 1500));
  out.afterSeek = { cur: p.currentTime(), paused: p.paused() };

  let playErr = null;
  try {
    const pr = p.play();
    if (pr && pr.catch) await pr;
  } catch (e) { playErr = e.name + ': ' + String(e.message).slice(0, 120); }
  out.playErr = playErr;
  await new Promise(r => setTimeout(r, 4000));
  out.after4s = { cur: p.currentTime(), paused: p.paused(), rs: p.readyState() };
  out.events = { firedPlay, firedSeeking, firedError };
  out.el = { rs: v.readyState, ns: v.networkState, bufLen: v.buffered.length, muted: v.muted, src: (v.currentSrc || '').slice(0, 30) };
  v.removeEventListener('play', onPlay);
  return JSON.stringify(out, null, 1);
})()`, 60000));

try { proc.kill(); } catch {}
