import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';
const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));
for (const delay of [0, 20000, 40000]) {
  if (delay) { console.log(`\n等待 ${delay/1000}s 后复查…`); await new Promise(r => setTimeout(r, delay === 20000 ? 20000 : 20000)); }
  const ch = s.chapters.find(x => x.no === '9.5.2');
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
  const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
  const v = (mArg.attachments || []).find(a => a.type === 'video');
  if (v) console.log(`  playTime=${((v.playTime||0)/1000).toFixed(0)}/${v.attDuration}s passed=${v.isPassed} ywbf=${v.property?.ywbf ?? '-'} jobid=${v.jobid ?? '-'} headOffset=${v.headOffset}`);
}
