import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
console.log('=== 各课程任务点类型分布 ===\n');
for (const [cid, c] of Object.entries(index)) {
  const byType = {};
  for (const j of c.jobs) byType[j.type] = (byType[j.type] || 0) + 1;
  const dist = Object.entries(byType).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`${c.course.slice(0, 26).padEnd(28)} ${dist}`);
}

console.log('\n=== 非视频任务点明细（前 20 条）===');
let n = 0;
for (const [cid, c] of Object.entries(index)) {
  for (const j of c.jobs) {
    if (j.type === 'video' || n >= 20) continue;
    n++;
    console.log(`  [${j.type}] ${c.course.slice(0,12)} | ${j.no} ${String(j.chapter).slice(0,16)} | ${String(j.name).slice(0,30)} | jobid=${j.jobid}`);
  }
}
