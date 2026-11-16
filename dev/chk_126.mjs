import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));

// 抽查 12.6 和几个刚才显示 98% 的章节
for (const no of ['12.6', '9.5.3', '12.11.1', '11.1']) {
  const ch = s.chapters.find(x => x.no === no);
  if (!ch) continue;
  for (const num of [0, 1]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
    try {
      const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
      const raw = extractJsonObject(html, 'mArg');
      if (!raw) continue;
      const vids = (JSON.parse(raw).attachments || []).filter(a => a.type === 'video');
      if (!vids.length) continue;
      console.log(`\n${no} ${ch.title}`);
      for (const v of vids) {
        const pt = (v.playTime || 0) / 1000;
        const pct = v.attDuration ? (pt / v.attDuration * 100).toFixed(1) : '0';
        console.log(`  ${(v.property?.name||'').slice(0,24).padEnd(26)} ${pt.toFixed(0)}/${v.attDuration}s (${pct}%)  passed=${v.isPassed}`);
      }
      break;
    } catch (e) {}
  }
  await new Promise(r => setTimeout(r, 500));
}
