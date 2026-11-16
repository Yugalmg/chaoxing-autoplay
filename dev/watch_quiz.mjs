/**
 * 观察弹题：真实播放到触发点，抓 DOM + 网络请求
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, sleep, httpGet, extractJsonObject } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const [cid, c] = Object.entries(index).find(([, x]) => x.course.includes('艺术哲学'));
const kid = [...new Set(c.jobs.filter(j => j.type === 'video' && !j.passed).map(j => j.kid))][0];

const cardsUrl = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html = await httpGet(cardsUrl, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
const v = (mArg.attachments || []).find(a => a.type === 'video');
const OBJ = v.objectId;
const mid = v.mid || v.property?.mid;
const quizData = JSON.parse(await httpGet(`https://mooc1.chaoxing.com/mooc-ans/richvideo/initdatawithviewerV2?mid=${mid}&cpi=${c.cpi}&classid=${c.clazzid}&courseid=${cid}&ut=s`, 'https://mooc1.chaoxing.com/'));
const q = quizData?.[0]?.datas?.[0];
const TRIGGER = q?.startTime || 1104;

console.log(`观察目标: ${v.property?.name}  弹题点 ${TRIGGER}s`);
console.log(`题目: ${q?.description}`);
console.log(`选项: ${JSON.stringify(q?.options)}`);

const logStream = fs.createWriteStream(path.join(ROOT, 'log', 'quiz_watch.log'), { flags: 'a' });
const log = (m) => { const l = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`; console.log(l); logStream.write(l + '\n'); };

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1280,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
await cdp.send('Storage.setCookies', {
  cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}
await cdp.send('Network.enable', {}, page.sessionId);

// 抓所有 quiz 相关请求
const captured = [];
cdp.on('Network.requestWillBeSent', (p) => {
  const u = p.request?.url || '';
  if (/quiz|question|validation|richvideo\/(qv|initdata)/i.test(u)) {
    captured.push({ t: Date.now(), method: p.request.method, url: u.slice(0, 300), post: (p.request.postData || '').slice(0, 500), headers: p.request.headers });
    log(`[NET] ${p.request.method} ${u.slice(0, 160)}`);
    if (p.request.postData) log(`      body: ${p.request.postData.slice(0, 300)}`);
  }
});
cdp.on('Network.responseReceived', (p) => {
  if (/quiz-validation|richvideo\/qv/i.test(p.response?.url || '')) log(`[RES] ${p.response.status} ${p.response.url.slice(0, 120)}`);
});

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const ev = async (expr, t = 20000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return null;
    return r.result?.value ?? null;
  } catch { return null; }
};

// 定位并播放
log('定位播放器…');
const st0 = await ev(`(async () => {
  const cd = document.getElementById('iframe').contentDocument;
  let f = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || y.src || '').includes('${OBJ}')) f = x; } catch (e) {}
  });
  if (!f) return 'no frame';
  window.__pf = f;
  f.scrollIntoView({ block: 'center', behavior: 'instant' });
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const srcUrl = v.currentSrc || v.src;
  const resp = await w.fetch(srcUrl, { credentials: 'omit' });
  const blob = await resp.blob();
  const burl = w.URL.createObjectURL(blob);
  const p = w.videojs.getPlayer('video');
  p.src({ src: burl, type: 'video/mp4' });
  let d = 0;
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); try { d = p.duration() || 0; } catch (e) {} if (d > 0) break; }
  await new Promise(r => setTimeout(r, 1500));
  try { p.currentTime( - 15); } catch (e) {}
  await new Promise(r => setTimeout(r, 1200));
  try { await p.play(); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ mb: +(blob.size / 1048576).toFixed(1), cur: +p.currentTime().toFixed(1), dur: Math.round(d), paused: p.paused() });
})()`, 60000);
log('初始: ' + st0);

// 轮询直到触发点
let lastDump = '';
let lastLogCur = 0;
const deadline = Date.now() + 30 * 60000;

while (Date.now() < deadline) {
  await sleep(8000);
  const s = await ev(`(() => {
    try {
      const p = window.__pf.contentWindow.videojs.getPlayer('video');
      const w = window.__pf.contentWindow;
      const d = w.document;
      const cur = +p.currentTime().toFixed(1);
      // 找弹窗
      const sus = [...d.querySelectorAll('div')].filter(el => {
        const t = (el.innerText || '');
        return el.offsetParent !== null && /判断|单选|多选|正确答案|请回答|答题|对\\b|错\\b/.test(t) && t.length < 600 && el.children.length < 40;
      }).slice(0, 3).map(el => ({ cls: String(el.className).slice(0, 80), id: el.id, text: (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 300) }));
      return JSON.stringify({ cur, paused: p.paused(), sus });
    } catch (e) { return null; }
  })()`, 15000);
  if (!s) continue;
  let o; try { o = JSON.parse(s); } catch { continue; }

  if (o.cur - lastLogCur > 120) { log(`  cur=${o.cur}s paused=${o.paused}`); lastLogCur = o.cur; }

  if (o.sus && o.sus.length) {
    const key = JSON.stringify(o.sus);
    if (key !== lastDump) {
      log('！！！发现疑似弹窗');
      log(JSON.stringify(o.sus, null, 1));
      lastDump = key;
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      fs.writeFileSync(path.join(ROOT, 'log', 'quiz_found.png'), Buffer.from(shot.data, 'base64'));
      log('截图 -> log/quiz_found.png');
      // 抓完整 HTML
      const html = await ev(`(() => {
        const d = window.__pf.contentWindow.document;
        return d.body.innerHTML.slice(0, 60000);
      })()`);
      if (html) fs.writeFileSync(path.join(ROOT, 'log', 'quiz_dom.html'), html, 'utf8');
      log('DOM -> log/quiz_dom.html');
      break;
    }
  }
  if (o.cur >= TRIGGER + 30) { log('已过触发点仍未捕获弹窗'); break; }
}

log('=== 捕获的 quiz 相关请求 ===');
for (const r of captured) log(`${r.method} ${r.url.slice(0, 200)} | ${r.post.slice(0, 200)}`);
fs.writeFileSync(path.join(ROOT, 'log', 'quiz_requests.json'), JSON.stringify(captured, null, 2), 'utf8');

try { proc.kill(); } catch {}
logStream.end();
process.exit(0);
