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

async function ev(expr, timeout = 90000) {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, timeout);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
}

log('===== resume11 Blob 预加载 =====');

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
  const v = w.document.querySelector('video');
  const url = v.currentSrc || v.src;
  if (!url) return 'no src';
  const t0 = Date.now();
  let resp;
  try { resp = await w.fetch(url, { mode: 'cors', credentials: 'omit' }); }
  catch (e) { return 'FETCH_FAIL: ' + e.message + ' | url=' + url.slice(0, 80); }
  if (!resp.ok) return 'HTTP ' + resp.status;
  const blob = await resp.blob();
  const burl = w.URL.createObjectURL(blob);
  window.__blobUrl = burl;
  window.__playerFrame = f;
  return JSON.stringify({ mb: +(blob.size / 1048576).toFixed(1), sec: +((Date.now() - t0) / 1000).toFixed(1), type: blob.type });
})()`, 120000);

log(`预加载: ${prep}`);
if (typeof prep !== 'string' || !prep.startsWith('{')) {
  log('预加载失败，终止');
  try { proc.kill(); } catch {}
  process.exit(0);
}

const swap = await ev(`(async () => {
  const w = window.__playerFrame.contentWindow;
  const v = w.document.querySelector('video');
  v.src = window.__blobUrl;
  v.load();
  await new Promise(r => setTimeout(r, 2000));
  v.muted = true;
  v.playbackRate = 1.5;
  try { await v.play(); } catch (e) { return 'PLAY_FAIL: ' + e.message; }
  await new Promise(r => setTimeout(r, 2000));
  return JSON.stringify({ dur: v.duration, cur: +v.currentTime.toFixed(1), paused: v.paused, rs: v.readyState });
})()`, 60000);
log(`挂载: ${swap}`);

const until = Date.now() + 35 * 60000;
let tick = 0, lastSrv = 0, lastCur = -1;

while (Date.now() < until) {
  tick++;
  const s = await ev(`(() => {
    try {
      const v = window.__playerFrame.contentWindow.document.querySelector('video');
      if (!v) return 'gone';
      return JSON.stringify({ cur: +v.currentTime.toFixed(1), dur: Math.round(v.duration || 0), paused: v.paused, rate: v.playbackRate, ended: v.ended });
    } catch (e) { return 'gone'; }
  })()`, 20000);

  let j = null; try { j = s ? JSON.parse(s) : null; } catch {}
  if (j) {
    if (tick % 4 === 1) log(`  cur=${j.cur}/${j.dur} paused=${j.paused} rate=${j.rate}`);
    if (j.ended || (j.dur && j.cur >= j.dur - 2)) { log('到达片尾'); break; }
    if (Math.abs(j.cur - lastCur) < 0.5) {
      await ev(`(async()=>{ const v=window.__playerFrame.contentWindow.document.querySelector('video'); v.playbackRate=1.5; try{await v.play();}catch(e){} return 'r'; })()`, 15000);
    }
    lastCur = j.cur;
  }

  if (tick % 6 === 0) {
    const sv = await serverState();
    if (sv) {
      log(`  服务端 ${sv.playTime.toFixed(0)}/${sv.dur}s ${((sv.playTime / sv.dur) * 100).toFixed(0)}% passed=${sv.passed}`);
      if (sv.passed || sv.playTime >= sv.dur * 0.95) { log('✓ 服务端通过'); break; }
      lastSrv = sv.playTime;
    }
  }
  await sleep(8000);
}

const f2 = await serverState();
log(`===== 结束: ${f2 ? `${f2.playTime.toFixed(0)}/${f2.dur}s ${((f2.playTime / f2.dur) * 100).toFixed(0)}% passed=${f2.passed}` : 'n/a'} =====`);
try { proc?.kill(); } catch {}
logStream.end();
process.exit(0);
