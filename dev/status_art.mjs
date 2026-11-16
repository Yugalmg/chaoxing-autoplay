import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '267906227';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const kids = [...new Set(c.jobs.filter(j => j.type === 'video').map(j => j.kid))];
let total = 0, ok = 0, pendSec = 0;
for (const kid of kids) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}`);
    const vids = (JSON.parse(extractJsonObject(html, 'mArg')).attachments || []).filter(a => a.type === 'video');
    total += vids.length;
    ok += vids.filter(a => a.isPassed).length;
    pendSec += vids.filter(a => !a.isPassed).reduce((s, a) => s + (a.attDuration || 0), 0);
  } catch {}
  await new Promise(r => setTimeout(r, 500));
}
console.log(`艺术哲学：${ok}/${total} 视频通过，待看 ${(pendSec/3600).toFixed(2)} 小时，完成率 ${((ok/total)*100).toFixed(0)}%`);
