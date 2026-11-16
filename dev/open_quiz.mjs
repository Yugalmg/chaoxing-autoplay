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
await sleep(14000);

const ev = async (expr, t = 40000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('切到章节测验 tab…');
await ev(`(async () => { document.getElementById('dct2').click(); await new Promise(r=>setTimeout(r,1200)); return 'ok'; })()`);
await sleep(9000);

console.log('cards 页里的测验条目:');
console.log(await ev(`(() => {
  const f = document.getElementById('iframe');
  const d = f && f.contentDocument;
  if (!d) return 'no doc';
  const items = [...d.querySelectorAll('*')].filter(el => {
    const t = (el.innerText||'').trim();
    return /后哲学的主题/.test(t) && t.length < 60 && el.children.length < 6 && el.offsetParent !== null;
  }).slice(0, 5).map(el => ({ tag: el.tagName, cls: String(el.className).slice(0,50), text: el.innerText.trim().slice(0,40), onclick: (el.getAttribute('onclick')||'').slice(0,120) }));
  return JSON.stringify(items, null, 1);
})()`));

console.log('\n点击测验条目…');
console.log(await ev(`(async () => {
  const d = document.getElementById('iframe').contentDocument;
  const el = [...d.querySelectorAll('*')].find(e => /后哲学的主题/.test(e.innerText||'') && e.children.length < 6 && e.offsetParent !== null && /div|li|a/.test(e.tagName.toLowerCase()));
  if (!el) return 'not found';
  (el.closest('[onclick]') || el).click();
  await new Promise(r => setTimeout(r, 6000));
  return 'clicked';
})()`));
await sleep(7000);

console.log('\n=== 测验页 DOM ===');
console.log(await ev(`(() => {
  const out = [];
  const scan = (doc, tag) => {
    try {
      const qs = [...doc.querySelectorAll('.questionLi, .mark_item, .TiMu, [class*=question], [class*=timu]')];
      qs.slice(0, 10).forEach(q => out.push({ tag, cls: String(q.className).slice(0,50), text: q.innerText.replace(/\\s+/g,' ').slice(0,300) }));
      const ifr = [...doc.querySelectorAll('iframe')];
      ifr.forEach(f => { try { if (f.contentDocument) scan(f.contentDocument, tag + '>' + (f.id||'if')); } catch(e){} });
    } catch (e) {}
  };
  scan(document, 'top');
  return JSON.stringify({ count: out.length, items: out.slice(0, 8) }, null, 1);
})()`, 40000));

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'quiz_live.png'), Buffer.from(shot.data, 'base64'));
console.log('\n截图 -> log/quiz_live.png');
console.log('浏览器保持 240 秒供后续操作');
await sleep(240000);
try { proc.kill(); } catch {}
