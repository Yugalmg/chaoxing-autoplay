import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, cookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268092949', KID = '1265127906', OBJECT_ID = '4b9ec2babd03bea2e67ab1a32154c6a4';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const { cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9334, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
await cdp.send('Network.enable', {}, page.sessionId);

const media = [];
cdp.on('Network.responseReceived', (p) => {
  if (/\.mp4|cldisk/.test(p.response?.url || '')) media.push({ url: p.response.url.slice(-90), status: p.response.status, type: p.response.mimeType });
});
cdp.on('Network.loadingFailed', (p) => {
  if (/mp4|cldisk/.test(p.url || '')) console.log(`[FAIL] ${(p.url || '').slice(-70)} err=${p.errorText}`);
});

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const probe = `(() => {
  const cards = document.getElementById('iframe')?.contentDocument;
  if (!cards) return JSON.stringify({err:'no cards'});
  let v = null;
  [...cards.querySelectorAll('iframe')].forEach(f => {
    try { const x = f.contentWindow.document.querySelector('video');
      if (x && (x.currentSrc||'').includes('${OBJECT_ID}')) v = x; } catch (e) {}
  });
  if (!v) return JSON.stringify({err:'no target video'});
  let buf = [];
  try { for (let i = 0; i < v.buffered.length; i++) buf.push([+v.buffered.start(i).toFixed(0), +v.buffered.end(i).toFixed(0)]); } catch (e) {}
  return JSON.stringify({
    cur:+v.currentTime.toFixed(1), dur:v.duration, paused:v.paused, ended:v.ended,
    readyState:v.readyState, networkState:v.networkState,
    buffered: buf, error: v.error ? {code:v.error.code, msg:v.error.message} : null,
    src: v.currentSrc.slice(0, 200), preload: v.preload, rate: v.playbackRate
  }, null, 1);
})()`;

const r = await cdp.send('Runtime.evaluate', { expression: probe, returnByValue: true }, page.sessionId, 20000);
console.log('=== 视频状态 ===');
console.log(r.result?.value || JSON.stringify(r).slice(0, 500));

console.log('\n=== 媒体请求 ===');
for (const m of media.slice(0, 10)) console.log(`  ${m.status} ${m.type} ...${m.url}`);

// 尝试播放并观察缓冲增长
await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.getElementById('iframe').contentDocument;
    let v = null;
    [...cards.querySelectorAll('iframe')].forEach(f => { try { const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x; } catch(e){} });
    if (!v) return 'no';
    v.muted = true; try { v.playbackRate = 1.5; } catch(e){}
    v.play().catch(()=>{});
    return 'playing';
  })()`, returnByValue: true,
}, page.sessionId, 15000);

for (let i = 0; i < 4; i++) {
  await sleep(8000);
  const s = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.getElementById('iframe')?.contentDocument;
      let v=null; try { [...cards.querySelectorAll('iframe')].forEach(f=>{ const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x; }); } catch(e){}
      if(!v) return 'gone';
      let buf=[]; try{ for(let i=0;i<v.buffered.length;i++) buf.push([+v.buffered.start(i).toFixed(0), +v.buffered.end(i).toFixed(0)]); }catch(e){}
      return JSON.stringify({cur:+v.currentTime.toFixed(1), rs:v.readyState, ns:v.networkState, buf});
    })()`, returnByValue: true,
  }, page.sessionId, 15000);
  console.log(`[+${(i + 1) * 8}s] ${s.result?.value}`);
}

try { proc.kill(); } catch {}
