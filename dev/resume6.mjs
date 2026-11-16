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

const { cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
await cdp.send('Network.enable', {}, page.sessionId);
await cdp.send('Page.enable', {}, page.sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(16000);

// 滚动到目标视频并返回坐标
const scrollExpr = `(() => {
  const cards = document.getElementById('iframe');
  if (!cards) return 'null';
  const cd = cards.contentDocument;
  let f = null, v = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || '').includes('${OBJECT_ID}')) { f = x; v = y; } } catch (e) {}
  });
  if (!v) return 'null';
  try { f.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
  const rv = v.getBoundingClientRect(), rf = f.getBoundingClientRect(), rc = cards.getBoundingClientRect();
  return JSON.stringify({
    x: Math.round(rc.left + rf.left + rv.left + rv.width / 2),
    y: Math.round(rc.top + rf.top + rv.top + rv.height / 2),
    vw: Math.round(rv.width), vh: Math.round(rv.height),
    top: Math.round(rc.top + rf.top + rv.top),
    rs: v.readyState, dur: v.duration
  });
})()`;

async function scrollAndRect() {
  const r = await cdp.send('Runtime.evaluate', { expression: scrollExpr, returnByValue: true }, page.sessionId, 25000);
  const v = r.result?.value;
  return (!v || v === 'null') ? null : JSON.parse(v);
}

async function clickAt(x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, page.sessionId, 15000);
  await sleep(150);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, page.sessionId, 15000);
  await sleep(100);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, page.sessionId, 15000);
}

const stat = async () => {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cd = document.getElementById('iframe')?.contentDocument; if(!cd) return 'gone';
      let v=null; [...cd.querySelectorAll('iframe')].forEach(f=>{try{const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x;}catch(e){}});
      if(!v) return 'gone';
      let buf=[]; try{for(let i=0;i<v.buffered.length;i++)buf.push([+v.buffered.start(i).toFixed(0),+v.buffered.end(i).toFixed(0)]);}catch(e){}
      return JSON.stringify({cur:+v.currentTime.toFixed(1),dur:Math.round(v.duration||0),paused:v.paused,rate:v.playbackRate,rs:v.readyState,ns:v.networkState,buf});
    })()`, returnByValue: true,
  }, page.sessionId, 15000);
  return r.result?.value;
};

log('===== resume6 滚动+点击 =====');
let rect = await scrollAndRect();
log(`滚动后矩形: ${JSON.stringify(rect)}`);
log(`初始: ${await stat()}`);

if (rect) {
  await clickAt(rect.x, rect.y);
  log('点击完成');
  await sleep(5000);
  log(`点击后: ${await stat()}`);
}

// 若仍暂停，直接 play（此时已在视口内，应能加载）
await cdp.send('Runtime.evaluate', {
  expression: `(async () => {
    const cd = document.getElementById('iframe').contentDocument;
    let v=null; [...cd.querySelectorAll('iframe')].forEach(f=>{try{const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x;}catch(e){}});
    if(!v) return 'no';
    v.muted = true; try { v.playbackRate = 1.5; } catch (e) {}
    try { await v.play(); } catch (e) { return 'fail:' + e.message; }
    return 'ok';
  })()`, returnByValue: true, awaitPromise: true,
}, page.sessionId, 20000).then(r => log(`play() -> ${r.result?.value}`));

await sleep(6000);
log(`播放后: ${await stat()}`);

const until = Date.now() + 25 * 60000;
let lastSrv = 0, stagnant = 0, tick = 0;

while (Date.now() < until) {
  tick++;
  const s = await stat();
  if (s === 'gone') { log('视频消失'); break; }
  let j; try { j = JSON.parse(s); } catch { await sleep(8000); continue; }
  if (tick % 4 === 1) log(`  cur=${j.cur}/${j.dur} paused=${j.paused} rate=${j.rate} rs=${j.rs} buf=${JSON.stringify(j.buf)}`);
  if (j.dur && j.cur >= j.dur - 2) { log('到达片尾'); break; }

  if (j.paused) {
    const r2 = await scrollAndRect();
    if (r2) { await clickAt(r2.x, r2.y); log(`  暂停 → 点击@${r2.x},${r2.y} rs=${r2.rs}`); await sleep(3000); }
  }

  if (tick % 6 === 0) {
    const sv = await serverState();
    if (sv) {
      log(`  服务端 ${sv.playTime.toFixed(0)}/${sv.dur}s ${((sv.playTime / sv.dur) * 100).toFixed(0)}% passed=${sv.passed}`);
      if (sv.passed || sv.playTime >= sv.dur * 0.95) { log('✓ 通过'); break; }
      if (sv.playTime <= lastSrv + 1) { if (++stagnant >= 4) { log('  停滞，重载'); stagnant = 0; await cdp.send('Page.navigate', { url }, page.sessionId, 30000); await sleep(16000); const r3 = await scrollAndRect(); if (r3) await clickAt(r3.x, r3.y); } }
      else stagnant = 0;
      lastSrv = sv.playTime;
    }
  }
  await sleep(8000);
}

const f = await serverState();
log(`===== 结束: ${f ? `${f.playTime.toFixed(0)}/${f.dur}s ${((f.playTime / f.dur) * 100).toFixed(0)}% passed=${f.passed}` : 'n/a'} =====`);
try { proc.kill(); } catch {}
logStream.end();
process.exit(0);
