import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '267906227', KID = '1262060630';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

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

const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('=== 顶层 iframe 列表 ===');
console.log(await ev(`JSON.stringify([...document.querySelectorAll('iframe')].map(f=>({id:f.id,src:(f.src||'').slice(0,100)})))`));

console.log('\n=== 左侧目录（章节列表）里含"测验"的项 ===');
console.log(await ev(`(() => {
  const out = [];
  const walk = (doc, tag) => {
    try {
      [...doc.querySelectorAll('a,span,div,li')].forEach(el => {
        const t = (el.innerText || '').trim();
        if (/章节测验|测验/.test(t) && t.length < 30 && el.offsetParent !== null) {
          out.push({ tag, text: t.slice(0,30), cls: String(el.className).slice(0,40), id: el.id, href: el.getAttribute && el.getAttribute('href') });
        }
      });
    } catch (e) {}
  };
  walk(document, 'top');
  const cardIframe = document.getElementById('iframe');
  if (cardIframe && cardIframe.contentDocument) walk(cardIframe.contentDocument, 'cards');
  return JSON.stringify(out.slice(0, 15), null, 1);
})()`));

console.log('\n=== 全局变量里搜 work/quiz ===');
console.log(await ev(`(() => {
  const hits = [];
  try {
    for (const k of Object.keys(window)) {
      if (/work|quiz|exam/i.test(k)) hits.push('window.' + k + ' (' + typeof window[k] + ')');
    }
  } catch (e) {}
  return JSON.stringify(hits.slice(0, 20));
})()`));

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'ch84.png'), Buffer.from(shot.data, 'base64'));
console.log('\n截图 -> log/ch84.png');

// 保持浏览器 3 分钟供后续排查
console.log('\n浏览器保持运行 180 秒…');
await sleep(180000);
try { proc.kill(); } catch {}
