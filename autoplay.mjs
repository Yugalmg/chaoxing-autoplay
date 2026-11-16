#!/usr/bin/env node
/**
 * 学习通视频代挂 · 独立运行版
 *
 * 用法:
 *   node autoplay.mjs --course "劳动教育理论"              # 选定课程开刷
 *   node autoplay.mjs --course "劳动教育理论" --dry        # 只列计划不播放
 *   node autoplay.mjs --course "劳动教育理论" --max-hours 8 # 限时（默认 8）
 *   node autoplay.mjs --list                              # 列出所有课程进度
 *
 * 设计要点（来自实测踩坑）:
 *   1. 视频必须在视口内才会加载 → 播放前一律 scrollIntoView
 *   2. 直接 video.play() 会被播放器拦截 → 走 videojs.getPlayer('video').play()
 *   3. 播放器在服务端记录的进度处有锁 → 停滞时用大跨度 seek 解锁
 *   4. 同一页面只能有一个驱动者 → 单实例锁，杜绝多进程互踩
 *   5. 完成判定以服务端为准，不信 DOM
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, getCookieHeader, sleep, httpGet, extractJsonObject, readJson, writeJson, findBrowser } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const EXE = findBrowser();
const LOCK = path.join(ROOT, 'state', '.lock');
const PROGRESS = 'state/progress.json';

// ── 参数 ───────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const has = (k) => argv.includes(k);

const COURSE_NAME = arg('--course');
const DRY = has('--dry');
const MAX_HOURS = Number(arg('--max-hours', 8));

const logFile = fs.createWriteStream(path.join(ROOT, 'log', 'autoplay.log'), { flags: 'a' });
const log = (m) => {
  const l = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`;
  console.log(l); logFile.write(l + '\n');
};

// ── 单实例锁 ───────────────────────────────────────────
function acquireLock() {
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
    if (pid) {
      try { process.kill(pid, 0); console.error(`已有实例在运行 (pid ${pid})，退出`); process.exit(1); }
      catch { /* 进程已死，接管 */ }
    }
  }
  fs.writeFileSync(LOCK, String(process.pid));
  const release = () => { try { fs.unlinkSync(LOCK); } catch {} };
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(0); });
}

// ── 数据 ───────────────────────────────────────────────
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));

if (has('--list')) {
  for (const [cid, c] of Object.entries(index)) {
    const vids = c.jobs.filter(j => j.type === 'video');
    const done = vids.filter(j => j.passed).length;
    const secs = vids.filter(j => !j.passed).reduce((a, j) => a + j.duration, 0);
    console.log(`${c.course.padEnd(28)} ${String(done).padStart(3)}/${String(vids.length).padStart(3)} 已过  待看 ${(secs / 3600).toFixed(1)}h`);
  }
  process.exit(0);
}

const KEY = Object.keys(index).find(k => index[k].course.includes(COURSE_NAME || ''));
if (!KEY) { console.error(`未找到课程: ${COURSE_NAME}\n用 --list 查看`); process.exit(1); }
const course = index[KEY];
const CID = KEY;

const progress = readJson(PROGRESS, { done: [] });
const doneSet = new Set(progress.done);
const keyOf = (j) => `${CID}:${j.objectId}`;

// 启动前先刷新服务端真实状态（jobs_index 可能是旧快照）
log('刷新服务端状态...');
const scanKids = [...new Set(course.jobs.filter(j => j.type === 'video' && j.objectId).map(j => j.kid))];
const svMap = await serverJobs(scanKids);
log(`服务端确认已通过 ${[...svMap.values()].filter(v => v.passed).length} 个视频`);

// 待处理视频，按章节分组
const byChapter = new Map();
for (const j of course.jobs) {
  if (j.type !== 'video' || !j.objectId) continue;
  if (j.passed || doneSet.has(keyOf(j))) continue;
  if (svMap.get(j.objectId)?.passed) { doneSet.add(keyOf(j)); continue; }
  if (!byChapter.has(j.kid)) byChapter.set(j.kid, { no: j.no, title: j.chapter, jobs: [] });
  byChapter.get(j.kid).jobs.push(j);
}
const chapters = [...byChapter.entries()];
const totalVids = chapters.reduce((a, [, c]) => a + c.jobs.length, 0);
const totalSecs = chapters.reduce((a, [, c]) => a + c.jobs.reduce((s, j) => s + j.duration, 0), 0);

