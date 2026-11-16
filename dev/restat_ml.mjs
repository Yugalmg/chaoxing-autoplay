import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '267906196';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('美的历程'));
const kids = s.chapters.map(x => x.kid);
console.log(`美的历程 ${kids.length} 个章节，用 num=0/1/2 全查\n`);

let found = 0, passed = 0, pendSec = 0;
const missing = [];
for (const ch of s.chapters) {
  for (const num of [0, 1]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
    try {
      const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch.kid}&courseId=${CID}&clazzid=${c.clazzid}`);
      const raw = extractJsonObject(html, 'mArg');
      if (!raw) continue;
      const mArg = JSON.parse(raw);
      const vids = (mArg.attachments || []).filter(a => a.type === 'video');
      if (!vids.length) continue;
      for (const v of vids) {
        found++;
        if (v.isPassed) passed++;
        else { pendSec += v.attDuration || 0; missing.push({ no: ch.no, title: ch.title, name: (v.property?.name||'').slice(0,30), dur: v.attDuration, num }); }
      }
      break;  // 该章节已找到视频，不再试其他 num
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
}
console.log(`视频任务点: ${found}，已通过 ${passed}，未通过 ${missing.length}`);
console.log(`待看时长: ${(pendSec/3600).toFixed(1)} 小时\n`);
console.log('未通过明细:');
for (const m of missing.slice(0, 30)) console.log(`  ${m.no} ${String(m.title).slice(0,18).padEnd(20)} ${m.name} ${m.dur}s (num=${m.num})`);
