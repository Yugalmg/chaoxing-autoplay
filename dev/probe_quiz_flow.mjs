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
await cdp.send('Network.enable', {}, page.sessionId);

const net = [];
cdp.on('Network.requestWillBeSent', (p) => {
  const u = p.request?.url || '';
  if (/work|quiz|question/i.test(u) && !/\.(js|css|png|jpg|gif|woff)/i.test(u)) {
    net.push({ m: p.request.method, u: u.slice(0, 260), body: (p.request.postData || '').slice(0, 300) });
    console.log(`[NET] ${p.request.method} ${u.slice(0, 150)}`);
    if (p.request.postData) console.log(`      ${p.request.postData.slice(0, 200)}`);
  }
});

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

console.log('\n=== 点章节测验 tab ===');
await ev(`(async () => { document.getElementById('dct2').click(); await new Promise(r=>setTimeout(r,1000)); return 'ok'; })()`);
await sleep(8000);

console.log('\n=== num=1 的 cards 页内容 ===');
console.log(await ev(`(() => {
  const f = document.getElementById('iframe');
  const d = f && f.contentDocument;
  if (!d) return 'no iframe doc';
  const btns = [...d.querySelectorAll('a,button,div')].filter(el => {
    const t = (el.innerText || '').trim();
    return /开始|进入|测验|作业|答题/.test(t) && t.length < 20 && el.offsetParent !== null;
  }).slice(0, 10).map(el => ({ tag: el.tagName, cls: String(el.className).slice(0,50), id: el.id, text: el.innerText.trim(), href: el.getAttribute('href'), onclick: (el.getAttribute('onclick')||'').slice(0,120) }));
  return JSON.stringify({ url: (f.src||'').slice(0,140), bodyText: d.body.innerText.replace(/\\s+/g,' ').slice(0,300), btns }, null, 1);
})()`));

console.log('\n=== 尝试点击开始测验 ===');
console.log(await ev(`(async () => {
  const d = document.getElementById('iframe').contentDocument;
  const btn = [...d.querySelectorAll('a,button,div')].find(el => /开始|进入测验|答题/.test((el.innerText||'')) && el.offsetParent !== null);
  if (!btn) return 'no button';
  btn.click();
  await new Promise(r => setTimeout(r, 5000));
  return 'clicked: ' + btn.innerText.trim();
})()`));
await sleep(6000);

console.log('\n=== 点击后 iframe 状态 ===');
console.log(await ev(`(() => {
  const out = [];
  const collect = (doc, tag) => {
    try { [...doc.querySelectorAll('iframe')].forEach(f => out.push({ tag, id: f.id, src: (f.src||'').slice(0,150), vis: f.offsetParent !== null })); } catch(e){}
  };
  collect(document, 'top');
  const f = document.getElementById('iframe');
  if (f && f.contentDocument) collect(f.contentDocument, 'cards');
  return JSON.stringify(out, null, 1);
})()`));

console.log('\n=== 捕获到的 work 请求 ===');
for (const n of net.slice(-15)) console.log(`  ${n.m} ${n.u}\n     ${n.body}`);

fs.writeFileSync(path.join(ROOT, 'log', 'quiz_net.json'), JSON.stringify(net, null, 2), 'utf8');
const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'quiz_page.png'), Buffer.from(shot.data, 'base64'));
console.log('\n截图 -> log/quiz_page.png');
await sleep(120000);
try { proc.kill(); } catch {}
