import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const cid = '268918938';
const c = index[cid];
const target = c.jobs.filter(j => j.type === 'video' && !j.passed && j.jobid).sort((a, b) => a.duration - b.duration)[0];
console.log(`目标: ${target.no} ${target.chapter} / ${target.name}`);
console.log(`  dur=${target.duration}s jobid=${target.jobid} objectId=${target.objectId}`);

const { cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});

const page = await newPage(cdp);
await cdp.send('Network.enable', {}, page.sessionId);

// 抓所有 multimedia/log 上报
const reports = [];
cdp.on('Network.requestWillBeSent', (p, sid) => {
  if (p.request?.url?.includes('/multimedia/log')) {
    reports.push({ t: Date.now(), url: p.request.url.slice(0, 160), method: p.request.method, post: (p.request.postData || '').slice(0, 400) });
    console.log(`\n[REPORT] ${p.request.method} ${p.request.url.slice(0, 120)}`);
    if (p.request.postData) console.log('         ' + p.request.postData.slice(0, 300));
  }
});
cdp.on('Network.responseReceived', (p) => {
  if (p.response?.url?.includes('/multimedia/log')) console.log(`         <- ${p.response.status}`);
});

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${target.kid}&courseId=${cid}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId);
console.log('等待页面加载...');
await new Promise(r => setTimeout(r, 15000));

// 列出播放器 iframe 的 src
const list = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.getElementById('iframe')?.contentDocument;
    if (!cards) return JSON.stringify({err:'no cards doc'});
    return JSON.stringify([...cards.querySelectorAll('iframe')].map((f,i)=>({i, id:f.id, name:f.name, src:(f.src||'').slice(0,200)})));
  })()`, returnByValue: true,
}, page.sessionId);
console.log('\n=== 播放器 iframe ===');
fs.writeFileSync(path.join(ROOT, 'log', 'iframes.json'), list.result?.value || '', 'utf8');
console.log((list.result?.value || '').slice(0, 2000));

// 找到目标 iframe 索引（src 含 objectId 或 jobid）
const frames = JSON.parse(list.result?.value || '[]');
let idx = frames.findIndex(f => f.src.includes(target.objectId) || f.src.includes(target.jobid));
console.log(`\n目标 iframe 索引: ${idx}  (匹配 objectId/jobid)`);

// 开始播放
const playExpr = `(async () => {
  const cards = document.getElementById('iframe').contentDocument;
  const fm = cards.querySelectorAll('iframe')[${idx}];
  if (!fm) return 'NO_FRAME';
  const w = fm.contentWindow;
  const v = w.document.querySelector('video');
  if (!v) return 'NO_VIDEO';
  v.muted = true;
  try { v.playbackRate = 1.5; } catch(e) {}
  const p = v.play();
  if (p && p.catch) p.catch(e => console.log('play err', e.message));
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ dur: v.duration, cur: v.currentTime, paused: v.paused, rate: v.playbackRate, ready: v.readyState });
})()`;

const r = await cdp.send('Runtime.evaluate', { expression: playExpr, returnByValue: true, awaitPromise: true }, page.sessionId);
console.log('\n=== 播放状态 ===');
console.log(r.exceptionDetails ? 'ERR ' + JSON.stringify(r.exceptionDetails).slice(0, 500) : r.result?.value);

// 观察 60 秒
for (let i = 1; i <= 6; i++) {
  await new Promise(r => setTimeout(r, 10000));
  const s = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.getElementById('iframe').contentDocument;
      const fm = cards.querySelectorAll('iframe')[${idx}];
      const v = fm?.contentWindow?.document.querySelector('video');
      if (!v) return 'gone';
      return JSON.stringify({cur: +v.currentTime.toFixed(2), dur: v.duration, paused: v.paused, rate: v.playbackRate, ready: v.readyState});
    })()`, returnByValue: true,
  }, page.sessionId);
  console.log(`[${i * 10}s] ${s.result?.value}`);
}

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'playing.png'), Buffer.from(shot.data, 'base64'));
console.log(`\n上报请求数: ${reports.length}`);
fs.writeFileSync(path.join(ROOT, 'log', 'reports.json'), JSON.stringify(reports, null, 2), 'utf8');
try { proc.kill(); } catch {}
