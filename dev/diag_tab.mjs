import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '267906196';   // 美的历程
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('美的历程'));
const ch71 = s.chapters.find(x => x.no === '7.1');
console.log('7.1:', ch71?.kid, ch71?.title);

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1400,950', '--disable-backgrounding-occluded-windows'],
});
await cdp.send('Storage.setCookies', {
  cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch71.kid}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('\n=== 默认状态 ===');
console.log(await ev(`(() => {
  const f = document.getElementById('iframe');
  const tabs = [...document.querySelectorAll('[id^=dct]')].map(e => ({ id: e.id, title: e.title, active: e.className.includes('active') }));
  const cd = f && f.contentDocument;
  const hasVideo = cd ? !!cd.querySelector('video') : false;
  return JSON.stringify({ tabs, iframeSrc: f ? f.src.slice(0,120) : null, hasVideo, bodyLen: cd ? cd.body.innerHTML.length : 0 }, null, 1);
})()`));

console.log('\n=== 点击「视频」tab ===');
console.log(await ev(`(async () => {
  const all = [...document.querySelectorAll('[id^=dct]')];
  const v = all.find(e => /视频/.test(e.title || e.innerText || ''));
  if (!v) return 'no video tab, tabs=' + JSON.stringify(all.map(e=>e.id+':'+e.title));
  v.click();
  await new Promise(r => setTimeout(r, 9000));
  const f = document.getElementById('iframe');
  const cd = f && f.contentDocument;
  const vs = cd ? [...cd.querySelectorAll('video')].length : 0;
  const frames = cd ? [...cd.querySelectorAll('iframe')].length : 0;
  return JSON.stringify({ clicked: v.id, iframeSrc: f ? f.src.slice(0,120) : null, videoEls: vs, innerIframes: frames });
})()`, 40000));

console.log('\n=== 切到视频后重新检查 ===');
console.log(await ev(`(() => {
  const f = document.getElementById('iframe');
  const cd = f && f.contentDocument;
  if (!cd) return 'no doc';
  const frames = [...cd.querySelectorAll('iframe')].map((x,i) => ({ i, src: (x.src||'').slice(0,80) }));
  let deepVideos = 0;
  frames.forEach(x => { try { const d = [...cd.querySelectorAll('iframe')]; } catch(e){} });
  const mArg = cd.body.innerHTML.match(/attachments\s*:\s*\[/);
  return JSON.stringify({ frames, hasAttachments: !!mArg, bodyText: cd.body.innerText.replace(/\s+/g,' ').slice(0,150) }, null, 1);
})()`));
await sleep(60000);
try { proc.kill(); } catch {}
