import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const args = process.argv.slice(2);
const g = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CID = g('--course', '268092949');
const KID = g('--kid', '1265127906');

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${KID}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}`);
const mArg = JSON.parse(extractJsonObject(html, 'mArg'));

console.log(`课程: ${mArg.coursename}  章节: ${mArg.knowledgename}`);
console.log(`任务点 ${(mArg.attachments || []).length} 个\n`);

for (const a of (mArg.attachments || [])) {
  const p = a.property || {};
  if (a.type === 'video') {
    const sec = (a.playTime || 0) / 1000;
    const pct = a.attDuration ? ((sec / a.attDuration) * 100).toFixed(0) : '0';
    console.log(`  [video] ${(p.name || '').slice(0, 40).padEnd(42)} ${sec.toFixed(0)}/${a.attDuration}s ${pct}%  passed=${a.isPassed}`);
  } else {
    console.log(`  [${a.type}] ${(p.name || p.title || '').slice(0, 40).padEnd(42)} module=${p.module}  job=${a.job ?? p.isJob ?? ''}`);
  }
}
