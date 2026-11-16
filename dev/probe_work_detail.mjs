import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
// 人工智能的测验
for (const [cid, c] of Object.entries(index)) {
  if (!c.course.includes('人工智能')) continue;
  const w = c.jobs.filter(j => j.type === 'workid');
  console.log(`课程 ${c.course}  workid 任务点 ${w.length} 个`);
  const first = w[0];
  console.log('样例:', JSON.stringify(first, null, 1).slice(0, 500));

  // 拉该章节 cards 看完整 attachment
  const kid = first.kid;
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
  const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
  for (const a of (mArg.attachments || [])) {
    if (a.type === 'workid') {
      console.log('\n=== workid attachment ===');
      console.log(JSON.stringify(a, null, 1).slice(0, 1500));
      break;
    }
  }
  break;
}
