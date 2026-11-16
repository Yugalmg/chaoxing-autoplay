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

let cdp, proc, page;

async function boot() {
  try { proc?.kill(); } catch {}
  ({ cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true }));
  await cdp.send('Storage.setCookies', {
    cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
  });
  page = await newPage(cdp);
  try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}
  const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
  try { await cdp.send('Page.navigate', { url }, page.sessionId, 30000); } catch {}
  await sleep(16000);
}

const SCROLL = `(() => {
  const cards = document.getElementById('iframe'); if (!cards) return 'null';
  const cd = cards.contentDocument;
  let f = null, v = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || '').includes('${OBJECT_ID}')) { f = x; v = y; } } catch (e) {}
  });
  if (!v) return 'null';
  try { f.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
  const rv = v.getBoundingClientRect(), rf = f.getBoundingClientRect(), rc = cards.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(rc.left + rf.left + rv.left + rv.width / 2), y: Math.round(rc.top + rf.top + rv.top + rv.height / 2), rs: v.readyState, dur: Math.round(v.duration || 0), cur: +v.currentTime.toFixed(1) });
})()`;

const STAT = `(() => {
  const cd = document.getElementById('iframe')?.contentDocument; if(!cd) return 'gone';
  let v=null; [...cd.querySelectorAll('iframe')].forEach(f=>{try{const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x;}catch(e){}});
  if(!v) return 'gone';
  let buf=[]; try{for(let i=0;i<v.buffered.length;i++)buf.push([+v.buffered.start(i).toFixed(0),+v.buffered.end(i).toFixed(0)]);}catch(e){}
  return JSON.stringify({cur:+v.currentTime.toFixed(1),dur:Math.round(v.duration||0),paused:v.paused,rate:v.playbackRate,rs:v.readyState,buf});
})()`;

async function ev(expr, timeout = 12000) {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, page.sessionId, timeout);
    return r.result?.value ?? null;
  } catch { return null; }
}

async function click(x, y) {
  try {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, page.sessionId, 10000);
    await sleep(120);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, page.sessionId, 10000);
    await sleep(80);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, page.sessionId, 10000);
  } catch {}
}

async function chromeAlive() {
  try { const r = await fetch('http://127.0.0.1:9333/json/version'); return r.ok; } catch { return false; }
}

async function wake() {
  const s = await ev(SCROLL, 20000);
  if (!s || s === 'null') return null;
  const r = JSON.parse(s);
  if (r.rs === 0) await sleep(2500);
  await click(r.x, r.y);
  await sleep(2500);
  await ev(`(async()=>{ const cd=document.getElementById('iframe').contentDocument; let v=null;
    [...cd.querySelectorAll('iframe')].forEach(f=>{try{const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x;}catch(e){}});
    if(!v) return 'no'; v.muted=true; try{v.playbackRate=1.5;}catch(e){} try{await v.play();}catch(e){} return 'ok'; })()`, 20000);
  return r;
}

log('===== resume7 超时容忍驱动 =====');
await boot();

const until = Date.now() + 30 * 60000;
let lastSrv = 0, stagnant = 0, tick = 0, failStreak = 0;

while (Date.now() < until) {
  tick++;

  if (!(await chromeAlive())) { log('Chrome 退出，重启'); await boot(); lastSrv = 0; continue; }

  const s = await ev(STAT);
  if (s === null) { failStreak++; if (failStreak % 10 === 0) log(`  evaluate 连续超时 ${failStreak}`); }
  else failStreak = 0;

  let j = null;
  if (s && s !== 'gone') { try { j = JSON.parse(s); } catch {} }

  if (j) {
    if (tick % 5 === 1) log(`  cur=${j.cur}/${j.dur} rate=${j.rate} paused=${j.paused} rs=${j.rs} buf=${JSON.stringify(j.buf)}`);
    if (j.dur && j.cur >= j.dur - 2) { log('到达片尾'); break; }
    if (j.paused) { log('  暂停 → 唤醒'); await wake(); }
    else if (Math.abs(j.rate - 1.5) > 0.05 && j.cur > 0) {
      await ev(`(()=>{ const cd=document.getElementById('iframe').contentDocument; let v=null;
        [...cd.querySelectorAll('iframe')].forEach(f=>{try{const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x;}catch(e){}});
        if(v){try{v.playbackRate=1.5;}catch(e){}} return 'r'; })()`);
    }
  } else if (s === 'gone' || s === null) {
    if (tick % 10 === 0) { log('  状态不可读 → 唤醒'); await wake(); }
  }

  if (tick % 5 === 0) {
    const sv = await serverState();
    if (sv) {
      log(`  服务端 ${sv.playTime.toFixed(0)}/${sv.dur}s ${((sv.playTime / sv.dur) * 100).toFixed(0)}% passed=${sv.passed}`);
      if (sv.passed || sv.playTime >= sv.dur * 0.95) { log('✓ 服务端通过'); break; }
      if (sv.playTime <= lastSrv + 1) {
        if (++stagnant >= 4) { log('  停滞 → 重载'); stagnant = 0; await boot(); await wake(); }
      } else stagnant = 0;
      lastSrv = sv.playTime;
    }
  }
  await sleep(9000);
}

const f = await serverState();
log(`===== 结束: ${f ? `${f.playTime.toFixed(0)}/${f.dur}s ${((f.playTime / f.dur) * 100).toFixed(0)}% passed=${f.passed}` : 'n/a'} =====`);
try { proc?.kill(); } catch {}
logStream.end();
process.exit(0);
