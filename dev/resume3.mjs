import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies, sleep, httpGet, extractJsonObject } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268092949', KID = '1265127906', OBJECT_ID = '4b9ec2babd03bea2e67ab1a32154c6a4';
const RATE = 1.5;
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

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const FIND = `let v=null; [...document.getElementById('iframe').contentDocument.querySelectorAll('iframe')].forEach(f=>{try{const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x;}catch(e){}});`;

const act = async (body, label) => {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(async () => { ${FIND} if(!v) return 'NO_TARGET'; ${body} })()`,
    returnByValue: true, awaitPromise: true,
  }, page.sessionId, 25000);
  if (r.exceptionDetails) { log(`  ${label}: EXC ${JSON.stringify(r.exceptionDetails).slice(0, 150)}`); return null; }
  return r.result?.value;
};

const stat = async () => {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => { ${FIND} if(!v) return 'gone';
      let buf=[]; try{for(let i=0;i<v.buffered.length;i++)buf.push([+v.buffered.start(i).toFixed(0),+v.buffered.end(i).toFixed(0)]);}catch(e){}
      return JSON.stringify({cur:+v.currentTime.toFixed(1),paused:v.paused,rate:v.playbackRate,rs:v.readyState,ns:v.networkState,ended:v.ended,buf}); })()`,
    returnByValue: true,
  }, page.sessionId, 20000);
  return r.result?.value;
};

log(`===== resume3 启动 =====`);
log(`状态: ${await stat()}`);

// 步骤1：先 play 一次（可能失败，无妨）
log(`play#1 -> ${await act(`v.muted=true; try{v.playbackRate=${RATE};}catch(e){} try{await v.play();}catch(e){} return 'ok';`, 'play1')}`);
await sleep(4000);
log(`状态: ${await stat()}`);

// 步骤2：seek + play 唤醒（test_seek 验证过的序列）
log(`seek+play -> ${await act(`v.muted=true; try{v.playbackRate=${RATE};}catch(e){} v.currentTime = v.currentTime + 15; try{await v.play();}catch(e){} return 'ok';`, 'seek')}`);
await sleep(6000);
log(`状态: ${await stat()}`);

const until = Date.now() + 28 * 60000;
let lastSrv = 0, st = 0, tick = 0;

while (Date.now() < until) {
  tick++;
  const s = await stat();
  if (s === 'gone') { log('视频消失'); break; }
  let j; try { j = JSON.parse(s); } catch { await sleep(10000); continue; }
  if (tick % 3 === 1) log(`  dom cur=${j.cur}/${Math.round(j.dur || 0)} paused=${j.paused} rate=${j.rate} buf=${JSON.stringify(j.buf)}`);

  if (j.ended || (j.dur && j.cur >= j.dur - 2)) { log('到达片尾'); break; }

  // 每 60 秒核对服务端
  if (tick % 6 === 0) {
    const sv = await serverState();
    if (sv) {
      log(`  服务端 ${sv.playTime.toFixed(0)}/${sv.dur}s ${((sv.playTime / sv.dur) * 100).toFixed(0)}% passed=${sv.passed}`);
      if (sv.passed || sv.playTime >= sv.dur * 0.95) { log('✓ 服务端已判定通过'); break; }
      if (sv.playTime <= lastSrv + 1) {
        st++;
        if (st >= 3) { log('  服务端停滞，重载页面'); st = 0; await cdp.send('Page.navigate', { url }, page.sessionId, 30000); await sleep(15000); await act(`v.muted=true; try{v.playbackRate=${RATE};}catch(e){} v.currentTime=v.currentTime+15; try{await v.play();}catch(e){} return 'ok';`, 'reload-seek'); }
      } else st = 0;
      lastSrv = sv.playTime;
    }
  }
  await sleep(10000);
}

const f = await serverState();
log(`\n===== resume3 结束: ${f ? `${f.playTime.toFixed(0)}/${f.dur}s ${((f.playTime / f.dur) * 100).toFixed(0)}% passed=${f.passed}` : 'n/a'} =====`);
try { proc.kill(); } catch {}
logStream.end();
process.exit(0);
