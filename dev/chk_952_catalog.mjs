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

// 统计整体：已完成 / 待完成 任务点数量
const totalNodes = (html.match(/待完成任务点/g) || []).length;
const doneTips = (html.match(/已完成/g) || []).length;
console.log(`目录页统计: 「已完成」出现 ${doneTips} 次, 「待完成任务点」${totalNodes} 次`);

// 找 9.5.2 章节名附近的状态
const idx = html.indexOf('校园智能问答');
if (idx > 0) {
  const seg = html.slice(Math.max(0, idx - 3000), idx + 3000);
  const tips = [...seg.matchAll(/bntHoverTips">([^<]*)</g)].map(m => m[1]);
  const states = [...seg.matchAll(/class="catalog_state ([^"]*)"/g)].map(m => m[1]);
  console.log('\n9.5.2 附近提示:', JSON.stringify(tips));
  console.log('9.5.2 附近状态类:', JSON.stringify(states));
} else { console.log('未找到 9.5.2 章节名'); }

// 找 12.6 附近
const idx2 = html.indexOf('AI+建工');
if (idx2 > 0) {
  const seg = html.slice(Math.max(0, idx2 - 3000), idx2 + 4000);
  const tips = [...seg.matchAll(/bntHoverTips">([^<]*)</g)].map(m => m[1]);
  console.log('\n12.6 附近提示:', JSON.stringify(tips));
}
