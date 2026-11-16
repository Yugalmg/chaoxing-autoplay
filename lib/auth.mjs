/**
 * 登录态：检测有效性 + 从本机学习通客户端提取
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT } from './core.mjs';

const STATE = path.join(ROOT, 'state');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function cookiesPath() {
  return path.join(STATE, 'cookies.json');
}

export function loadCookies() {
  try { return JSON.parse(fs.readFileSync(cookiesPath(), 'utf8')); } catch { return null; }
}

/** 找本机学习通客户端的数据目录 */
export function findClientDataDir() {
  const cands = [
    path.join(process.env.APPDATA || '', 'cxstudy'),
    path.join(process.env.LOCALAPPDATA || '', 'cxstudy'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'cxstudy'),
  ];
  for (const p of cands) {
    if (p && fs.existsSync(path.join(p, 'Network', 'Cookies'))) return p;
  }
  return null;
}

function isProcessRunning(name) {
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'], { encoding: 'utf8', windowsHide: true });
    return out.toLowerCase().includes(name.toLowerCase());
  } catch { return false; }
}

// 学习通客户端是 Electron，有主进程 + 多个子进程，必须整棵进程树一起结束
function killClientTree() {
  const names = ['cxstudy.exe', 'cxstudy Helper.exe', 'cxstudyHelper.exe', '超星学习通.exe'];
  for (const n of names) {
    try { execFileSync('taskkill', ['/F', '/T', '/IM', n], { stdio: 'ignore', windowsHide: true }); } catch {}
  }
}

function clientAlive() {
  return isProcessRunning('cxstudy.exe');
}

// 等待客户端完全退出，返回是否成功
async function waitClientGone(maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (!clientAlive()) return true;
    killClientTree();
    await new Promise(r => setTimeout(r, 500));
  }
  return !clientAlive();
}

function killProcess(name) {
  try { execFileSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; }
}

