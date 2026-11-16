import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, cookies, cookieHeader, httpGet } from './lib/core.mjs';

const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('形势与政策'));
const ch = s.chapters[0];
const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${s.clazzid}&courseid=${s.courseid}&knowledgeid=${ch.kid}&num=0&ut=s&cpi=${s.cpi}&v=2025`;
const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch.kid}&courseId=${s.courseid}&clazzid=${s.clazzid}`);
fs.writeFileSync(path.join(ROOT, 'state', 'debug_card.html'), html, 'utf8');
console.log(`len=${html.length} chapter=${ch.no} ${ch.title}`);

const i = html.indexOf('mArg');
console.log('\n--- first mArg at ' + i + ' ---');
console.log(JSON.stringify(html.slice(i - 120, i + 700)));

const all = [...html.matchAll(/mArg/g)].map(m => m.index);
console.log('\nmArg occurrences:', all.length, all.slice(0, 10));
