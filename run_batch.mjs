/**
 * 串行刷课：按顺序跑完一门再跑下一门
 * 用法: node run_batch.mjs --courses "美的历程" "形势与政策" --max-hours 8
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

const idx = argv.indexOf('--courses');
const mhIdx = argv.indexOf('--max-hours');
const maxHours = mhIdx >= 0 ? argv[mhIdx + 1] : '8';

// 取 --courses 之后、到下一个 -- 开头的参数之前的全部值
let courses = [];
if (idx >= 0) {
  for (let i = idx + 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) break;
    if (mhIdx >= 0 && i === mhIdx + 1) continue;   // 跳过 --max-hours 的值
    courses.push(a);
  }
}
if (!courses.length) courses = ['美的历程', '形势与政策'];

const logPath = path.join(ROOT, 'log', 'batch.log');
const logLine = (m) => {
  const l = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${m}`;
  console.log(l);
  fs.appendFileSync(logPath, l + '\n');
};

function runOne(course) {
  return new Promise((resolve) => {
    logLine(`▶▶▶ 开始: ${course}`);
    const child = spawn(process.execPath, ['autoplay.mjs', '--course', course, '--max-hours', String(maxHours)], {
      cwd: ROOT, stdio: 'inherit', windowsHide: true,
    });
    child.on('exit', (code) => {
      logLine(`◀◀◀ 结束: ${course}（退出码 ${code}）`);
      resolve(code);
    });
    child.on('error', (e) => {
      logLine(`!! ${course} 启动失败: ${e.message}`);
      resolve(-1);
    });
  });
}

logLine(`批次启动，课程队列: ${courses.join(' → ')}`);
for (const c of courses) {
  await runOne(c);
  // 给服务端和浏览器一点缓冲，避免端口/进程竞争
  await new Promise(r => setTimeout(r, 8000));
}
logLine('批次全部结束');
