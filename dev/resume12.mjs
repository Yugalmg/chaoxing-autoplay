import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies, sleep, httpGet, extractJsonObject } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268092949', KID = '1265127906', OBJECT_ID = '4b9ec2babd03bea2e67ab1a32154c6a4';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const logStream = fs.createWriteStream(path.join(ROOT, 'log', 'worker.log'), { flags: 'a' });
const log = (m) => { const l = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`; console.log(l); logStream.write(l + '\n'); };

async function serverState() {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${KID}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}`);
    const a = (JSON.parse(extractJsonObject(html, 'mArg')).attachments || []).find(x => x.objectId === OBJECT_ID);
    return a ? { playTime: (a.playTime || 0) / 1000, dur: a.attDuration, passed: !!a.isPassed } : null;
  } catch { return null; }
}

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1280,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}

const URL_CHAPTER = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url: URL_CHAPTER }, page.sessionId, 30000);
await sleep(16000);

async function ev(expr, timeout = 120000) {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, timeout);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
}

log('===== resume12 Blob + videojs.src =====');

const prep = await ev(`(async () => {
  const cards = document.getElementById('iframe');
  const cd = cards.contentDocument;
  let f = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || '').includes('${OBJECT_ID}')) f = x; } catch (e) {}
  });
  if (!f) return 'no iframe';
  f.scrollIntoView({ block: 'center', behavior: 'instant' });
  const w = f.contentWindow;
  window.__pf = f;
  const v = w.document.querySelector('video');
  const url = v.currentSrc || v.src;
  const t0 = Date.now();
  const resp = await w.fetch(url, { credentials: 'omit' });
  const blob = await resp.blob();
  window.__blobUrl = w.URL.createObjectURL(blob);
  return JSON.stringify({ mb: +(blob.size / 1048576).toFixed(1), sec: +((Date.now() - t0) / 1000).toFixed(1) });
})()`, 180000);
log(`预加载: ${prep}`);
if (typeof prep !== 'string' || !prep.startsWith('{')) { log('失败终止'); try { proc.kill(); } catch {} process.exit(0); }

const mount = await ev(`(async () => {
  const w = window.__pf.contentWindow;
  const p = w.videojs.getPlayer('video');
  p.src({ src: window.__blobUrl, type: 'video/mp4' });
  await new Promise(r => setTimeout(r, 2500));
  try { p.playbackRate(1.5); } catch (e) {}
  try { p.play(); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ cur: +p.currentTime().toFixed(1), dur: Math.round(p.duration() || 0), paused: p.paused(), rate: p.playbackRate() });
})()`, 60000);
log(`挂载: ${mount}`);

const until = Date.now() + 30 * 60000;
let tick = 0, lastCur = -1, stall = 0;

while (Date.now() < until) {
  tick++;
  const s = await ev(`(() => {
    try {
      const p = window.__pf.contentWindow.videojs.getPlayer('video');
      return JSON.stringify({ cur: +p.currentTime().toFixed(1), dur: Math.round(p.duration() || 0), paused: p.paused(), rate: p.playbackRate() });
    } catch (e) { return 'gone'; }
  })()`, 20000);

  let j = null; try { j = s ? JSON.parse(s) : null; } catch {}
  if (j) {
    if (tick % 4 === 1) log(`  cur=${j.cur}/${j.dur} paused=${j.paused} rate=${j.rate}`);
    if (j.dur && j.cur >= j.dur - 2) { log('到达片尾'); break; }
    if (Math.abs(j.cur - lastCur) < 0.5) {
      if (++stall % 3 === 0) await ev(`(async()=>{ const p=window.__pf.contentWindow.videojs.getPlayer('video'); p.playbackRate(1.5); try{p.play();}catch(e){} return 'r'; })()`, 15000);
    } else stall = 0;
    lastCur = j.cur;
  }

  if (tick % 6 === 0) {
    const sv = await serverState();
    if (sv) {
      log(`  服务端 ${sv.playTime.toFixed(0)}/${sv.dur}s ${((sv.playTime / sv.dur) * 100).toFixed(0)}% passed=${sv.passed}`);
      if (sv.passed || sv.playTime >= sv.dur * 0.95) { log('✓ 服务端通过'); break; }
    }
  }
  await sleep(8000);
}

const f2 = await serverState();
log(`===== 结束: ${f2 ? `${f2.playTime.toFixed(0)}/${f2.dur}s ${((f2.playTime / f2.dur) * 100).toFixed(0)}% passed=${f2.passed}` : 'n/a'} =====`);
try { proc?.kill(); } catch {}
logStream.end();
process.exit(0);
