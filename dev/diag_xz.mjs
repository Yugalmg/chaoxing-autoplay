import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268918938';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('形势与政策'));
const ch72 = s.chapters.find(x => x.no === '7.2');
console.log('7.2 视频章节 kid =', ch72?.kid, ch72?.title);

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1400,950', '--disable-backgrounding-occluded-windows'],
});
await cdp.send('Storage.setCookies', {
  cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch72.kid}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
console.log('导航:', url.slice(0, 150));
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);

for (const wait of [10000, 20000, 35000]) {
  await sleep(wait === 10000 ? 10000 : wait - (wait === 20000 ? 10000 : 20000));
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const f = document.getElementById('iframe');
      return JSON.stringify({
        title: document.title.slice(0,40),
        url: location.href.slice(0,110),
        hasIframe: !!f,
        iframeSrc: f ? (f.src||'').slice(0,110) : null,
        hasContentDoc: f ? !!f.contentDocument : false,
        contentLen: f && f.contentDocument ? f.contentDocument.body.innerHTML.length : 0,
        bodyText: document.body ? document.body.innerText.replace(/\\s+/g,' ').slice(0,150) : ''
      });
    })()`, returnByValue: true,
  }, page.sessionId, 20000);
  console.log(`\n[${wait/1000}s]`, r.result?.value);
}
try { proc.kill(); } catch {}
