import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const cid = '268918938';
const c = index[cid];

const byChapter = new Map();
for (const j of c.jobs) {
  if (j.type !== 'video') continue;
  if (!byChapter.has(j.kid)) byChapter.set(j.kid, { no: j.no, title: j.chapter });
}
const chapters = [...byChapter.entries()].slice(0, 3);

for (const [kid, ch] of chapters) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
  const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
  const vids = (mArg.attachments || []).filter(x => x.type === 'video');
  const passed = vids.filter(v => v.isPassed).length;
  console.log(`\n章节 ${ch.no} ${ch.title}: ${passed}/${vids.length} 已通过`);
  for (const v of vids) {
    const sec = (v.playTime || 0) / 1000;
    const pct = v.attDuration ? ((sec / v.attDuration) * 100).toFixed(0) : '0';
    console.log(`  ${v.isPassed ? '✓' : ' '} ${String(v.property?.name || '').slice(0, 34).padEnd(36)} ${sec.toFixed(0)}/${v.attDuration}s  ${pct}%`);
  }
  await new Promise(r => setTimeout(r, 900));
}
