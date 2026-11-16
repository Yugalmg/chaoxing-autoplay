import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const prof = path.join(ROOT, 'state', 'chrome-spawntest');
fs.rmSync(prof, { recursive: true, force: true });
fs.mkdirSync(prof, { recursive: true });

const exe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = [
  '--remote-debugging-port=9334',
  `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check',
  '--no-proxy-server', '--mute-audio',
  '--window-position=-10000,-10000', '--window-size=1280,900',
  'about:blank',
];
console.log('spawn 尝试…');
const p = spawn(exe, args, { stdio: 'ignore', detached: false, windowsHide: true });
p.on('error', (e) => console.log('spawn error:', e.message));
p.on('exit', (code, sig) => console.log(`child exit code=${code} sig=${sig}`));
console.log('pid =', p.pid);

for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 600));
  try {
    const r = await fetch('http://127.0.0.1:9334/json/version');
    if (r.ok) { const j = await r.json(); console.log(`\n✓ 端口就绪 (第 ${i+1} 次尝试)`, j.Browser); break; }
  } catch {}
  if (i === 19) console.log('\n✗ 端口始终未开');
}
try { p.kill(); } catch {}
