import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '267906227';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const kids = [...new Set(c.jobs.map(j => j.kid))];

let totalQuiz = 0, answered = 0, unanswered = 0;
const details = [];
const seenObj = new Set();

for (const kid of kids) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}`);
    const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
    for (const a of (mArg.attachments || [])) {
      if (a.type !== 'video' || !a.mid || seenObj.has(a.mid)) continue;
      seenObj.add(a.mid);
      const initUrl = `https://mooc1.chaoxing.com/mooc-ans/richvideo/initdatawithviewerV2?mid=${a.mid}&cpi=${c.cpi}&classid=${c.clazzid}&courseid=${CID}&ut=s`;
      try {
        const raw = await httpGet(initUrl, 'https://mooc1.chaoxing.com/');
        const data = JSON.parse(raw);
        for (const grp of (Array.isArray(data) ? data : [])) {
          for (const q of (grp.datas || [])) {
            totalQuiz++;
            if (q.answered) answered++;
            else { unanswered++; details.push({ video: (a.property?.name || '').slice(0,26), q: (q.description||'').slice(0,40), at: q.startTime }); }
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
  } catch {}
  await new Promise(r => setTimeout(r, 300));
}

console.log(`视频弹题总数: ${totalQuiz}`);
console.log(`已答: ${answered}   未答: ${unanswered}`);
if (details.length) {
  console.log('\n未答明细:');
  for (const d of details.slice(0, 20)) console.log(`  ${d.video} @${d.at}s  ${d.q}`);
}
