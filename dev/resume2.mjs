import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, cookies, sleep, httpGet, extractJsonObject } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const g = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const CID = g('--course', '268092949');
const KID = g('--kid', '1265127906');
const OBJECT_ID = g('--object', '4b9ec2babd03bea2e67ab1a32154c6a4');
const RATE = Number(g('--rate', '1.5'));
const MAX_MIN = Number(g('--max', '30'));
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const logStream = fs.createWriteStream(path.join(ROOT, 'log', 'worker.log'), { flags: 'a' });
const log = (m) => { const l = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`; console.log(l); logStream.write(l + '\n'); };

async function serverState() {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${KID}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}`);
    const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
    const a = (mArg.attachments || []).find(x => x.objectId === OBJECT_ID);
    if (!a) return null;
    return { playTime: (a.playTime || 0) / 1000, dur: a.attDuration, passed: !!a.isPassed };
  } catch (e) { return null; }
}

let cdp, proc, page, alive = false;

async function boot() {
  try { proc?.kill(); } catch {}
  ({ cdp, proc } = await launchBrowser({ exe: EXE, port: 9333, headless: true }));
  await cdp.send('Storage.setCookies', {
    cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
  });
  page = await newPage(cdp);
  await cdp.send('Network.enable', {}, page.sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(()=>{const b=()=>{try{document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:60+Math.random()*600,clientY:60+Math.random()*400}))}catch(e){}};setInterval(b,20000);window.addEventListener('blur',e=>e.stopPropagation(),true);})();`,
  }, page.sessionId);
  const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
  await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
  await sleep(15000);
  alive = true;
}

const drive = `(async () => {
  const cards = document.getElementById('iframe')?.contentDocument;
  if (!cards) return JSON.stringify({ok:false, why:'no cards'});
  let target = null, idx = -1;
  [...cards.querySelectorAll('iframe')].forEach((f, i) => {
    try { const v = f.contentWindow.document.querySelector('video');
      if (v && (v.currentSrc||'').includes('${OBJECT_ID}')) { target = v; idx = i; } } catch (e) {}
  });
  if (!target) return JSON.stringify({ok:false, why:'no target'});
  const v = target;
  v.muted = true;
  if (Math.abs(v.playbackRate - ${RATE}) > 0.01) { try { v.playbackRate = ${RATE}; } catch (e) {} }

  const cur = v.currentTime, now = Date.now();
  if (!window.__xxt || window.__xxt.obj !== '${OBJECT_ID}') window.__xxt = { obj: '${OBJECT_ID}', cur, t: now, seeks: 0 };
  const st = window.__xxt;

  let action = 'idle';
  if (Math.abs(cur - st.cur) > 0.5) { st.cur = cur; st.t = now; }
  else if (now - st.t > 12000) {
    st.seeks++; st.t = now; st.cur = cur;
    try { v.currentTime = cur + 15; } catch (e) {}
    try { await v.play(); } catch (e) {}
    action = 'seek+' + st.seeks;
  } else if (v.paused && !v.ended) {
    try { await v.play(); } catch (e) {}
    action = 'play';
  }

  let buf = [];
  try { for (let i = 0; i < v.buffered.length; i++) buf.push([+v.buffered.start(i).toFixed(0), +v.buffered.end(i).toFixed(0)]); } catch (e) {}
  return JSON.stringify({ok:true, idx, action, cur:+cur.toFixed(1), dur:Math.round(v.duration||0), paused:v.paused, rate:v.playbackRate, ended:v.ended, buf});
})()`;

log(`===== resume2 启动 object=${OBJECT_ID} rate=${RATE} =====`);
const base = await serverState();
log(`服务端基线: ${base ? `${base.playTime.toFixed(0)}/${base.dur}s passed=${base.passed}` : 'n/a'}`);

await boot();
const until = Date.now() + MAX_MIN * 60000;
let lastServer = base?.playTime || 0, stagnant = 0, tick = 0, finished = false;

while (Date.now() < until) {
  tick++;
  // 轻量驱动
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: drive, returnByValue: true, awaitPromise: true }, page.sessionId, 20000);
    const s = JSON.parse(r.result?.value || '{}');
    if (s.ok && tick % 3 === 0) log(`  dom cur=${s.cur}/${s.dur}s rate=${s.rate} paused=${s.paused}`);
    if (s.ok && s.ended) { log('  DOM 已到片尾'); }
  } catch (e) {
    log(`  eval 超时/失败: ${e.message}`);
    // 连续失败视为浏览器异常
    try { await fetch('http://127.0.0.1:9333/json/version'); } catch {
      log('  Chrome 已退出，重启');
      await boot();
      continue;
    }
  }

  // 每 3 个 tick 查一次服务端（约 60s）
  if (tick % 3 === 0) {
    const st = await serverState();
    if (st) {
      log(`  服务端 ${st.playTime.toFixed(0)}/${st.dur}s ${((st.playTime / st.dur) * 100).toFixed(0)}% passed=${st.passed}`);
      if (st.passed || st.playTime >= st.dur * 0.95) { finished = true; break; }
      if (st.playTime <= lastServer + 1) {
        stagnant++;
        if (stagnant >= 3) { log('  服务端进度停滞 3 次，重启浏览器重播'); stagnant = 0; await boot(); continue; }
      } else stagnant = 0;
      lastServer = st.playTime;
    }
  }
  await sleep(20000);
}

const fin = await serverState();
log(`\n===== resume2 结束 =====`);
log(`最终服务端: ${fin ? `${fin.playTime.toFixed(0)}/${fin.dur}s ${((fin.playTime / fin.dur) * 100).toFixed(0)}% passed=${fin.passed}` : 'n/a'}`);
try { proc?.kill(); } catch {}
logStream.end();
process.exit(0);
