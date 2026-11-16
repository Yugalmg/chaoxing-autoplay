import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, cookies } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));

// 选形势与政策里最短的未通过视频
const cid = '268918938';
const c = index[cid];
const pending = c.jobs.filter(j => j.type === 'video' && !j.passed && j.jobid).sort((a, b) => a.duration - b.duration);
const target = pending[0];
console.log(`课程: ${c.course}`);
console.log(`选中: ${target.no} ${target.chapter} / ${target.name}  duration=${target.duration}s  jobid=${target.jobid}`);

const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { cdp, proc, port } = await launchBrowser({ exe: EXE, port: 9333, headless: true });
console.log('chrome up on', port);

await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({
    name: x.name, value: x.value, domain: x.domain, path: x.path || '/',
    secure: !!x.secure, httpOnly: !!x.httpOnly,
    expires: x.expires && x.expires > 0 ? x.expires : -1,
    sameSite: x.sameSite || 'Lax',
  })),
});
console.log('cookies injected:', cookies.length);

const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${target.kid}&courseId=${cid}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
console.log('navigate:', url);
await cdp.send('Page.navigate', { url }, page.sessionId);
await new Promise(r => setTimeout(r, 9000));

const probe = `(() => {
  const out = [];
  function walk(win, depth) {
    let doc; try { doc = win.document; } catch (e) { return; }
    if (!doc) return;
    const vs = doc.querySelectorAll('video');
    for (const v of vs) out.push({
      depth, url: win.location.href.slice(0, 140),
      dur: v.duration, cur: v.currentTime, paused: v.paused, rate: v.playbackRate,
      ready: v.readyState, net: v.networkState,
      src: (v.currentSrc || '').slice(0, 140), w: v.videoWidth, h: v.videoHeight
    });
    for (const f of doc.querySelectorAll('iframe')) {
      try { if (f.contentWindow) walk(f.contentWindow, depth + 1); } catch (e) {}
    }
  }
  walk(window, 0);
  return JSON.stringify({ title: document.title, url: location.href.slice(0,140), videos: out,
    frames: (() => { const a=[]; (function w(d,f){ try{ a.push({d, url:f.location.href.slice(0,120)}); }catch(e){ a.push({d, url:'x-origin'}); } f.querySelectorAll('iframe').forEach(x=>{try{if(x.contentWindow)w(d+1,x.contentWindow)}catch(e){}}); })(0, window); return a; })(),
    bodyText: document.body ? document.body.innerText.slice(0, 300) : ''
  }, null, 1);
})()`;

const r = await cdp.send('Runtime.evaluate', { expression: probe, returnByValue: true }, page.sessionId);
console.log('\n=== DOM probe ===');
console.log(r.result.value);

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'probe.png'), Buffer.from(shot.data, 'base64'));
console.log('\nscreenshot -> log/probe.png');

fs.writeFileSync(path.join(ROOT, 'state', 'probe_target.json'), JSON.stringify({ course: c, target, port }, null, 2));
try { proc.kill(); } catch {}
