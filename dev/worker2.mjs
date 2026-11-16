import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, cookies, sleep, readJson, writeJson } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const COURSE_ID = getArg('--course', '268918938');
const CHAPTER_LIMIT = Number(getArg('--chapters', '999'));
const RATE = Number(getArg('--rate', cfg.playback.rate));
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[COURSE_ID];
if (!c) throw new Error('course not found');

const progress = readJson('state/progress.json', { done: [] });
const doneSet = new Set(progress.done);

const logPath = path.join(ROOT, 'log', 'worker.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
const log = (m) => { const l = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`; console.log(l); logStream.write(l + '\n'); };

const keyOf = (j) => `${COURSE_ID}:${j.objectId}`;

const byChapter = new Map();
for (const j of c.jobs) {
  if (j.type !== 'video' || j.passed || !j.objectId) continue;
  if (doneSet.has(keyOf(j))) continue;
  if (!byChapter.has(j.kid)) byChapter.set(j.kid, { no: j.no, title: j.chapter, jobs: [] });
  byChapter.get(j.kid).jobs.push(j);
}
const chapters0 = [...byChapter.entries()].slice(0, CHAPTER_LIMIT);
const KID = getArg('--kid', '');
const chapters = KID ? chapters0.filter(([k]) => k === KID) : chapters0;
const totalJobs = chapters.reduce((a, [, v]) => a + v.jobs.length, 0);

log(`===== worker2 启动 =====`);
log(`课程 ${c.course} | 章节 ${chapters.length} | 视频 ${totalJobs} | 倍速 ${RATE} | 断点已完成 ${doneSet.size}`);

let cdp, proc, page, reportMax = 0, reportDur = 0;

async function safeEval(expr, timeout = 15000, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      return await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, timeout);
    } catch (e) {
      if (i === retries - 1) return { __err: e.message };
      await sleep(1200);
    }
  }
}

async function boot() {
  ({ cdp, proc } = await launchBrowser({ exe: EXE, port: 9333, headless: true }));
  await cdp.send('Storage.setCookies', {
    cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
  });
  page = await newPage(cdp);
  await cdp.send('Network.enable', {}, page.sessionId);
  cdp.on('Network.requestWillBeSent', (p) => {
    const u = p.request?.url || '';
    if (!u.includes('/multimedia/log')) return;
    const m = u.match(/playingTime=(\d+)/), d = u.match(/duration=(\d+)/);
    if (m && d) {
      const pt = +m[1], dur = +d[1];
      if (dur !== reportDur) { reportDur = dur; reportMax = 0; }
      reportMax = Math.max(reportMax, pt);
    }
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(()=>{const b=()=>{try{document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:80+Math.random()*500,clientY:80+Math.random()*400}))}catch(e){}};setInterval(b,25000);window.addEventListener('blur',e=>e.stopPropagation(),true);})();`,
  }, page.sessionId);
}

async function scanFrames() {
  const r = await safeEval(`(() => {
    const cards = document.getElementById('iframe')?.contentDocument;
    if (!cards) return JSON.stringify([]);
    return JSON.stringify([...cards.querySelectorAll('iframe')].map((f,i)=>{
      try { const v=f.contentWindow.document.querySelector('video'); return {i, src: v?(v.currentSrc||''):''}; }
      catch(e){ return {i, src:''}; }
    }));
  })()`);
  if (r.__err) return null;
  try { return JSON.parse(r.result?.value || '[]'); } catch { return null; }
}

await boot();
let ok = 0, fail = 0, secs = 0;

