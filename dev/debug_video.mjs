import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('高等数学'));
const ch = s.chapters.find(c => c.no === '1.1');
const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${s.clazzid}&courseid=${s.courseid}&knowledgeid=${ch.kid}&num=0&ut=s&cpi=${s.cpi}&v=2025`;
const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch.kid}&courseId=${s.courseid}&clazzid=${s.clazzid}`);
fs.writeFileSync(path.join(ROOT, 'state', 'debug_video_card.html'), html, 'utf8');

const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
console.log('attachments:', mArg.attachments.length);
for (const a of mArg.attachments) {
  console.log('\n--- attachment ---');
  console.log(JSON.stringify(a, null, 1).slice(0, 2500));
}
console.log('\n--- defaults (video related) ---');
const d = mArg.defaults || {};
for (const k of Object.keys(d)) if (/capture|report|interval|video|face|water|auto/i.test(k)) console.log(`  ${k} = ${JSON.stringify(d[k])}`);
