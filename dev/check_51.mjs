import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));
const ch = s.chapters.find(x => x.no === '5.1');
console.log('5.1 kid =', ch?.kid);
for (const num of [0, 1]) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
    const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
    const vids = (mArg.attachments || []).filter(a => a.type === 'video');
    if (!vids.length) continue;
    console.log(`\nnum=${num}:`);
    for (const v of vids) {
      console.log(`  ${(v.property?.name||'').slice(0,30)}  playTime=${((v.playTime||0)/1000).toFixed(0)}s / ${v.attDuration}s  passed=${v.isPassed}`);
    }
    break;
  } catch (e) { console.log(`num=${num} ERR ${e.message.slice(0,40)}`); }
}