log('════════════════════════════════════════');
log(`课程: ${course.course}`);
log(`待刷: ${chapters.length} 章 / ${totalVids} 个视频 / ${(totalSecs / 3600).toFixed(1)} 小时素材`);
log(`预计耗时: 约 ${((totalSecs / 1.5) / 3600).toFixed(1)} 小时（1.5x）`);
log('════════════════════════════════════════');

if (DRY) { for (const [, c] of chapters) log(`  ${c.no} ${c.title} — ${c.jobs.length} 个`); process.exit(0); }
if (!totalVids) { log('没有待刷视频，退出'); process.exit(0); }

acquireLock();

// ── 服务端状态（唯一可信来源）─────────────────────────────
async function serverJobs(kids) {
  const out = new Map();
  for (const kid of kids) {
    // 依次尝试 num=0/1/2：视频可能不在默认 tab 里（学习目标章节尤其如此）
    for (const num of [0, 1, 2]) {
      const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${course.clazzid}&courseid=${CID}&knowledgeid=${kid}&num=${num}&ut=s&cpi=${course.cpi}&v=2025`;
      try {
        const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${course.clazzid}`);
        const raw = extractJsonObject(html, 'mArg');
        if (!raw) continue;
        const mArg = JSON.parse(raw);
        const vids = (mArg.attachments || []).filter(a => a.type === 'video' && a.objectId);
        if (!vids.length) continue;
        for (const a of vids) {
          const _pt = (a.playTime || 0) / 1000, _dur = a.attDuration || 0;
          const _done = !!a.isPassed || Number(a.property && a.property.ywbf) === 1 || (_dur > 0 && _pt >= _dur - 1);
          out.set(a.objectId, { passed: _done, playTime: _pt, dur: _dur });
        }
        break;
      } catch {}
      await sleep(200);
    }
    await sleep(400);
  }
  return out;
}

// ── 浏览器 ─────────────────────────────────────────────
let cdp, proc, page;

async function boot() {
  try { proc?.kill(); } catch {}
  ({ cdp, proc } = await launchBrowser({
    exe: EXE, port: 9333, headless: false,
    extraArgs: ['--window-position=-10000,-10000', '--window-size=1280,900', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  }));
  await cdp.send('Storage.setCookies', {
    cookies: getCookies().map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
  });
  page = await newPage(cdp);
  try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}
}

async function ev(expr, timeout = 20000) {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, timeout);
    if (r.exceptionDetails) return null;
    return r.result?.value ?? null;
  } catch { return null; }
}

