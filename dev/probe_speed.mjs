import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const [cid, c] = Object.entries(index).find(([, x]) => x.course.includes('艺术哲学'));
const kids = [...new Set(c.jobs.filter(j => j.type === 'video' && !j.passed).map(j => j.kid))].slice(0, 6);
console.log(`抽样 ${kids.length} 个未完成章节\n`);

let supports = 0, total = 0;
for (const kid of kids) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
    const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
    for (const a of (mArg.attachments || [])) {
      if (a.type !== 'video') continue;
      total++;
      const ds = a.property?.doublespeed;
      const ff = a.property?.fastforward;
      const defs = mArg.defaults || {};
      if (String(ds) !== '0' && ds !== undefined) supports++;
      console.log(`  ${String(a.property?.name || '').slice(0, 28).padEnd(30)} doublespeed=${ds}  fastforward=${ff}  ignoreVideoCtrl=${defs.ignoreVideoCtrl}`);
    }
  } catch (e) { console.log('  ERR ' + e.message.slice(0, 40)); }
  await new Promise(r => setTimeout(r, 600));
}
console.log(`\n共 ${total} 个视频，doublespeed 非 0 的: ${supports}`);
