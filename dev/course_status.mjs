import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '268092949';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const kids = [...new Set(c.jobs.filter(j => j.type === 'video').map(j => j.kid))];
let total = 0, ok = 0, pendSec = 0, doneSec = 0;
const rows = [];

for (const kid of kids) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}`);
    const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
    const vids = (mArg.attachments || []).filter(a => a.type === 'video');
    const p = vids.filter(a => a.isPassed).length;
    const pend = vids.filter(a => !a.isPassed).reduce((s, a) => s + (a.attDuration || 0), 0);
    rows.push({ name: mArg.knowledgename, total: vids.length, ok: p, pend });
    total += vids.length; ok += p; pendSec += pend;
    doneSec += vids.filter(a => a.isPassed).reduce((s, a) => s + (a.attDuration || 0), 0);
  } catch (e) {
    rows.push({ name: kid, err: e.message.slice(0, 40) });
  }
  await new Promise(r => setTimeout(r, 600));
}

console.log('章节'.padEnd(24) + '视频'.padStart(6) + '已过'.padStart(6) + '待看'.padStart(10));
console.log('-'.repeat(50));
for (const r of rows) {
  if (r.err) { console.log(`${String(r.name).slice(0, 22).padEnd(24)} ERR ${r.err}`); continue; }
  console.log(`${String(r.name).slice(0, 22).padEnd(24)}${String(r.total).padStart(6)}${String(r.ok).padStart(6)}${((r.pend / 60).toFixed(0) + 'min').padStart(10)}`);
}
console.log('-'.repeat(50));
console.log(`合计 ${total} 个视频，已通过 ${ok}，待看 ${(pendSec / 3600).toFixed(2)} 小时`);
console.log(`完成率 ${((ok / total) * 100).toFixed(0)}%`);