const nav = async (kid) => {
  const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${course.clazzid}&cpi=${course.cpi}&enc=${course.enc}&mooc2=1`;
  try { await cdp.send('Page.navigate', { url }, page.sessionId, 30000); } catch {}
  await sleep(13000);
  // 章节可能存在多个 tab（学习目标 / 视频 / 章节测验），默认不一定停在视频，
  // 必须按标题切到「视频」，否则拿不到播放器。各课程 tab 编号不一致，不能写死 id。
  try {
    const r = await ev(`(async () => {
      const tabs = [...document.querySelectorAll('[id^="dct"]')];
      if (!tabs.length) return 'no-tabs';
      const vt = tabs.find(e => /视频/.test(e.title || e.innerText || ''));
      if (!vt) return 'no-video-tab';
      if (String(vt.className).includes('active')) return 'already';
      vt.click();
      return 'switched';
    })()`, 15000);
    if (r === 'switched') await sleep(11000);
  } catch {}
};

// ① 预加载：滚动到位 → fetch 全量 → blob → 切给播放器（实测唯一稳定路径）
const PREP = (obj, startAt) => `(async () => {
  const cards = document.getElementById('iframe');
  if (!cards) return JSON.stringify({ ok:false, why:'no cards' });
  const cd = cards.contentDocument;
  let f = null;
  [...cd.querySelectorAll('iframe')].forEach(x => {
    try { const y = x.contentWindow.document.querySelector('video');
      if (y && (y.currentSrc || '').includes('${obj}')) f = x; } catch (e) {}
  });
  if (!f) return JSON.stringify({ ok:false, why:'no iframe' });
  window.__pf = f;
  try { f.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
  const w = f.contentWindow;
  const v = w.document.querySelector('video');
  const url = v.currentSrc || v.src;
  if (!url) return JSON.stringify({ ok:false, why:'no src' });
  let resp;
  try { resp = await w.fetch(url, { credentials: 'omit' }); }
  catch (e) { return JSON.stringify({ ok:false, why:'fetch: ' + e.message.slice(0, 60) }); }
  if (!resp.ok) return JSON.stringify({ ok:false, why:'http ' + resp.status });
  // ── blob 加载全链路加保护：任何一步失败都返回具体原因，不再被吞成 timeout ──
  let blob;
  try { blob = await resp.blob(); }
  catch (e) { return JSON.stringify({ ok:false, why: "blob失败: " + (e && e.name) + " " + String(e && e.message || "").slice(0, 50) }); }

  let burl;
  try { burl = w.URL.createObjectURL(blob); }
  catch (e) { return JSON.stringify({ ok:false, why: "createURL失败: " + String(e && e.message || "").slice(0, 50) }); }

  let p = null;
  try {
    for (let i = 0; i < 10; i++) {
      if (w.videojs) { p = w.videojs.getPlayer("video"); if (p) break; }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {}
  if (!p) return JSON.stringify({ ok:false, why: (w.videojs ? "player为null" : "videojs未加载") });

  try { p.src({ src: burl, type: "video/mp4" }); }
  catch (e) { return JSON.stringify({ ok:false, why: "p.src失败: " + String(e && e.message || "").slice(0, 50) }); }
  let d = 0; const marks = [];
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try { d = p.duration() || 0; } catch (e) { marks.push("exc"); }
    if (i < 5 || d > 0) marks.push(i + ":" + Math.round(d));
    if (d > 0) break;
  }
  // 关键：blob 换源会把 currentTime 归零，必须跳回服务端已记录进度，
  // 否则从头重播会覆盖已有进度（曾把 2115s 冲成 0）
  if (${startAt} > 2 && d > 2) {
    try { p.currentTime(Math.min(${startAt}, d - 2)); } catch (e) {}
    await new Promise(r => setTimeout(r, 1200));
  }
  await new Promise(r => setTimeout(r, 1500));

  // blob 解码不可用（大文件/非常规编码）时回退到播放器原生源
  let mode = "blob";
  try {
    const vv = f.contentWindow.document.querySelector("video");
    if (vv && vv.readyState < 2) {
      mode = "native-fallback";
      p.src({ src: url, type: "" });
      // p.src() 会重建 video 元素，必须每轮重新查询，不能沿用旧引用
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 500));
        const cur = f.contentWindow.document.querySelector("video");
        if (cur && cur.readyState >= 2) { try { await p.play(); } catch (e) {} break; }
      }
    }
  } catch (e) {}

  const vv2 = f.contentWindow.document.querySelector("video");
  const rs = vv2 ? vv2.readyState : -1;
  return JSON.stringify({ ok:true, mode, rs, marks: marks.slice(0,8), mb: +(blob.size / 1048576).toFixed(1), dur: Math.round(d),
    cur: +(p.currentTime() || 0).toFixed(1), paused: p.paused() });
})()`;

// ② 驱动：解锁（大跨度 seek）+ 播放 + 保持倍速
const DRIVE = (obj, unlockTo) => `(async () => {
  const f = window.__pf;
  if (!f) return JSON.stringify({ ok:false, why:'no frame' });
  let p;
  try { p = f.contentWindow.videojs.getPlayer('video'); } catch (e) { return JSON.stringify({ ok:false, why:'no player' }); }
  if (!p) return JSON.stringify({ ok:false, why:'null player' });

  let cur = 0, dur = 0;
  try { cur = p.currentTime(); } catch (e) {}
  try { dur = p.duration() || 0; } catch (e) {}

  let action = 'idle';
  // 重要：学习通上报的 playingTime 是「累计播放时长」，不是播放位置。
  // 任何 seek 都会让累计清零（seeking 到 90% 再播，只累计剩下的 10%）。
  // 因此这里绝不 seek：PREP 已把位置恢复到服务端进度，往下自然播放即可累积到满。
  let curBefore = 0;
  try { curBefore = p.currentTime(); } catch (e) {}
  if (p.paused()) {
    try { const pr = p.play(); if (pr && pr.catch) await pr; action += '+play'; }
    catch (e) { action += '+playerr:' + e.name; }
  }
  // 倍速暂不设置：先确认能起播（怀疑 playbackRate 会打断播放）
  // if (Math.abs((p.playbackRate ? p.playbackRate() : 1) - 1.5) > 0.05) { try { p.playbackRate(1.5); } catch (e) {} }

  // ── 倍速（仅播放器允许时）──
  let speed = 1;
  try {
    const rates = p.options_ && p.options_.playbackRates;
    if (Array.isArray(rates) && rates.length) {
      let want = 1;
      for (const r of rates) { if (r <= 1.5 && r > want) want = r; }
      if (want > 1) {
        const cr = p.playbackRate ? p.playbackRate() : 1;
        if (Math.abs(cr - want) > 0.01) { try { p.playbackRate(want); } catch (e) {} }
        speed = want;
      }
    }
  } catch (e) {}
  // ── 中途弹题处理 ──
    // 结构: li.ans-videoquiz-opt(选项) / #videoquiz-submit(提交) / #spanHas(答对) / #spanNot(答错) / #videoquiz-continue(继续)
    let quiz = '';
    try {
      const qd = f.contentWindow.document;
      for (let round = 0; round < 5; round++) {
        const sub = qd.querySelector('#videoquiz-submit');
        if (!sub || sub.offsetParent === null) break;
        const opts = [...qd.querySelectorAll('li.ans-videoquiz-opt')];
        if (!opts.length) break;
        const pick = opts[round % opts.length];
        const radio = pick.querySelector('input[type=radio]');
        if (radio) { radio.click(); } else { const lb = pick.querySelector('label'); if (lb) lb.click(); }
        await new Promise(r => setTimeout(r, 500));
        sub.click();
        await new Promise(r => setTimeout(r, 2600));
        const okEl = qd.querySelector('#spanHas');
        if (okEl && okEl.offsetParent !== null) {
          const cont = qd.querySelector('#videoquiz-continue');
          if (cont) cont.click();
          quiz = 'ok@' + round;
          break;
        }
        quiz = 'retry@' + round;
      }
      if (quiz) { action += '+quiz(' + quiz + ')'; try { await p.play(); } catch (e) {} }
    } catch (e) { quiz = 'err'; }

    // 播完前主动暂停：播放器会自动重播，重播会覆盖服务端已记录进度
    let ended = false;
    try {
      const vEl = f.contentWindow.document.querySelector("video");
      if (vEl) {
        if (!vEl.__xxtEndHook) {
          vEl.__xxtEndHook = true;
          vEl.addEventListener("ended", () => {
            // 只处理一次，避免补报后再次 ended 造成递归
            if (f.contentWindow.__xxtEndedAt) return;
            f.contentWindow.__xxtEndedAt = Date.now();
            // 播完后补一次「满额上报」：seek 回末尾再播 2 秒，
            // 让最后一个 60 秒周期带上 100% 的 playingTime
            try {
              const dd2 = p.duration();
              if (dd2 > 2) {
                p.currentTime(dd2 - 1);
                setTimeout(() => { try { p.play(); } catch (e) {} }, 200);
                setTimeout(() => { try { p.pause(); } catch (e) {} }, 2600);
                return;
              }
            } catch (e) {}
            try { p.pause(); } catch (e) {}
          });
        }
        // 播到真正结尾才停（ended 钩子负责 pause 防重播），不再提前 3 秒截断
        if (ended && dd > 0) {
          try { if (p.currentTime() < dd - 0.3) p.currentTime(dd - 0.05); } catch (e) {}
        }
        ended = !!vEl.ended || !!f.contentWindow.__xxtEndedAt;
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 2500));
    try { cur = p.currentTime(); } catch (e) {}
    return JSON.stringify({ ok:true, action, quiz, speed, ended, cur:+cur.toFixed(1), dur:Math.round(dur), paused:p.paused(), rate:p.playbackRate() });
})()`;

// ── 主流程 ─────────────────────────────────────────────
const deadline = Date.now() + MAX_HOURS * 3600 * 1000;
let ok = 0, fail = 0;

await boot();
log('浏览器已就绪，开始');

try {
  for (const [kid, ch] of chapters) {
    if (Date.now() > deadline) { log('到达时间上限，收工'); break; }
    log(`\n── ${ch.no} ${ch.title}  (${ch.jobs.length} 个视频) ──`);
    await nav(kid);

    for (const job of ch.jobs) {
      if (Date.now() > deadline) break;
      const label = `${job.name.slice(0, 34)} (${job.duration}s)`;
      log(`  ▶ ${label}`);
      // 每个视频前重开浏览器 + 重新导航：保证播放器实例干净（实测 diag4 单次成功、循环复用失败）
      await boot();
      await nav(kid);

      // 预加载为 blob（实测唯一稳定路径）
      // 传入服务端已记录的播放进度，blob 换源后跳回该位置，避免覆盖
      const svInfo = svMap.get(job.objectId);
      const startAt = svInfo && svInfo.playTime ? Math.round(svInfo.playTime) : 0;
      const prepRaw = await ev(PREP(job.objectId, startAt), 180000);
      let prep = null; try { prep = prepRaw ? JSON.parse(prepRaw) : null; } catch {}
      if (!prep?.ok) { log(`    ✗ 预加载失败: ${prep?.why || 'timeout'}`); fail++; await sleep(2500); continue; }
      log(`    预加载 ${prep.mb}MB dur=${prep.dur} 服务端进度=${startAt}s cur=${prep.cur} mode=${prep.mode || "?"} rs=${prep.rs ?? "?"}`);

      let lastCur = -1, stall = 0, finished = false;
      let r = await ev(DRIVE(job.objectId, -1), 45000);
      let st = r ? JSON.parse(r) : null;
      if (!st?.ok) { log(`    ✗ 驱动失败: ${JSON.stringify(st)}`); fail++; await sleep(2000); continue; }
      log(`    首驱: ${JSON.stringify(st)}`);

      // 实际以 1.0x 播放，预算按真实时长算，留 40% 余量
      const budget = job.duration * 1000 * 1.4 + 300000;
      const until = Date.now() + budget;

      let tick = 0;
      while (Date.now() < until) {
        await sleep(9000);
        tick++;
        // 每约 60 秒查一次服务端：播放器播完会自动重播，不能只靠 DOM 判终点
        if (tick % 7 === 0) {
          const sv0 = await serverJobs([job.kid]).then(m => m.get(job.objectId)).catch(() => null);
          if (sv0?.passed) { finished = true; log(`    ✓ 服务端已判定通过 ${sv0.playTime.toFixed(0)}/${sv0.dur}s`); break; }
        }
        // 停滞时再次大跨度 seek 解锁
        const unlockTo = stall >= 2 ? Math.min(job.duration - 3, (st?.cur || 0) + 200) : 0;
        r = await ev(DRIVE(job.objectId, unlockTo), 30000);
        st = r ? JSON.parse(r) : null;

        if (!st?.ok) { if (++stall >= 12) break; continue; }
        if (st.ended || (st.dur && st.cur >= st.dur - 0.5)) { try { await ev(`(()=>{const p=window.__pf.contentWindow.videojs.getPlayer("video");p.pause();return "1";})()`, 8000); } catch {} finished = true; break; }
        if (Math.abs(st.cur - lastCur) < 0.8) stall++; else { stall = 0; lastCur = st.cur; }
        if (stall > 0 && stall % 4 === 0) log(`    停滞 ${stall} 次 (cur=${st.cur}) → seek 解锁`);
        if (stall >= 14) { log('    长时间无法推进，跳过'); break; }
      }

      // 以服务端为准复核（上报有延迟：播完等更久，未过再重查两次）
      await sleep(25000);
      let sv = await serverJobs([job.kid]).then(m => m.get(job.objectId)).catch(() => null);
      if (sv && !sv.passed && finished) {
        await sleep(20000);
        sv = (await serverJobs([job.kid]).then(m => m.get(job.objectId)).catch(() => null)) || sv;
      }
      if (sv?.passed) {
        ok++; doneSet.add(keyOf(job));
        writeJson(PROGRESS, { done: [...doneSet], updated: Date.now() });
        log(`    ✓ 通过  ${sv.playTime.toFixed(0)}/${sv.dur}s`);
      } else if (finished) {
        log(`    ~ DOM 已到片尾，服务端 ${sv ? sv.playTime.toFixed(0) + 's' : '未知'}，下轮再验`);
      } else {
        fail++; log(`    ✗ 未通过（服务端 ${sv ? sv.playTime.toFixed(0) + '/' + sv.dur + 's' : '?'}）`);
      }
      await sleep(1500);
    }
  }
} catch (e) {
  log(`!! 中断: ${e.message}`);
} finally {
  log(`\n════ 结束: 通过 ${ok} / 未过 ${fail} ════`);
  logFile.end();
  try { proc?.kill(); } catch {}
  try { fs.unlinkSync(LOCK); } catch {}
  process.exit(0);
}
