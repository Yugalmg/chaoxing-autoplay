/**
 * 刷课守护进程 — 零 token 自检自愈
 *
 * 每 3 分钟检查一次：
 *   1. autoplay 进程是否存活 → 挂了就重启
 *   2. 服务端进度是否推进 → 连续多次不变则判定卡死并重启
 *   3. 可选的课程刷完后自动接下一门
 *
 * 用法:
 *   node watchdog.mjs --course "人工智能"                 单课程守护
 *   node watchdog.mjs --courses "人工智能" "高等数学A1"    队列守护（跑完自动接下一门）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WLOG = path.join(ROOT, 'log', 'watchdog.log');
const ALOG = path.join(ROOT, 'log', 'autoplay.log');
const LOCK = path.join(ROOT, 'state', 'watchdog.lock');

const CHECK_MS = 3 * 60 * 1000;      // 检查间隔
const STALL_LIMIT = 3;               // 连续 N 次进度不变 → 判卡死
const MAX_RESTARTS = 20;             // 单课程最多重启次数

const argv = process.argv.slice(2);
const gi = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const courses = (() => {
  const i = argv.indexOf('--courses');
  if (i >= 0) return argv.slice(i + 1).filter(a => !a.startsWith('--'));
  const one = gi('--course');
  return one ? [one] : [];
})();

const log = (m) => {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${m}`;
  console.log(line);
  try { fs.appendFileSync(WLOG, line + '\n'); } catch {}
};

// ── 单实例锁 ──
if (fs.existsSync(LOCK)) {
  const pid = Number(fs.readFileSync(LOCK, 'utf8').trim());
  try { process.kill(pid, 0); console.error(`已有 watchdog 在运行 (pid ${pid})`); process.exit(1); } catch {}
}
fs.writeFileSync(LOCK, String(process.pid));
const cleanup = () => { try { fs.unlinkSync(LOCK); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 进程检测 ──
function autoplayAlive() {
  try {
    const out = execFileSync('wmic', ['process', 'where', "name='node.exe'", 'get', 'ProcessId,CommandLine', '/format:csv'], { encoding: 'utf8', windowsHide: true });
    return /autoplay\.mjs/.test(out);
  } catch {
    // wmic 不可用时退回端口检测
    try {
      const r = execFileSync('powershell', ['-NoProfile', '-Command', "(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: 'utf8', windowsHide: true });
      return Number(r.trim()) > 0;
    } catch { return false; }
  }
}

function killAll() {
  try { execFileSync('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore', windowsHide: true }); } catch {}
  try {
    const out = execFileSync('wmic', ['process', 'where', "name='node.exe'", 'get', 'ProcessId,CommandLine', '/format:csv'], { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      if (!/autoplay\.mjs/.test(line)) continue;
      const pid = line.trim().split(',').pop();
      if (pid && /^\d+$/.test(pid)) {
        try { execFileSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore', windowsHide: true }); } catch {}
      }
    }
  } catch {}
  try { fs.unlinkSync(path.join(ROOT, 'state', '.lock')); } catch {}
}

// ── 服务端进度 ──
async function serverProgress(courseName) {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
    const hit = Object.entries(idx).find(([, c]) => c.course.includes(courseName));
    if (!hit) return null;
    const [, c] = hit;
    const { getCookieHeader, httpGet, extractJsonObject } = await import('./lib/core.mjs');
    const kids = [...new Set(c.jobs.filter(j => j.type === 'video' && !j.passed).map(j => j.kid))].slice(0, 5);
    let passed = 0, total = 0;
    for (const kid of kids) {
      for (const num of [0, 1]) {
        const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${c.courseid}&knowledgeid=${kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
        try {
          const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${c.courseid}&clazzid=${c.clazzid}`);
          const raw = extractJsonObject(html, 'mArg');
          if (!raw) continue;
          const vids = (JSON.parse(raw).attachments || []).filter(a => a.type === 'video');
          if (!vids.length) continue;
          total += vids.length;
          passed += vids.filter(a => a.isPassed).length;
          break;
        } catch {}
        await sleep(150);
      }
    }
    return { passed, total, at: Date.now() };
  } catch { return null; }
}

// ── 主循环 ──
let curCourseIdx = 0;
let restarts = 0;
let lastProgressKey = '';
let stallCount = 0;

function startCourse(name) {
  log(`启动刷课: ${name}`);
  const child = spawn(process.execPath, ['autoplay.mjs', '--course', name, '--max-hours', '20'], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true, detached: true,
  });
  child.unref();
}

log(`watchdog 启动，队列: ${courses.join(' → ') || '(未指定)'}`);
if (!courses.length) { log('未指定课程，退出'); process.exit(1); }

startCourse(courses[curCourseIdx]);
await sleep(20000);

while (true) {
  await sleep(CHECK_MS);

  const alive = autoplayAlive();
  const name = courses[curCourseIdx];
  const prog = await serverProgress(name);
  const key = prog ? `${prog.passed}/${prog.total}` : '';

  if (!alive) {
    log(`✗ autoplay 已退出（${name}，进度 ${key || '未知'}）`);
    if (restarts++ > MAX_RESTARTS) { log('重启次数超限，停止'); break; }

    // 判断是否整门课已完成
    if (prog && prog.total > 0 && prog.passed >= prog.total) {
      log(`✓ ${name} 已全部通过（${key}）`);
      if (curCourseIdx + 1 < courses.length) {
        curCourseIdx++; restarts = 0; lastProgressKey = ''; stallCount = 0;
        startCourse(courses[curCourseIdx]);
        await sleep(20000);
        continue;
      } else { log('队列全部完成，watchdog 退出'); break; }
    }

    killAll();
    await sleep(8000);
    startCourse(name);
    await sleep(20000);
    continue;
  }

  // 存活但进度不变 → 判卡死
  if (key && key === lastProgressKey) {
    if (++stallCount >= STALL_LIMIT) {
      log(`⚠ 进度连续 ${stallCount} 次未变（${key}），判定卡死，重启`);
      killAll();
      await sleep(8000);
      startCourse(name);
      stallCount = 0;
      await sleep(20000);
      continue;
    }
  } else {
    stallCount = 0;
  }
  lastProgressKey = key;

  if (prog && prog.total > 0 && prog.passed >= prog.total) {
    log(`✓ ${name} 已全部通过（${key}），切换下一门`);
    killAll();
    if (curCourseIdx + 1 < courses.length) {
      curCourseIdx++; restarts = 0; lastProgressKey = ''; stallCount = 0;
      await sleep(8000);
      startCourse(courses[curCourseIdx]);
      await sleep(20000);
    } else { log('队列全部完成'); break; }
    continue;
  }

  log(`运行中 ${name}  进度 ${key || '?'}  重启计数 ${restarts}`);
}

cleanup();
