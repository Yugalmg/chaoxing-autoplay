import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, cookies } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const cid = '268918938';
const c = index[cid];
const target = c.jobs.filter(j => j.type === 'video' && !j.passed && j.jobid).sort((a, b) => a.duration - b.duration)[0];

console.log(`选中: ${target.no} ${target.chapter} / ${target.name} dur=${target.duration}s jobid=${target.jobid}`);

const { cdp, proc, port } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({
    name: x.name, value: x.value, domain: x.domain, path: x.path || '/',
    secure: !!x.secure, httpOnly: !!x.httpOnly,
    expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax',
  })),
});

const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${target.kid}&courseId=${cid}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId);
await new Promise(r => setTimeout(r, 10000));

// 1) 列出所有 target
const { targetInfos } = await cdp.send('Target.getTargets');
console.log('\n=== targets ===');
for (const t of targetInfos) console.log(`  ${t.type}\t${(t.url || '').slice(0, 110)}`);

// 2) 在主 frame 里统计 iframe 层数
const r1 = await cdp.send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    url: location.href.slice(0,120),
    iframes: [...document.querySelectorAll('iframe')].map(f => ({id: f.id, name: f.name, src: (f.src||'').slice(0,120)})),
    videos: document.querySelectorAll('video').length
  })`,
  returnByValue: true,
}, page.sessionId);
console.log('\n=== main frame ===');
console.log(r1.result?.value ?? JSON.stringify(r1).slice(0, 800));

// 3) 逐层深入 iframe 找 video
for (const f of (JSON.parse(r1.result?.value || '{}').iframes || [])) {
  if (!f.src) continue;
  const t = targetInfos.find(x => x.url === f.src || x.url.startsWith(f.src.slice(0, 80)));
  console.log(`\n  iframe ${f.id || f.name} -> target: ${t ? t.targetId + ' ' + t.type : 'same-process'}`);
  if (!t) continue;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  const r2 = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href.slice(0,140),
      videos: [...document.querySelectorAll('video')].map(v => ({dur:v.duration, cur:v.currentTime, paused:v.paused, rate:v.playbackRate, ready:v.readyState, src:(v.currentSrc||'').slice(0,120)})),
      iframes: [...document.querySelectorAll('iframe')].map(x => ({id:x.id, src:(x.src||'').slice(0,140)}))
    })`, returnByValue: true,
  }, sessionId);
  console.log('   ', r2.result?.value ?? JSON.stringify(r2).slice(0, 600));
}

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'probe2.png'), Buffer.from(shot.data, 'base64'));
console.log('\nscreenshot -> log/probe2.png');
try { proc.kill(); } catch {}
