import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const cid = '268918938';
const c = index[cid];
const target = c.jobs.filter(j => j.type === 'video' && !j.passed && j.jobid).sort((a, b) => a.duration - b.duration)[0];

const { cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});

const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${target.kid}&courseId=${cid}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId);
await new Promise(r => setTimeout(r, 15000));

const expr = `(() => {
  const found = [];
  function walk(win, p, d) {
    if (d > 8) return;
    let doc; try { doc = win.document; } catch (e) { found.push({err: 'x-origin', p}); return; }
    if (!doc) return;
    for (const v of doc.querySelectorAll('video')) {
      found.push({ p, dur: v.duration, cur: v.currentTime, paused: v.paused, rate: v.playbackRate,
        ready: v.readyState, net: v.networkState, src: (v.currentSrc || '').slice(0, 110),
        id: v.id, cls: v.className, w: v.videoWidth, h: v.videoHeight });
    }
    let i = 0;
    for (const f of doc.querySelectorAll('iframe')) {
      const np = p + '>' + (f.id || f.name || ('if' + (i++)));
      try { if (f.contentWindow) walk(f.contentWindow, np, d + 1); } catch (e) { found.push({err: 'blocked', p: np}); }
    }
  }
  walk(window, 'root', 0);
  return JSON.stringify({ videos: found, count: found.length }, null, 1);
})()`;

const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId);
if (r.exceptionDetails) console.log('EXCEPTION:', JSON.stringify(r.exceptionDetails).slice(0, 800));
console.log(r.result?.value ?? JSON.stringify(r).slice(0, 1200));

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'probe3.png'), Buffer.from(shot.data, 'base64'));
try { proc.kill(); } catch {}
