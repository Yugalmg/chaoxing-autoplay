import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

// 找 13.2 章节
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));
const ch = s.chapters.find(x => x.no === '13.2');
console.log(`13.2 ${ch.title}  kid=${ch.kid}`);

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
await sleep(15000);

const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 150);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('\n=== 页面状态 ===');
console.log(await ev(`(() => {
  const tabs = [...document.querySelectorAll('[id^="dct"]')].map(e => ({ id: e.id, title: e.title, active: String(e.className).includes('active') }));
  return JSON.stringify({
    title: document.title.slice(0, 40),
    url: location.href.slice(0, 110),
    tabs,
    iframeIds: [...document.querySelectorAll('iframe')].map(f => f.id || '(no-id)'),
    bodyText: document.body ? document.body.innerText.replace(/\s+/g,' ').slice(0, 200) : ''
  }, null, 1);
})()`));

console.log('\n=== 点视频 tab ===');
console.log(await ev(`(async () => {
  const tabs = [...document.querySelectorAll('[id^="dct"]')];
  const vt = tabs.find(e => /视频/.test(e.title || ''));
  if (!vt) return 'no video tab';
  vt.click();
  await new Promise(r => setTimeout(r, 9000));
  const f = document.getElementById('iframe');
  return JSON.stringify({
    iframeNow: f ? f.src.slice(0,110) : null,
    hasContentDoc: f ? !!f.contentDocument : false,
    innerLen: f && f.contentDocument ? f.contentDocument.body.innerHTML.length : 0
  });
})()`, 40000));

await sleep(5000);
console.log('\n=== 最终状态 ===');
console.log(await ev(`(() => {
  const f = document.getElementById('iframe');
  if (!f) return 'no #iframe element';
  if (!f.contentDocument) return 'iframe cross-origin or not loaded';
  const vs = [...f.contentDocument.querySelectorAll('video')].length;
  const ifr = [...f.contentDocument.querySelectorAll('iframe')].length;
  return JSON.stringify({ videos: vs, innerIframes: ifr, bodyLen: f.contentDocument.body.innerHTML.length });
})()`));

try { proc.kill(); } catch {}