try {
  for (const [kid, ch] of chapters) {
    log(`\n── ${ch.no} ${ch.title}  (${ch.jobs.length} 视频) ──`);
    const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${COURSE_ID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
    await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
    await sleep(14000);

    for (const job of ch.jobs) {
      const label = `${job.name.slice(0, 34)} (${job.duration}s)`;
      let frames = await scanFrames();
      if (!frames) { log('  !! 页面扫描失败，重载'); await cdp.send('Page.navigate', { url }, page.sessionId, 30000); await sleep(14000); frames = await scanFrames(); }
      if (!frames) { log('  !! 跳过（页面不可用）'); fail++; continue; }

      const idx = frames.findIndex(f => f.src.includes(job.objectId));
      if (idx < 0) { log(`  [SKIP] ${label} 未找到播放器`); fail++; continue; }

      log(`  ▶ ${label}`);
      reportMax = 0; reportDur = 0;

      const started = Date.now();
      const play = await safeEval(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const cards = document.getElementById('iframe').contentDocument;
        const f = cards.querySelectorAll('iframe')[${idx}];
        const d = f.contentWindow.document;
        const v = d.querySelector('video');
        if (!v) return 'NO_VIDEO';
        v.muted = true;
        for (let i = 0; i < 6; i++) {
          try { v.playbackRate = ${RATE}; } catch (e) {}
          try { await v.play(); } catch (e) {}
          await sleep(1200);
          if (!v.paused && v.currentTime > 0) return 'OK';
          const btn = d.querySelector('.vjs-big-play-button');
          if (btn) { try { btn.click(); } catch (e) {} await sleep(1200); if (!v.paused && v.currentTime > 0) return 'OK'; }
        }
        return 'FAIL: paused=' + v.paused + ' ready=' + v.readyState + ' err=' + (v.error ? v.error.code : '-');
      })()`, 40000);
      if (play.__err || play.result?.value !== 'OK') {
        log(`    !! 播放失败 ${play.__err || play.result?.value}`);
        fail++; continue;
      }

      const budget = Math.max((job.duration / RATE) * 1000 * 1.25, 60000);
      const deadline = started + budget + 60000;
      let finished = false, lastCur = -1, stuck = 0;

      while (Date.now() < deadline) {
        await sleep(9000);
        // 通道一：网络上报
        if (reportDur === job.duration && reportMax >= job.duration * 0.9) { finished = true; break; }
        // 通道二：DOM
        const st = await safeEval(`(() => {
          const cards = document.getElementById('iframe')?.contentDocument;
          const f = cards?.querySelectorAll('iframe')[${idx}];
          const v = f?.contentWindow?.document.querySelector('video');
          if (!v) return JSON.stringify({gone:true});
          return JSON.stringify({cur:+v.currentTime.toFixed(1), dur:v.duration, ended:v.ended});
        })()`);
        if (st.__err || !st.result?.value) { continue; }
        let s; try { s = JSON.parse(st.result.value); } catch { continue; }
        if (s.gone) { log('    !! 播放器消失'); break; }
        if (s.ended || (s.dur && s.cur >= s.dur - 0.8)) { finished = true; break; }
        if (Math.abs(s.cur - lastCur) < 1) { stuck++; if (stuck >= 4) { log(`    !! 卡在 ${s.cur}s 重试`); await safeEval(`(async()=>{const c=document.getElementById('iframe').contentDocument;const v=c.querySelectorAll('iframe')[${idx}].contentWindow.document.querySelector('video');v.muted=true;v.playbackRate=${RATE};await v.play();})()`); stuck = 0; } }
        else { stuck = 0; lastCur = s.cur; }
      }

      const el = ((Date.now() - started) / 1000).toFixed(0);
      if (finished) {
        ok++; secs += job.duration;
        doneSet.add(keyOf(job));
        writeJson('state/progress.json', { done: [...doneSet], updated: Date.now() });
        log(`    ✓ 完成 ${el}s  [累计 ${ok} 个 / ${(secs / 60).toFixed(0)} 分钟]`);
      } else {
        fail++;
        log(`    ✗ 超时未完成 ${el}s (上报 ${reportMax}/${job.duration}s)`);
      }
      await sleep(2500);
    }
  }
} catch (e) {
  log(`!! 中断: ${e.message}`);
} finally {
  log(`\n===== 结束: 成功 ${ok}, 失败 ${fail}, 视频 ${(secs / 60).toFixed(0)} 分钟 =====`);
  try { proc.kill(); } catch {}
  logStream.end();
  process.exit(0);
}
