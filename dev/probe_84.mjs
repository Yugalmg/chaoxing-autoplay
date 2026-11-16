import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '267906227';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('艺术哲学'));
const ch84 = s.chapters.find(x => x.no === '8.4');
console.log('8.4 章节:', ch84?.kid, ch84?.title);

const kid = ch84.kid;
const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}`);
console.log(`页面 ${html.length} 字节`);
fs.writeFileSync(path.join(ROOT, 'log', 'cards_84.html'), html, 'utf8');

const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
console.log('\n=== mArg 顶层字段 ===');
for (const [k, v] of Object.entries(mArg)) {
  const t = Array.isArray(v) ? `array[${v.length}]` : typeof v;
  console.log(`  ${k}: ${t}${Array.isArray(v) && v.length ? ' -> ' + JSON.stringify(v[0]).slice(0,120) : ''}`);
}

console.log('\n=== attachments 明细 ===');
for (const a of (mArg.attachments || [])) {
  console.log(`  type=${a.type} module=${a.property?.module} title=${a.property?.title || a.property?.name}`);
}

// 搜索 HTML 里的测验线索
console.log('\n=== HTML 中的测验关键词 ===');
for (const kw of ['workid', 'work-', '章节测验', 'workCount', 'workList', 'jobCount']) {
  const n = (html.match(new RegExp(kw, 'gi')) || []).length;
  if (n) console.log(`  ${kw}: ${n} 次`);
}
