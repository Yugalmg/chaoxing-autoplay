import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';
const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const html = await httpGet(
  `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&ut=s`,
  'https://mooc2-ans.chaoxing.com/'
);
const pending = (html.match(/待完成任务点/g) || []).length;
const done = (html.match(/已完成/g) || []).length;
console.log(`【服务端目录】已完成标记 ${done} 处，待完成任务点 ${pending} 处`);

// 列出仍有待完成任务点的章节
const re = /title="([^"]{2,40})"[\s\S]{0,2500}?bntHoverTips">([^<]*)</g;
let m, shown = 0;
console.log('\n=== 仍有待完成项的章节 ===');
while ((m = re.exec(html)) !== null) {
  if (/待完成/.test(m[2]) && shown++ < 20) console.log(`  ✗ ${m[1].slice(0,28).padEnd(30)} ${m[2]}`);
}
if (!shown) console.log('  （无）');

// 章节级统计
const chapters = (html.match(/class="chapter_item"/g) || []).length;
console.log(`\n章节总数(条目): ${chapters}`);
