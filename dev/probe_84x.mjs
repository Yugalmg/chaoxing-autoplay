import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));

for (const no of ['8.4.1', '8.4.4', '8.4.6']) {
  const ch = s.chapters.find(x => x.no === no);
  if (!ch) continue;
  for (const num of [0, 1, 2]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
    try {
      const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
      const raw = extractJsonObject(html, 'mArg');
      if (!raw) continue;
      const mArg = JSON.parse(raw);
      const vids = (mArg.attachments || []).filter(a => a.type === 'video');
      if (!vids.length) continue;
      const v = vids[0];
      const p = v.property || {};
      console.log(`\n${no} ${(p.name||'').slice(0,26)}`);
      console.log(`  fastforward=${p.fastforward}  switchwindow=${p.switchwindow}  doublespeed=${p.doublespeed}`);
      console.log(`  playTime=${((v.playTime||0)/1000).toFixed(0)}s / ${v.attDuration}s  passed=${v.isPassed}`);
      const d = mArg.defaults || {};
      console.log(`  ignoreVideoCtrl=${d.ignoreVideoCtrl}  videoAutoPlay=${d.videoAutoPlay}`);
      break;
    } catch (e) {}
  }
  await new Promise(r => setTimeout(r, 400));
}
