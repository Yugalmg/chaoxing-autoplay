import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies, sleep } from './lib/core.mjs';
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

const mp4 = [];
cdp.on('Network.responseReceived', (p) => {
  if (/\.mp4/.test(p.response?.url || '')) mp4.push(`${p.response.status} ${p.response.url.slice(-60)}`);
});
cdp.on('Network.loadingFailed', (p) => { if (/mp4/.test(p.url || '')) console.log(`[FAIL] ${(p.url || '').slice(-60)} ${p.errorText}`); });

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const act = (body) => cdp.send('Runtime.evaluate', {
  expression: `(async () => {
    const cards = document.getElementById('iframe').contentDocument;
    let v = null;
    [...cards.querySelectorAll('iframe')].forEach(f => { try { const x=f.contentWindow.document.querySelector('video'); if (x && (x.currentSrc||'').includes('${OBJECT_ID}')) v=x; } catch(e){} });
    if (!v) return 'no target';
    ${body}
  })()`, returnByValue: true, awaitPromise: true,
}, page.sessionId, 25000);

const stat = () => cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.getElementById('iframe')?.contentDocument;
    let v=null; try { [...cards.querySelectorAll('iframe')].forEach(f=>{ const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x; }); } catch(e){}
    if(!v) return 'gone';
    let buf=[]; try{ for(let i=0;i<v.buffered.length;i++) buf.push([+v.buffered.start(i).toFixed(0),+v.buffered.end(i).toFixed(0)]); }catch(e){}
    return JSON.stringify({cur:+v.currentTime.toFixed(1), paused:v.paused, ended:v.ended, rs:v.readyState, ns:v.networkState, buf});
  })()`, returnByValue: true,
}, page.sessionId, 15000);

console.log('--- 初始 ---', (await stat()).result?.value);

console.log('\n--- 播放 ---');
console.log(await act(`v.muted=true; try{v.playbackRate=1.5;}catch(e){} try{await v.play();}catch(e){} return 'played';`).then(r => r.result?.value));
for (let i = 0; i < 3; i++) { await sleep(6000); console.log(`  [+${(i + 1) * 6}s]`, (await stat()).result?.value); }

console.log('\n--- seek 到 735 ---');
console.log(await act(`v.currentTime = 735; try{await v.play();}catch(e){} return 'seeked';`).then(r => r.result?.value));
for (let i = 0; i < 4; i++) { await sleep(6000); console.log(`  [+${(i + 1) * 6}s]`, (await stat()).result?.value); }

console.log('\n--- seek 到 1000 ---');
console.log(await act(`v.currentTime = 1000; try{await v.play();}catch(e){} return 'seeked';`).then(r => r.result?.value));
for (let i = 0; i < 3; i++) { await sleep(6000); console.log(`  [+${(i + 1) * 6}s]`, (await stat()).result?.value); }

console.log('\n=== mp4 请求 ===');
for (const m of mp4.slice(0, 12)) console.log('  ' + m);

try { proc.kill(); } catch {}
