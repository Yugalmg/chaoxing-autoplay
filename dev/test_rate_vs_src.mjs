import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep, httpGet, extractJsonObject } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '265739431', KID = '1248000017';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const OBJ = '84f1da2266b86499dc2edabd07027589';

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1400,950', '--disable-backgrounding-occluded-windows'],
});
await cdp.send('Storage.setCookies', {
  cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const ev = async (expr, t = 120000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 150);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

// 定位播放器并保存原始 URL
console.log('定位:', await ev(`(() => {
  const cd = document.getElementById('iframe').contentDocument;
  const f = [...cd.querySelectorAll('iframe')].find(x => { try { return !!x.contentWindow.document.querySelector('video'); } catch(e){ return false; } });
  if (!f) return 'no frame';
  window.__pf = f;
  const v = f.contentWindow.document.querySelector('video');
  window.__orig = v.currentSrc || v.src;
  return JSON.stringify({ orig: window.__orig.slice(0,80), rs: v.readyState });
})()`));

const probe = async (label) => {
  await sleep(12000);
  const s = await ev(`(() => {
    const v = window.__pf.contentWindow.document.querySelector('video');
    return JSON.stringify({ cur: +v.currentTime.toFixed(1), rate: v.playbackRate, rs: v.readyState, paused: v.paused, err: v.error ? v.error.code : null });
  })()`);
  console.log(`  ${label}: ${s}`);
  return s;
};

// 测试 1: 原生源 + 1.0x
console.log('\n=== 测试1: 原生源 + 1.0x ===');
console.log(await ev(`(async () => {
  const w = window.__pf.contentWindow;
  const p = w.videojs.getPlayer('video');
  const v = w.document.querySelector('video');
  v.src = window.__orig; v.load();
  await new Promise(r => setTimeout(r, 3000));
  v.playbackRate = 1.0;
  try { await p.play(); } catch(e) {}
  return 'played@1.0';
})()`));
await probe('12s后');

// 测试 2: 同源 + 1.5x
console.log('\n=== 测试2: 同源 + 1.5x ===');
console.log(await ev(`(async () => {
  const w = window.__pf.contentWindow;
  const p = w.videojs.getPlayer('video');
  const v = w.document.querySelector('video');
  const before = v.currentTime;
  try { p.playbackRate(1.5); } catch(e) { return 'setErr:' + e.message; }
  await new Promise(r => setTimeout(r, 500));
  try { await p.play(); } catch(e) {}
  return JSON.stringify({ rate: p.playbackRate(), before: +before.toFixed(1) });
})()`));
await probe('12s后');

try { proc.kill(); } catch {}
