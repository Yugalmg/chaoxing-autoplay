import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep, httpGet, extractJsonObject } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const kid = '1248000017';  // 8.4.6

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1400,950', '--disable-backgrounding-occluded-windows'],
});
await cdp.send('Storage.setCookies', {
  cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const ev = async (expr, t = 60000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('=== 不做 blob，直接用播放器原生源测试 ===');
console.log(await ev(`(async () => {
  const cd = document.getElementById('iframe').contentDocument;
  const f = [...cd.querySelectorAll('iframe')].find(x => {
    try { return !!x.contentWindow.document.querySelector('video'); } catch(e) { return false; }
  });
  if (!f) return 'no player iframe';
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const p = w.videojs.getPlayer('video');
  const before = { src: (v.currentSrc||v.src||'').slice(0,100), rs: v.readyState };
  try { await p.play(); } catch(e) {}
  await new Promise(r => setTimeout(r, 8000));
  return JSON.stringify({
    before,
    after: { cur: +v.currentTime.toFixed(1), rs: v.readyState, err: v.error ? v.error.code + ':' + v.error.message : null, w: v.videoWidth, h: v.videoHeight },
    canPlayH265: v.canPlayType('video/mp4; codecs="hvc1"'),
    canPlayH264: v.canPlayType('video/mp4; codecs="avc1.42E01E"')
  });
})()`, 90000));

await sleep(6000);
console.log('\n=== 6 秒后状态 ===');
console.log(await ev(`(() => {
  const cd = document.getElementById('iframe').contentDocument;
  const f = [...cd.querySelectorAll('iframe')].find(x => { try { return !!x.contentWindow.document.querySelector('video'); } catch(e) { return false; } });
  if (!f) return 'gone';
  const v = f.contentWindow.document.querySelector('video');
  return JSON.stringify({ cur: +v.currentTime.toFixed(2), rs: v.readyState, paused: v.paused, err: v.error ? v.error.code : null });
})()`));

try { proc.kill(); } catch {}