function startClient(exePath) {
  try {
    execFileSync('cmd', ['/c', 'start', '', exePath], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch { return false; }
}

function findClientExe() {
  const cands = [
    'D:\\xuexitong\\cxstudy\\latest\\cxstudy.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'cxstudy', 'cxstudy.exe'),
    path.join(process.env.PROGRAMFILES || '', 'cxstudy', 'cxstudy.exe'),
  ];
  for (const p of cands) if (p && fs.existsSync(p)) return p;
  return null;
}

/** DPAPI 解主密钥（通过 PowerShell） */
function unwrapKey(localStatePath) {
  const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$j = Get-Content -LiteralPath '${localStatePath.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json
$b = [Convert]::FromBase64String($j.os_crypt.encrypted_key)
$raw = $b[5..($b.Length-1)]
$k = [System.Security.Cryptography.ProtectedData]::Unprotect($raw, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($k)
`.trim();
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  const b64 = out.trim().split(/\r?\n/).pop().trim();
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('主密钥长度异常: ' + key.length);
  return key;
}

function decryptValue(buf, key) {
  if (!buf || buf.length === 0) return '';
  const head = buf.subarray(0, 3).toString('latin1');
  if (head === 'v10' || head === 'v11') {
    const nonce = buf.subarray(3, 15);
    const body = buf.subarray(15);
    const tag = body.subarray(body.length - 16);
    const ct = body.subarray(0, body.length - 16);
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    } catch { return ''; }
  }
  return buf.toString('utf8');
}

/** 从客户端提取 cookie 并写入 state/cookies.json */
export async function extractCookies(log = () => {}) {
  const dir = findClientDataDir();
  if (!dir) throw new Error('未找到学习通客户端数据目录（%APPDATA%\\cxstudy）');

  const cookieDb = path.join(dir, 'Network', 'Cookies');
  const localState = path.join(dir, 'Local State');
  if (!fs.existsSync(localState)) throw new Error('缺少 Local State，客户端未登录过');

  const exe = findClientExe();
  const wasRunning = isProcessRunning('cxstudy.exe');

  log('停止学习通客户端…');
  if (wasRunning) {
    killClientTree();
    const gone = await waitClientGone(15000);
    if (!gone) {
      throw new Error('无法自动关闭学习通客户端，请手动退出（右下角托盘图标 → 退出）后重试');
    }
    log('客户端已退出');
  }

  log('读取凭据库…');
  const tmpDb = path.join(STATE, 'Cookies.db');
  fs.mkdirSync(STATE, { recursive: true });
  let copied = false;
  for (let i = 0; i < 40 && !copied; i++) {
    try {
      killClientTree();
      const fs_ = fs.openSync(cookieDb, 'r');
      const out = fs.openSync(tmpDb, 'w');
      const buf = Buffer.alloc(64 * 1024);
      let n;
      while ((n = fs.readSync(fs_, buf, 0, buf.length, null)) > 0) fs.writeSync(out, buf, 0, n);
      fs.closeSync(out); fs.closeSync(fs_);
      copied = true;
    } catch {
      await new Promise(r => setTimeout(r, 150));
    }
  }
  if (!copied) throw new Error('无法读取 Cookies.db（文件被占用）');

  log('解封主密钥…');
  const key = unwrapKey(localState);

  log('解密 cookie…');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(tmpDb, { readOnly: true });
  const rows = db.prepare(`SELECT host_key, name, value, encrypted_value, path, CAST(expires_utc AS TEXT) AS expires_utc, is_secure, is_httponly FROM cookies`).all();
  const epoch = 11644473600000000n;
  const out = [];
  for (const r of rows) {
    let val = r.value || decryptValue(r.encrypted_value, key);
    let exp = -1;
    if (r.expires_utc && Number(r.expires_utc) > 0) exp = Number((BigInt(r.expires_utc) - epoch) / 1000000n);
    out.push({ name: r.name, value: val, domain: r.host_key, path: r.path || '/', expires: exp, httpOnly: !!r.is_httponly, secure: !!r.is_secure, sameSite: 'Lax' });
  }
  if (!out.length) throw new Error('未解出任何 cookie');

  fs.writeFileSync(cookiesPath(), JSON.stringify(out, null, 2), 'utf8');
  log(`解出 ${out.length} 条 cookie`);

  // 不再自动重启客户端：Electron 启动瞬间会抢占凭据文件，导致后续浏览器启动异常
  // 需要客户端时请手动打开

  const check = await checkLogin();
  return { count: out.length, ...check };
}

/** 用现有 cookie 试请求一次，判断是否有效 */
export async function checkLogin() {
  const ck = loadCookies();
  if (!ck || !ck.length) return { ok: false, reason: '没有本地登录态' };

  const uid = ck.find(c => c.name === '_uid')?.value || '';
  const fid = ck.find(c => c.name === 'fid')?.value || '';

  try {
    const res = await fetch('https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata', {
      method: 'POST',
      headers: {
        'User-Agent': UA, 'Cookie': ck.map(c => `${c.name}=${c.value}`).join('; '),
        'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest',
      },
      body: 'courseType=1&courseFolderId=0&courseFolderSize=0',
    });
    const html = await res.text();
    if (/passport2|请先登录/.test(html)) return { ok: false, reason: 'cookie 已失效', uid };
    const cnt = [...html.matchAll(/stucoursemiddle\?courseid=/g)].length;
    let nick = '';
    try {
      const me = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'cxstudy', 'config_new.json'), 'utf8'));
      const k = Object.keys(me).find(k => /_user$/.test(k) && me[k]?.value?.name);
      if (k) nick = `${me[k].value.name} · ${me[k].value.schoolname || ''}`;
    } catch {}
    return { ok: true, uid, fid, nick, courses: cnt };
  } catch (e) {
    return { ok: false, reason: '网络错误: ' + e.message.slice(0, 60), uid };
  }
}
