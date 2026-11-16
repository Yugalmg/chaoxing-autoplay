import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const html = await httpGet(
  `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&ut=s`,
  'https://mooc2-ans.chaoxing.com/'
);

// 精确解析：找 title= 后面的章节名 + 完成状态
const re = /<div class="chapter_item"[^>]*>[\s\S]{0,400}?<div class="chapter_item"[^>]*id="cur(\d+)"[^>]*>([\s\S]{0,600})/g;
// 换个思路：逐行找含 cur<kid> 的块
const lines = html.split(/\n/);
const out = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const m = l.match(/title="([^"]*)"/);
  const kidM = l.match(/id="cur(\d+)"/);
  if (!kidM) continue;
  // 往后看 30 行找完成状态
  let done = false, stateTip = '';
  for (let j = i; j < Math.min(i + 30, lines.length); j++) {
    if (/bntHoverTips">([^<]*)</.test(lines[j])) {
      const t = lines[j].match(/bntHoverTips">([^<]*)</)[1];
      stateTip = t;
      if (/已完成/.test(t)) done = true;
      break;
    }
  }
  const name = m ? m[1] : '';
  out.push({ kid: kidM[1], name, done, stateTip });
}

console.log(`解析到 ${out.length} 个章节\n`);
console.log('=== 未完成章节 ===');
for (const r of out.filter(x => !x.done)) {
  console.log(`  ✗ ${r.name.slice(0, 30).padEnd(32)} ${r.stateTip}`);
}
console.log('\n=== 12.x / 9.5.x 状态 ===');
for (const r of out.filter(x => /^12\.|^9\.5/.test(x.name))) {
  console.log(`  ${r.done ? '✓' : '✗'} ${r.name.slice(0, 30).padEnd(32)} ${r.stateTip}`);
}
