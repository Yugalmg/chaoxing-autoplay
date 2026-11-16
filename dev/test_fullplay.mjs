import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep, httpGet, extractJsonObject } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));
const ch = s.chapters.find(x => x.no === '9.5.2');
console.log(`9.5.2 kid=${ch.kid}`);

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1400,950', '--disable-backgrounding-occluded-windows'],
});
await cdp.send('Storage.setCookies', {
  cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch.kid}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(14000);

const ev = async (expr, t = 120000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

// 定位播放器
console.log(await ev(`(async () => {
  const cd = document.getElementById('iframe').contentDocument;
  const f = [...cd.querySelectorAll('iframe')].find(x => { try { return !!x.contentWindow.document.querySelector('video'); } catch(e){ return false; } });
  if (!f) return 'no frame';
  window.__pf = f;
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const p = w.videojs.getPlayer('video');
  const src = v.currentSrc || v.src;
  // 从真正的 0 开始
  v.src = src; v.load();
  await new Promise(r => setTimeout(r, 3000));
  v.currentTime = 0;
  await new Promise(r => setTimeout(r, 1000));
  await p.play();
  return JSON.stringify({ src: src.slice(0,70), dur: p.duration() });
})()`, 90000));

// 每 20 秒看一次进度，直到结束
for (let i = 0; i < 25; i++) {
  await sleep(20000);
  const st = await ev(`(() => {
    const v = window.__pf.contentWindow.document.querySelector('video');
    return JSON.stringify({ cur: +v.currentTime.toFixed(1), dur: Math.round(v.duration), ended: v.ended, paused: v.paused, rs: v.readyState });
  })()`);
  console.log(`  [${(i+1)*20}s] ${st}`);
  try { if (JSON.parse(st).ended) break; } catch {}
}
try { proc.kill(); } catch {}
