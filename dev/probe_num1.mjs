import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '267906227', KID = '1262060630';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

for (const num of [0, 1]) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${KID}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
  const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}`);
  const raw = extractJsonObject(html, 'mArg');
  const mArg = JSON.parse(raw);
  console.log(`\n===== num=${num}  ${html.length} 字节  attachments=${(mArg.attachments||[]).length} =====`);
  for (const a of (mArg.attachments || [])) {
    console.log(`  type=${a.type} module=${a.property?.module} title=${a.property?.title || a.property?.name} workid=${a.property?.workid || ''}`);
  }
  if (num === 1) {
    fs.writeFileSync(path.join(ROOT, 'log', 'cards_84_num1.html'), html, 'utf8');
    console.log('\n  完整 attachments:');
    console.log(JSON.stringify(mArg.attachments, null, 1).slice(0, 2000));
  }
  await new Promise(r => setTimeout(r, 800));
}
