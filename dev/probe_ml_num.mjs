import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '267906196';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('美的历程'));

for (const no of ['6.1', '7.1', '8.1']) {
  const ch = s.chapters.find(x => x.no === no);
  console.log(`\n===== ${no} ${ch.title}  kid=${ch.kid} =====`);
  for (const num of [0, 1, 2]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
    try {
      const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch.kid}&courseId=${CID}&clazzid=${c.clazzid}`);
      const raw = extractJsonObject(html, 'mArg');
      const mArg = raw ? JSON.parse(raw) : null;
      const atts = mArg ? (mArg.attachments || []) : [];
      const desc = atts.map(a => `${a.type}${a.isPassed ? '(已过)' : a.isPassed === false ? '(未过)' : ''}`).join(' ');
      console.log(`  num=${num}: ${html.length}B  attachments=${atts.length}  ${desc}`);
    } catch (e) { console.log(`  num=${num}: ERR ${e.message.slice(0,40)}`); }
    await new Promise(r => setTimeout(r, 400));
  }
}
