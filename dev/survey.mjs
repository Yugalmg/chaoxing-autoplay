import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cookies = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'cookies.json'), 'utf8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const courses = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'courses.json'), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const survey = [];

for (const c of courses) {
  const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${c.courseid}&clazzid=${c.clazzid}&cpi=${c.cpi}&ut=s`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Cookie': cookieHeader, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    const html = await res.text();
    const enc = html.match(/var enc = "([0-9a-f]{32})"/)?.[1] || '';
    const chunks = html.split('<div class="chapter_item"').slice(1);
    const chapters = [];
    for (const ch of chunks) {
      const kid = ch.match(/id="cur(\d+)"/)?.[1];
      if (!kid) continue;
      const title = ch.match(/^\s*id="cur\d+"[\s\S]{0,200}?title="([^"]*)"/)?.[1] || '';
      const no = ch.match(/class="catalog_sbar">([^<]*)</)?.[1]?.trim() || '';
      const stateClass = ch.match(/class="catalog_state ([^"]*)"/)?.[1] || '';
      chapters.push({ kid, no, title, done: /yiwanc/.test(stateClass) });
    }
    const doneN = chapters.filter(x => x.done).length;
    survey.push({ ...c, enc, total: chapters.length, done: doneN, pending: chapters.length - doneN, chapters });
    console.log(`${String(chapters.length).padStart(3)}ch  done=${String(doneN).padStart(3)}  pend=${String(chapters.length - doneN).padStart(3)}  ${c.name}`);
  } catch (e) {
    console.log(`ERR ${c.name}: ${e.message}`);
  }
  await sleep(800);
}

fs.writeFileSync(path.join(ROOT, 'state', 'survey.json'), JSON.stringify(survey, null, 2), 'utf8');
console.log('\n--- courses with pending chapters ---');
for (const s of survey.filter(s => s.pending > 0)) {
  console.log(`\n${s.name}  (courseid=${s.courseid} clazzid=${s.clazzid} cpi=${s.cpi} enc=${s.enc})`);
  for (const ch of s.chapters.filter(c => !c.done).slice(0, 12)) console.log(`   ${ch.no}\t${ch.kid}\t${ch.title}`);
  if (s.pending > 12) console.log(`   ... +${s.pending - 12} more`);
}
