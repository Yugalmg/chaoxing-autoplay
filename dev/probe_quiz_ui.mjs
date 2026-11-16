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

const initUrl = `https://mooc1.chaoxing.com/mooc-ans/richvideo/initdatawithviewerV2?mid=${mid}&cpi=${c.cpi}&classid=${c.clazzid}&courseid=${cid}&ut=s`;
const quizData = JSON.parse(await httpGet(initUrl, 'https://mooc1.chaoxing.com/'));
const q = quizData?.[0]?.datas?.[0];
console.log(`目标视频: ${v.property?.name} (${v.attDuration}s)`);
console.log(`弹题触发点: ${q?.startTime}s  题型: ${q?.questionType}`);
console.log(`题干: ${q?.description}`);

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: false,
  extraArgs: ['--window-position=-10000,-10000', '--window-size=1280,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
await cdp.send('Storage.setCookies', {
  cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(15000);

const ev = async (expr, t = 60000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

// 预加载 blob 并 seek 到弹题前 20 秒
console.log('\n=== 预加载并定位到弹题前 ===');
console.log(await ev(`(async () => {
  const cd = document.getElementById('iframe').contentDocument;
  let f = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || y.src || '').includes('${OBJ}')) f = x; } catch (e) {}
  });
  if (!f) return 'no frame';
  window.__pf = f;
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const srcUrl = v.currentSrc || v.src;
  const resp = await w.fetch(srcUrl, { credentials: 'omit' });
  const blob = await resp.blob();
  const burl = w.URL.createObjectURL(blob);
  const p = w.videojs.getPlayer('video');
  p.src({ src: burl, type: 'video/mp4' });
  let d = 0;
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 500)); try { d = p.duration() || 0; } catch (e) {} if (d > 0) break; }
  return JSON.stringify({ mb: +(blob.size / 1048576).toFixed(1), dur: Math.round(d) });
})()`, 180000));

console.log('\n=== seek 到 ' + (q.startTime - 25) + 's 并播放 ===');
console.log(await ev(`(async () => {
  const p = window.__pf.contentWindow.videojs.getPlayer('video');
  p.currentTime(${q.startTime - 25});
  await new Promise(r => setTimeout(r, 1500));
  try { await p.play(); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ cur: +p.currentTime().toFixed(1), paused: p.paused() });
})()`, 60000));

// 观察弹窗
for (let i = 1; i <= 14; i++) {
  await sleep(5000);
  const st = await ev(`(() => {
    const p = window.__pf.contentWindow.videojs.getPlayer('video');
    const w = window.__pf.contentWindow;
    const d = w.document;
    // 找可能的弹层
    const cands = [...d.querySelectorAll('div,iframe')].filter(el => {
      const s = (el.className || '') + ' ' + (el.id || '');
      return /quiz|question|popup|answer|dialog|mask|layer/i.test(s);
    }).map(el => ({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), visible: el.offsetParent !== null }));
    return JSON.stringify({
      cur: +p.currentTime().toFixed(1), paused: p.paused(),
      popups: cands.slice(0, 8),
      bodyText: d.body ? d.body.innerText.replace(/\\s+/g, ' ').slice(0, 200) : ''
    });
  })()`, 25000);
  console.log(`[+${i * 5}s] ${st}`);
  if (st && st.includes('"paused":true') && st.includes('quiz')) { console.log('  ^ 可能已弹出'); }
}

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
fs.writeFileSync(path.join(ROOT, 'log', 'quiz_popup.png'), Buffer.from(shot.data, 'base64'));
console.log('\n截图 -> log/quiz_popup.png');
try { proc.kill(); } catch {}
