import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '267906227';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const kids = [...new Set(c.jobs.map(j => j.kid))];
console.log(`艺术哲学 章节 ${kids.length} 个，全量扫描任务点类型…\n`);

const typeCount = {};
const works = [];
for (const kid of kids) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}`);
    const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
    for (const a of (mArg.attachments || [])) {
      const t = a.type || 'unknown';
      typeCount[t] = (typeCount[t] || 0) + 1;
      if (/work|quiz|test|exam|job/.test(String(a.property?.module || '')) || /work/i.test(t)) {
        works.push({ kid, title: a.property?.title || a.property?.name, module: a.property?.module, workid: a.property?.workid, type: t });
      }
    }
  } catch {}
  await new Promise(r => setTimeout(r, 350));
}
console.log('类型分布:', JSON.stringify(typeCount));
console.log('\n测验类任务点:', works.length);
for (const w of works) console.log('  ', JSON.stringify(w));
