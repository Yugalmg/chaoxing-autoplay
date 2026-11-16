import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\Users\\Admin（无密码）\\Documents\\deepseek-harness\\default-workspace\\xxt';
const html = fs.readFileSync(path.join(ROOT, 'state', 'studentcourse.html'), 'utf8');

const chunks = html.split('<div class="chapter_item"').slice(1);
const chapters = [];
for (const ch of chunks) {
  const kid = ch.match(/id="cur(\d+)"/)?.[1];
  if (!kid) continue;
  const title = ch.match(/^\s*id="cur\d+"[\s\S]{0,200}?title="([^"]*)"/)?.[1] || '';
  const no = ch.match(/class="catalog_sbar">([^<]*)</)?.[1]?.trim() || '';
  const stateClass = ch.match(/class="catalog_state ([^"]*)"/)?.[1] || '';
  const stateText = ch.match(/class="bntHoverTips">([^<]*)</)?.[1] || '';
  const levelMatch = title.match(/^/) ? null : null;
  chapters.push({ kid, no, title, stateClass, stateText, done: /yiwanc/.test(stateClass) });
}

fs.writeFileSync(path.join(ROOT, 'state', 'chapters.json'), JSON.stringify(chapters, null, 2), 'utf8');
const done = chapters.filter(c => c.done).length;
console.log(`chapters: ${chapters.length}  done: ${done}  pending: ${chapters.length - done}`);
console.log('state classes:', JSON.stringify([...new Set(chapters.map(c => c.stateClass))]));
console.log('\n--- pending list ---');
for (const c of chapters.filter(c => !c.done)) console.log(`  ${c.no}\t${c.kid}\t${c.title}\t[${c.stateText}]`);
