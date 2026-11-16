import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
for (const [cid, c] of Object.entries(index)) {
  if (!/美的历程|高等数学|人工智能|大学英语/.test(c.course)) continue;
  const kids = [...new Set(c.jobs.filter(j => j.type === 'video').map(j => j.kid))];
  let total = 0, ok = 0, pendSec = 0, closed = 0;
  for (const kid of kids) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
    try {
      const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
      if (/章节未开放/.test(html)) { closed++; continue; }
      const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
      const vids = (mArg.attachments || []).filter(a => a.type === 'video');
      total += vids.length;
      ok += vids.filter(a => a.isPassed).length;
      pendSec += vids.filter(a => !a.isPassed).reduce((s, a) => s + (a.attDuration || 0), 0);
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`${c.course.slice(0,20).padEnd(22)} ${String(ok).padStart(3)}/${String(total).padStart(3)} 待看 ${(pendSec/3600).toFixed(1)}h ${closed ? `（${closed} 章未开放）` : ''}`);
}
