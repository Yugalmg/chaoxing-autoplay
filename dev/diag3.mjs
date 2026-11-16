import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268092949', KID = '1265127906';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

// 取 2.2 章节第一个视频
const ch22 = c.jobs.filter(j => j.type === 'video' && j.kid && !j.passed);
console.log('待处理视频样例:');
for (const j of ch22.slice(0, 5)) console.log(`  ${j.no} kid=${j.kid} ${j.duration}s ${j.name.slice(0, 30)}`);

const target = ch22[0];

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1280,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${target.kid}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(16000);

const ev = async (expr, t = 60000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('\n=== 1. 页面里的 iframe 与视频 ===');
console.log(await ev(`(() => {
  const cards = document.getElementById('iframe');
  if (!cards) return 'no cards';
  const cd = cards.contentDocument;
  const frames = [...cd.querySelectorAll('iframe')];
  return JSON.stringify({
    frameCount: frames.length,
    videos: frames.map((f, i) => {
      try { const v = f.contentWindow.document.querySelector('video');
        return { i, src: v ? (v.currentSrc || v.src || '').slice(-50) : null, dur: v ? v.duration : null, rs: v ? v.readyState : null };
      } catch (e) { return { i, err: String(e.message).slice(0, 40) }; }
    })
  }, null, 1);
})()`, 25000));

console.log('\n=== 2. 目标 objectId ===', target.objectId);

console.log('\n=== 3. 滚动 + blob 预加载 ===');
console.log(await ev(`(async () => {
  const cards = document.getElementById('iframe');
  const cd = cards.contentDocument;
  let f = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || '').includes('${target.objectId}')) f = x; } catch (e) {}
  });
  if (!f) return 'no frame matched';
  window.__pf = f;
  const r0 = f.getBoundingClientRect();
  f.scrollIntoView({ block: 'center', behavior: 'instant' });
  await new Promise(r => setTimeout(r, 1500));
  const r1 = f.getBoundingClientRect();
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const url = v.currentSrc || v.src;
  const resp = await w.fetch(url, { credentials: 'omit' });
  const blob = await resp.blob();
  const burl = w.URL.createObjectURL(blob);
  const p = w.videojs.getPlayer('video');
  p.src({ src: burl, type: 'video/mp4' });
  await new Promise(r => setTimeout(r, 4000));
  return JSON.stringify({
    rectBefore: { y: Math.round(r0.top) }, rectAfter: { y: Math.round(r1.top) },
    mb: +(blob.size / 1048576).toFixed(1),
    after: { dur: p.duration(), cur: p.currentTime(), paused: p.paused(), ready: p.readyState() }
  });
})()`, 120000));

console.log('\n=== 4. 尝试 seek 90% ===');
console.log(await ev(`(async () => {
  const w = window.__pf.contentWindow;
  const p = w.videojs.getPlayer('video');
  p.currentTime(p.duration() * 0.9);
  await new Promise(r => setTimeout(r, 1500));
  try { p.play(); } catch (e) {}
  await new Promise(r => setTimeout(r, 4000));
  return JSON.stringify({ cur: p.currentTime(), dur: p.duration(), paused: p.paused(), ready: p.readyState() });
})()`, 40000));

for (let i = 0; i < 3; i++) {
  await sleep(6000);
  console.log(`  [+${(i + 1) * 6}s]`, await ev(`(() => { const p = window.__pf.contentWindow.videojs.getPlayer('video'); return JSON.stringify({cur:+p.currentTime().toFixed(1),paused:p.paused(),ready:p.readyState()}); })()`, 20000));
}

try { proc.kill(); } catch {}
