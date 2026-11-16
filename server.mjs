/**
 * 学习通代挂 · 本地控制台
 * 启动后浏览器打开 http://127.0.0.1:7788
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/core.mjs';
import { checkLogin, extractCookies, findClientDataDir } from './lib/auth.mjs';
import { scanAll } from './lib/scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 7788);
const CACHE = path.join(ROOT, 'state', 'courses_cache.json');

// ── SSE 广播 ──────────────────────────────────────
const clients = new Set();

function broadcast(type, payload) {
  const data = `data: ${JSON.stringify({ type, payload })}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch { clients.delete(res); }
  }
}
const logLine = (text) => broadcast('log', String(text).replace(/\r?\n$/, ''));
const progress = (p) => broadcast('progress', p);

// ── 状态 ──────────────────────────────────────────
const state = {
  scanning: false,
  running: false,
  child: null,
  course: null,
  startedAt: null,
};

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
}

// ── HTTP ─────────────────────────────────────────
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function body(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', d => buf += d);
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // 静态页
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const f = path.join(__dirname, 'public', 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('UI missing'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(f));
  }

  // SSE
  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', payload: {} })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  try {
    if (url.pathname === '/api/status') {
      const login = await checkLogin();
      const cache = readCache();
      return json(res, 200, {
        login,
        client: { dir: findClientDataDir(), found: !!findClientDataDir() },
        scanning: state.scanning,
        running: state.running,
        course: state.course,
        startedAt: state.startedAt,
        cache: cache ? { at: cache.at, elapsed: cache.elapsed, count: cache.courses.length } : null,
      });
    }

    if (url.pathname === '/api/login/refresh' && req.method === 'POST') {
      logLine('开始从学习通客户端提取登录态…');
      const r = await extractCookies(logLine);
      logLine(`登录态就绪：${r.count} 条 cookie，${r.ok ? '验证通过' : '验证失败'}`);
      return json(res, 200, r);
    }

    if (url.pathname === '/api/scan' && req.method === 'POST') {
      if (state.scanning) return json(res, 409, { error: '正在扫描中' });
      state.scanning = true;
      broadcast('scan_state', { scanning: true });
      (async () => {
        try {
          const courses = await scanAll(progress);
          logLine(`扫描完成：${courses.length} 门课程`);
          broadcast('courses', courses);
        } catch (e) {
          logLine(`扫描失败：${e.message}`);
          broadcast('scan_state', { scanning: false, error: e.message });
        } finally {
          state.scanning = false;
          broadcast('scan_state', { scanning: false });
        }
      })();
      return json(res, 200, { started: true });
    }

    if (url.pathname === '/api/courses') {
      const cache = readCache();
      return json(res, 200, { at: cache?.at || 0, courses: cache?.courses || [] });
    }

    if (url.pathname === '/api/start' && req.method === 'POST') {
      const { course, maxHours } = await body(req);
      if (!course) return json(res, 400, { error: '缺少课程名' });
      if (state.running) return json(res, 409, { error: '已有任务在跑' });

      const args = ['autoplay.mjs', '--course', course, '--max-hours', String(maxHours || 10)];
      logLine(`启动: node ${args.join(' ')}`);
      const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
      state.child = child; state.running = true; state.course = course; state.startedAt = Date.now();
      broadcast('run_state', { running: true, course });

      child.stdout.on('data', d => logLine(d.toString()));
      child.stderr.on('data', d => logLine('[err] ' + d.toString()));
      child.on('exit', (code) => {
        state.running = false; state.child = null;
        const mins = state.startedAt ? ((Date.now() - state.startedAt) / 60000).toFixed(1) : '?';
        logLine(`任务结束（退出码 ${code}），运行 ${mins} 分钟`);
        broadcast('run_state', { running: false });
      });
      return json(res, 200, { started: true });
    }

    if (url.pathname === '/api/stop' && req.method === 'POST') {
      if (!state.child) return json(res, 200, { stopped: false });
      try { state.child.kill(); } catch {}
      logLine('已请求停止');
      return json(res, 200, { stopped: true });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log('');
  console.log('  ==========================================');
  console.log('     控制台已就绪');
  console.log('  ==========================================');
  console.log('');
  console.log(`     请在浏览器打开:  ${url}`);
  console.log('');
  console.log('     （浏览器若未自动弹出，手动复制上面的地址打开）');
  console.log('     （本窗口请保持运行，关掉即停止服务）');
  console.log('');

  if (!process.env.NO_OPEN) {
    // explorer 比 cmd start 可靠：后者在标题参数处理上容易把 URL 当窗口标题
    try {
      spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } catch {
      try { spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch {}
    }
  }
});
