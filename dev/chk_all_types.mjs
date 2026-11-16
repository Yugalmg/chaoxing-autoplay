import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));

for (const no of ['12.6', '9.5.3', '12.11.1']) {
  const ch = s.chapters.find(x => x.no === no);
  if (!ch) continue;
  console.log(`\n===== ${no} ${ch.title}  kid=${ch.kid} =====`);
  for (const num of [0, 1, 2]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
    try {
      const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
      const raw = extractJsonObject(html, 'mArg');
      if (!raw) { console.log(`  num=${num}: no mArg`); continue; }
      const mArg = JSON.parse(raw);
      const atts = mArg.attachments || [];
      console.log(`  num=${num}: ${atts.length} 个任务点`);
      for (const a of atts) {
        const p = a.property || {};
        console.log(`    [${a.type}] ${(p.name||p.title||'').slice(0,30).padEnd(32)} passed=${a.isPassed} job=${a.job}`);
      }
      const d = mArg.defaults || {};
      if (d.ignoreVideoCtrl !== undefined) console.log(`    (defaults: ignoreVideoCtrl=${d.ignoreVideoCtrl})`);
    } catch (e) { console.log(`  num=${num} ERR ${e.message.slice(0,40)}`); }
    await new Promise(r => setTimeout(r, 400));
  }
}
