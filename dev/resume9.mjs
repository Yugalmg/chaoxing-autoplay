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
const URL_CHAPTER = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;

async function boot() {
  try { proc?.kill(); } catch {}
  ({ cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
    extraArgs: ['--window-position=-10000,-10000', '--window-size=1280,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] }));
  await cdp.send('Storage.setCookies', {
    cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
  });
  page = await newPage(cdp);
  try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}
  try { await cdp.send('Page.navigate', { url: URL_CHAPTER }, page.sessionId, 30000); } catch {}
  await sleep(16000);
}

async function ev(expr, timeout = 15000) {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, timeout);
    return r.result?.value ?? null;
  } catch { return null; }
}

const LOCATE = `let f=null; [...document.getElementById('iframe').contentDocument.querySelectorAll('iframe')].forEach(x=>{try{const y=x.contentWindow.document.querySelector('video'); if(y&&(y.currentSrc||'').includes('${OBJECT_ID}')) f=x;}catch(e){}});`;

const DRIVE = `(async () => {
  ${LOCATE}
  if (!f) return JSON.stringify({ok:false, why:'no iframe'});
  try { f.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
  const w = f.contentWindow;
  if (!w.videojs) return JSON.stringify({ok:false, why:'no videojs'});
  let p;
  try { p = w.videojs.getPlayer('video'); } catch (e) { return JSON.stringify({ok:false, why:'no player'}); }
  if (!p) return JSON.stringify({ok:false, why:'player null'});
  let action = 'idle';
  if (p.paused()) { try { p.play(); action = 'play'; } catch (e) { action = 'playerr:' + e.message; } }
  if (Math.abs(p.playbackRate() - 1.5) > 0.05) { try { p.playbackRate(1.5); action += '+rate'; } catch (e) {} }
  let cur = null, dur = null;
  try { cur = +p.currentTime().toFixed(1); } catch (e) {}
  try { dur = Math.round(p.duration() || 0); } catch (e) {}
  return JSON.stringify({ok:true, action, cur, dur, paused: p.paused(), rate: p.playbackRate(), ready: p.readyState()});
})()`;

log('===== resume8 videojs 官方 API =====');
await boot();
log(`初次驱动: ${await ev(DRIVE, 25000)}`);

const until = Date.now() + 30 * 60000;
let lastSrv = 0, stagnant = 0, tick = 0, lastCur = -1;

while (Date.now() < until) {
  tick++;
  try { await fetch('http://127.0.0.1:9333/json/version'); } catch { log('Chrome 退出，重启'); await boot(); continue; }

  const s = await ev(DRIVE, 25000);
  let j = null;
  try { j = s ? JSON.parse(s) : null; } catch {}

  if (j?.ok) {
    if (tick % 4 === 1) log(`  cur=${j.cur}/${j.dur} paused=${j.paused} rate=${j.rate} action=${j.action}`);
    if (j.dur && j.cur >= j.dur - 2) { log('到达片尾'); break; }
    if (Math.abs((j.cur ?? 0) - lastCur) < 0.5) {
      // 停滞：重载页面
      if (++stagnant % 5 === 0) { log('  播放停滞，重载页面'); await boot(); }
    } else stagnant = 0;
    lastCur = j.cur ?? lastCur;
  } else {
    if (tick % 6 === 0) log(`  驱动异常 ${s ? s.slice(0, 80) : 'timeout'}`);
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
