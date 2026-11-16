/**
 * 用 GitHub API 发布仓库（无需 git 客户端）
 * 用法: node publish_github.mjs <TOKEN> [仓库名]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.argv[2];
const REPO = process.argv[3] || 'chaoxing-autoplay';

if (!TOKEN) { console.error('缺少 token'); process.exit(1); }

const API = 'https://api.github.com';
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'xxt-publisher',
};

async function api(p, opts = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(API + p, {
        ...opts,
        headers: { ...H, ...(opts.headers || {}) },
        signal: AbortSignal.timeout(60000),
      });
      const text = await r.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (r.ok) return json;
      // 5xx / 429 重试，4xx 直接失败
      if (r.status >= 500 || r.status === 429) {
        lastErr = new Error(`${p} → ${r.status} ${text.slice(0, 200)}`);
        await new Promise(x => setTimeout(x, 1200 * attempt));
        continue;
      }
      throw new Error(`${p} → ${r.status} ${text.slice(0, 300)}`);
    } catch (e) {
      lastErr = e;
      if (/→ 4\d\d/.test(e.message)) throw e;
      if (attempt < 5) {
        console.log(`    [重试 ${attempt}/5] ${p.slice(-40)} : ${e.message.slice(0, 60)}`);
        await new Promise(x => setTimeout(x, 1500 * attempt));
      }
    }
  }
  throw lastErr;
}

// ── 收集要发布的文件（排除凭据/运行时）──
const SKIP_DIRS = new Set(['.git', 'state', 'log', 'runtime', 'build', 'node_modules', 'dev/node_modules']);
const SKIP_FILES = new Set(['config.json', '.lock', 'watchdog.lock']);

function collect(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || SKIP_DIRS.has(rel)) continue;
      out.push(...collect(path.join(dir, e.name), rel));
    } else {
      if (SKIP_FILES.has(e.name)) continue;
      if (/\.(zip|log|tmp)$/i.test(e.name)) continue;
      out.push(rel);
    }
  }
  return out;
}

const files = collect(ROOT);
console.log(`待发布 ${files.length} 个文件`);

// ── 1. 身份 & 仓库 ──
const me = await api('/user');
console.log(`账号: ${me.login}`);

let repo;
try {
  repo = await api(`/repos/${me.login}/${REPO}`);
  console.log(`仓库已存在: ${repo.full_name}`);
} catch (e) {
  if (!/404/.test(e.message)) throw e;
  repo = await api('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: REPO,
      description: '学习通课程视频自动播放工具 — 真实播放、真实上报，不伪造进度',
      private: false,
      has_issues: true,
      has_wiki: false,
      auto_init: false,
    }),
  });
  console.log(`仓库已创建: ${repo.full_name}`);
}
const BRANCH = repo.default_branch || 'main';
console.log(`地址: ${repo.html_url}`);

// 空仓库无法直接创建 blob，先用 Contents API 放一个初始文件产生首个 commit
let isEmpty = false;
try {
  await api(`/repos/${me.login}/${REPO}/git/ref/heads/${BRANCH}`);
} catch {
  isEmpty = true;
}
if (isEmpty) {
  console.log('仓库为空，创建初始提交…');
  await api(`/repos/${me.login}/${REPO}/contents/README.md`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'chore: 初始化仓库',
      content: Buffer.from('# chaoxing-autoplay\n\n正在上传项目文件…\n').toString('base64'),
      branch: BRANCH,
    }),
  });
}

// ── 2. 上传 blob（并发 6）──
const tree = [];
let done = 0;
const queue = [...files];

async function worker() {
  while (queue.length) {
    const rel = queue.shift();
    const abs = path.join(ROOT, rel);
    const buf = fs.readFileSync(abs);
    const b64 = buf.toString('base64');
    const blob = await api(`/repos/${me.login}/${REPO}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: b64, encoding: 'base64' }),
    });
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
    done++;
    if (done % 20 === 0) console.log(`  已上传 ${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
console.log(`  blob 完成: ${tree.length}`);

// ── 3. 建 tree / commit / 更新 ref ──
const newTree = await api(`/repos/${me.login}/${REPO}/git/trees`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tree }),
});
console.log(`tree: ${newTree.sha.slice(0, 8)}`);

// 仓库若是空的，首次 commit 无 parent
let parents = [];
try {
  const ref = await api(`/repos/${me.login}/${REPO}/git/ref/heads/${BRANCH}`);
  parents = [ref.object.sha];
} catch { /* 空仓库 */ }

const commit = await api(`/repos/${me.login}/${REPO}/git/commits`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'feat: 学习通自动刷课工具\n\n- 从 PC 客户端提取登录态（DPAPI + AES-GCM 解密）\n- 零依赖 CDP 驱动，自动探测 Chrome/Edge\n- 视频 blob 预加载 + 线性播放，保证进度真实累计\n- 自动处理章节多 tab、视频弹题\n- 本地控制台 (127.0.0.1:7788) 实时日志\n- dev/ 保留开发期调试脚本，便于复现平台行为\n\n安全提示：state/ 与 config.json 含账号凭据，已加入 .gitignore',
    tree: newTree.sha,
    parents,
  }),
});
console.log(`commit: ${commit.sha.slice(0, 8)}`);

if (parents.length) {
  await api(`/repos/${me.login}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
} else {
  await api(`/repos/${me.login}/${REPO}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }),
  });
}

console.log(`\n完成: ${repo.html_url}`);
console.log(`分支: ${BRANCH}  提交: ${commit.sha.slice(0, 8)}  文件: ${tree.length}`);
