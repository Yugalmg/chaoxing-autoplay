import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 零依赖 CDP 客户端：Node 24 内置 fetch + WebSocket。
 * 只做本代挂需要的最小集合：导航、求值、等待、目标附着。
 */
export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message} (${msg.error.code})`)) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params, msg.sessionId);
      }
    });
  }

  static connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve(new CDP(ws)));
      ws.addEventListener('error', (e) => reject(new Error('ws error: ' + e.message)));
    });
  }

  send(method, params = {}, sessionId, timeoutMs = 60000) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  close() { try { this.ws.close(); } catch {} }
}

/** 启动一个受控 Chrome/Edge，返回 { proc, port, cdp } */
export async function launchBrowser({ exe, port = 9333, headless = true, userDataDir, extraArgs = [] }) {
  // 必须放在项目目录内：系统 Temp 在受限环境下会 EPERM
  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'state');
  const dir = userDataDir || path.join(baseDir, 'chrome-profile-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion,Translate',
    '--no-proxy-server',            // 学习通为国内站点，强制直连，避免受系统代理/VPN 影响
    '--disable-dev-shm-usage',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-blink-features=AutomationControlled',
    ...extraArgs,
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');

  // 把 Chrome 的 stdout/stderr 落到日志文件：用 ignore 会把启动失败原因全部丢掉
  let proc;
  let errLog = '';
  try {
    const logFd = fs.openSync(path.join(baseDir, '..', 'log', 'chrome.log'), 'a');
    fs.writeSync(logFd, `\n===== ${new Date().toISOString()} spawn =====\n${exe}\n${args.join('\n')}\n`);
    proc = spawn(exe, args, { stdio: ['ignore', logFd, logFd], detached: false, windowsHide: true });
  } catch (e) {
    // 退回无输出模式，但仍记录 spawn 失败
    fs.appendFileSync(path.join(baseDir, '..', 'log', 'chrome.log'), `spawn 抛错: ${e.message}\n`);
    proc = spawn(exe, args, { stdio: 'ignore', detached: false, windowsHide: true });
  }
  proc.on('error', (e) => {
    errLog += `spawn error: ${e.message}\n`;
    try { fs.appendFileSync(path.join(baseDir, '..', 'log', 'chrome.log'), errLog); } catch {}
  });
  proc.on('exit', (code, sig) => {
    try { fs.appendFileSync(path.join(baseDir, '..', 'log', 'chrome.log'), `child exit code=${code} sig=${sig} ${errLog}\n`); } catch {}
  });
  let version = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch {}
  }
  if (!version) { try { proc.kill(); } catch {}; throw new Error('browser did not open debugging port'); }
  const cdp = await CDP.connect(version.webSocketDebuggerUrl);
  return { proc, port, cdp, version, profile: dir };
}

/** 把导出的小饼干灌进浏览器 */
export async function applyCookies(cdp, cookies, url = 'https://mooc1.chaoxing.com/') {
  await cdp.send('Network.enable');
  await cdp.send('Network.setCookies', {
    cookies: cookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
      secure: !!c.secure, httpOnly: !!c.httpOnly,
      expires: c.expires && c.expires > 0 ? c.expires : -1,
    })),
  });
}

export async function newPage(cdp, url = 'about:blank') {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  return { targetId, sessionId };
}
