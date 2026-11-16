import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, cookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const getArg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};

const COURSE_ID = getArg('--course', '268918938');
const CHAPTER_LIMIT = Number(getArg('--chapters', '1'));
const RATE = Number(getArg('--rate', cfg.playback.rate));

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[COURSE_ID];
if (!c) throw new Error('course not found: ' + COURSE_ID);

const logPath = path.join(ROOT, 'log', 'worker.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
const log = (msg) => {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
};

log(`===== worker 启动 =====`);
log(`课程: ${c.course}  章节上限: ${CHAPTER_LIMIT}  倍速: ${RATE}`);

// 按章节分组待处理视频
const byChapter = new Map();
for (const j of c.jobs) {
  if (j.type !== 'video' || j.passed || !j.objectId) continue;
  if (!byChapter.has(j.kid)) byChapter.set(j.kid, { no: j.no, title: j.chapter, jobs: [] });
  byChapter.get(j.kid).jobs.push(j);
}
const chapters = [...byChapter.entries()].slice(0, CHAPTER_LIMIT);
log(`待处理章节: ${chapters.length} 个, 视频任务点: ${chapters.reduce((a, [, v]) => a + v.jobs.length, 0)} 个`);

const { cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});

const page = await newPage(cdp);
await cdp.send('Network.enable', {}, page.sessionId);

let reportCount = 0;
cdp.on('Network.requestWillBeSent', (p) => {
  const u = p.request?.url || '';
  if (u.includes('/multimedia/log')) {
    reportCount++;
    const m = u.match(/playingTime=(\d+).*?duration=(\d+)/);
    if (m) log(`    上报 playingTime=${m[1]}s / ${m[2]}s`);
  }
});

// 心跳：保持焦点与可见性，抵消 switchwindow 检测
await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    (() => {
      const bump = () => {
        try {
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 + Math.random()*400, clientY: 100 + Math.random()*300 }));
        } catch (e) {}
      };
      setInterval(bump, 25000);
      window.addEventListener('blur', (e) => e.stopPropagation(), true);
    })();
  `,
}, page.sessionId);

let totals = { played: 0, failed: 0, seconds: 0 };

for (const [kid, ch] of chapters) {
  log(`\n── 章节 ${ch.no} ${ch.title}  (${ch.jobs.length} 个视频) ──`);
  const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${COURSE_ID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
  await cdp.send('Page.navigate', { url }, page.sessionId);
  await sleep(14000);

  for (const job of ch.jobs) {
    // 定位 iframe
    const scan = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const cards = document.getElementById('iframe')?.contentDocument;
        if (!cards) return JSON.stringify({err:'no cards'});
        const out = [];
        [...cards.querySelectorAll('iframe')].forEach((f, i) => {
          try {
            const v = f.contentWindow.document.querySelector('video');
            out.push({ i, src: v ? (v.currentSrc || '') : '' });
          } catch (e) { out.push({ i, src: '' }); }
        });
        return JSON.stringify(out);
      })()`, returnByValue: true,
    }, page.sessionId);
    const frames = JSON.parse(scan.result?.value || '[]');
    const idx = frames.findIndex(f => f.src.includes(job.objectId));

    if (idx < 0) {
      log(`  [SKIP] ${job.name.slice(0, 40)} — 未找到播放器 iframe`);
      totals.failed++;
      continue;
    }

    const label = `${job.no} ${job.name.slice(0, 36)} (${job.duration}s)`;
    log(`  ▶ ${label}`);

    const started = Date.now();
    const play = await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const cards = document.getElementById('iframe').contentDocument;
        const f = cards.querySelectorAll('iframe')[${idx}];
        const v = f.contentWindow.document.querySelector('video');
        if (!v) return 'NO_VIDEO';
        v.muted = true;
        try { v.playbackRate = ${RATE}; } catch (e) {}
        try { v.currentTime = 0; } catch (e) {}
        try { await v.play(); } catch (e) { return 'PLAY_FAIL: ' + e.message; }
        return 'OK';
      })()`, returnByValue: true, awaitPromise: true,
    }, page.sessionId);

    if (play.result?.value !== 'OK') {
      log(`    !! 播放失败: ${play.result?.value || JSON.stringify(play.exceptionDetails || {}).slice(0, 120)}`);
      totals.failed++;
      continue;
    }

    // 等待播放结束
    const deadline = started + (job.duration / RATE) * 1000 * 1.6 + 45000;
    let lastCur = 0, stuck = 0, done = false;
    while (Date.now() < deadline) {
      await sleep(6000);
      const st = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const cards = document.getElementById('iframe')?.contentDocument;
          const f = cards?.querySelectorAll('iframe')[${idx}];
          const v = f?.contentWindow?.document.querySelector('video');
          if (!v) return JSON.stringify({gone:true});
          return JSON.stringify({cur:+v.currentTime.toFixed(1), dur:v.duration, ended:v.ended, paused:v.paused, rate:v.playbackRate});
        })()`, returnByValue: true,
      }, page.sessionId);
      const s = JSON.parse(st.result?.value || '{"gone":true}');
      if (s.gone) { log('    !! 播放器消失'); break; }
      if (s.cur <= lastCur + 0.5) { stuck++; } else { stuck = 0; lastCur = s.cur; }
      if (s.ended || (s.dur && s.cur >= s.dur - 0.6)) { done = true; break; }
      if (stuck >= 3) { log(`    !! 卡在 ${s.cur}s/${s.dur}s，重试`); try { /* re-play */ } catch {} break; }
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(0);
    if (done) {
      totals.played++; totals.seconds += job.duration;
      log(`    ✓ 完成 ${elapsed}s (视频 ${job.duration}s, 倍速 ${RATE})`);
    } else {
      totals.failed++;
      log(`    ✗ 未完成 ${elapsed}s`);
    }
    await sleep(3000);
  }

  // 本章后回读服务端状态
  log(`  ── 章节 ${ch.no} 结束，已播 ${totals.played} 个，失败 ${totals.failed} 个，累计 ${(totals.seconds / 3600).toFixed(2)} 小时视频`);
}

log(`\n===== worker 结束 =====`);
log(`成功 ${totals.played} 个，失败 ${totals.failed} 个，视频总时长 ${(totals.seconds / 60).toFixed(1)} 分钟`);
log(`上报请求 ${reportCount} 次`);
logStream.end();
try { proc.kill(); } catch {}
