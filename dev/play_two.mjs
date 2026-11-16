import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const cid = '268918938';
const c = index[cid];
const target = c.jobs.filter(j => j.type === 'video' && !j.passed && j.jobid).sort((a, b) => a.duration - b.duration)[0];
console.log(`目标: ${target.no} ${target.chapter} / ${target.name}  objectId=${target.objectId}`);

const { cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
await cdp.send('Network.enable', {}, page.sessionId);

const reports = [];
cdp.on('Network.requestWillBeSent', (p) => {
  const u = p.request?.url || '';
  if (u.includes('/multimedia/log') || u.includes('initdatawithviewer')) {
    reports.push({ url: u.slice(0, 150), method: p.request.method, post: (p.request.postData || '').slice(0, 500) });
    console.log(`[NET] ${p.request.method} ${u.slice(0, 110)}`);
    if (p.request.postData) console.log(`      ${p.request.postData.slice(0, 350)}`);
  }
});

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${target.kid}&courseId=${cid}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId);
await new Promise(r => setTimeout(r, 15000));

// 按 video.currentSrc 匹配 objectId
const scan = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.getElementById('iframe')?.contentDocument;
    if (!cards) return JSON.stringify({err:'no cards'});
    const out = [];
    [...cards.querySelectorAll('iframe')].forEach((f, i) => {
      try {
        const d = f.contentWindow.document;
        const v = d.querySelector('video');
        out.push({ i, src: v ? (v.currentSrc || '') : null, dur: v ? v.duration : null,
                   paused: v ? v.paused : null, rate: v ? v.playbackRate : null,
                   hasPlayer: !!d.querySelector('.vjs-big-play-button, .vjs-tech') });
      } catch (e) { out.push({ i, err: String(e.message).slice(0, 60) }); }
    });
    return JSON.stringify(out);
  })()`, returnByValue: true,
}, page.sessionId);

const frames = JSON.parse(scan.result?.value || '[]');
console.log('\n=== 播放器扫描 ===');
for (const f of frames) console.log(`  [${f.i}] ${f.err ? 'ERR ' + f.err : (f.src || '(no src)').slice(0, 100) + '  dur=' + f.dur}`);

let idx = frames.findIndex(f => f.src && f.src.includes(target.objectId));
console.log(`\n匹配 objectId 的 iframe: ${idx}`);
if (idx < 0) {
  // 退路：按时长匹配
  idx = frames.findIndex(f => Math.round(f.dur) === target.duration && !f.paused);
  console.log(`退路按时长匹配: ${idx}`);
}

const play = await cdp.send('Runtime.evaluate', {
  expression: `(async () => {
    const cards = document.getElementById('iframe').contentDocument;
    const f = cards.querySelectorAll('iframe')[${idx}];
    if (!f) return 'NO_FRAME';
    const d = f.contentWindow.document;
    const v = d.querySelector('video');
    if (!v) return 'NO_VIDEO';
    v.muted = true;
    try { v.playbackRate = 1.5; } catch (e) {}
    try { await v.play(); } catch (e) { return 'PLAY_FAIL: ' + e.message; }
    await new Promise(r => setTimeout(r, 4000));
    return JSON.stringify({ dur: v.duration, cur: +v.currentTime.toFixed(2), paused: v.paused, rate: v.playbackRate, ready: v.readyState, w: v.videoWidth });
  })()`, returnByValue: true, awaitPromise: true,
}, page.sessionId);
console.log('\n=== 播放 ===', play.exceptionDetails ? JSON.stringify(play.exceptionDetails).slice(0, 400) : play.result?.value);

for (let i = 1; i <= 5; i++) {
  await new Promise(r => setTimeout(r, 12000));
  const s = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.getElementById('iframe').contentDocument;
      const f = cards.querySelectorAll('iframe')[${idx}];
      const v = f?.contentWindow?.document.querySelector('video');
      if (!v) return 'gone';
      return JSON.stringify({cur:+v.currentTime.toFixed(1), dur:v.duration, paused:v.paused, rate:v.playbackRate});
    })()`, returnByValue: true,
  }, page.sessionId);
  console.log(`[+${i * 12}s] ${s.result?.value}`);
}

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'playing.png'), Buffer.from(shot.data, 'base64'));
console.log(`\n网络事件: ${reports.length}`);
fs.writeFileSync(path.join(ROOT, 'log', 'reports.json'), JSON.stringify(reports, null, 2), 'utf8');
try { proc.kill(); } catch {}
