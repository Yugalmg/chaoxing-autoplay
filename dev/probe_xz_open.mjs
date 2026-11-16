import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '268918938';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const kids = [...new Set(c.jobs.filter(j => j.type === 'video' && !j.passed).map(j => j.kid))].slice(0, 8);
console.log(`抽查 ${kids.length} 个未完成章节\n`);

let closed = 0, open = 0;
for (const kid of kids) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}`);
    const notOpen = /章节未开放|提交失败/.test(html);
    const mArg = notOpen ? null : JSON.parse(extractJsonObject(html, 'mArg') || 'null');
    const vids = mArg ? (mArg.attachments || []).filter(a => a.type === 'video').length : 0;
    if (notOpen) closed++; else open++;
    console.log(`  ${kid}  ${notOpen ? '✗ 章节未开放' : `✓ 开放 (${vids} 个视频)`}  ${html.length}B`);
  } catch (e) { console.log(`  ${kid}  ERR ${e.message.slice(0,40)}`); }
  await new Promise(r => setTimeout(r, 500));
}
console.log(`\n开放 ${open} / 未开放 ${closed}`);
