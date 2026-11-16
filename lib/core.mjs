import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 相对于本文件定位项目根目录，保证整个文件夹可以搬到任意位置/任意电脑
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_CFG = {
  session: { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
  playback: { rate: 1, rate_max: 1.5, mute: true },
  account: {},
};

export const cfg = (() => {
  try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')) }; }
  catch { return DEFAULT_CFG; }
})();
/** 实时读取 cookie（提取登录态后无需重启即可生效） */
export function getCookies() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'cookies.json'), 'utf8')); }
  catch { return []; }
}

export function getCookieHeader() {
  return getCookies().map(c => `${c.name}=${c.value}`).join('; ');
}

// 兼容旧调用点（启动时快照）
export const cookies = getCookies();
export const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

/** 自动探测可用的 Chromium 内核浏览器（Chrome 优先，其次 Edge） */
export function findBrowser() {
  const env = process.env;
  const cands = [
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  for (const p of cands) {
    try { if (p && fs.existsSync(p)) return p; } catch {}
  }
  // 注册表兜底
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe', '/ve'], { encoding: 'utf8', windowsHide: true });
    const m = out.match(/REG_SZ\s+(.+\.exe)/i);
    if (m && fs.existsSync(m[1].trim())) return m[1].trim();
  } catch {}
  throw new Error('未找到 Chrome 或 Edge，请先安装任一浏览器');
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fallback; }
}

export function writeJson(p, obj) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2), 'utf8');
}

export async function httpGet(url, referer = 'https://mooc1.chaoxing.com/') {
  const res = await fetch(url, {
    headers: {
      'User-Agent': cfg.session.ua,
      'Cookie': getCookieHeader(),
      'Referer': referer,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`HTTP ${res.status} ${url}`);
  if (/passport2\.chaoxing\.com\/login|请先登录/.test(text)) throw new Error('SESSION_EXPIRED');
  return text;
}

/** 从页面中按括号配平提取 `marker = {...}` 的 JSON 对象（必须紧跟 `= {`，跳过 `marker = ""` / `try{`） */
export function extractJsonObject(src, marker) {
  const markerEsc = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = new RegExp(markerEsc + '\\s*=\\s*\\{').exec(src);
  if (!hit) return null;
  const start = hit.index + hit[0].length - 1;
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  return null;
}
