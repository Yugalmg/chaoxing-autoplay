import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cookies = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'cookies.json'), 'utf8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const c = { courseid: '267712938', clazzid: '156282586', cpi: '571260325' };
const knowledgeid = '1258451860';

const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${c.courseid}&knowledgeid=${knowledgeid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const res = await fetch(url, {
  headers: {
    'User-Agent': UA, 'Cookie': cookieHeader,
    'Referer': `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${knowledgeid}&courseId=${c.courseid}&clazzid=${c.clazzid}`,
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
});
const html = await res.text();
fs.writeFileSync(path.join(ROOT, 'state', 'cards.html'), html, 'utf8');
console.log(`status=${res.status} len=${html.length}`);

// 任务点对象数组
const m = html.match(/mArg\s*=\s*(\{[\s\S]*?\});\s*\n/);
const att = html.match(/attachments\s*[:=]\s*(\[[\s\S]*?\])\s*[,;]/);

const show = (label, s) => {
  console.log(`\n=== ${label} ===`);
  if (!s) return console.log('  (none)');
  try {
    const o = JSON.parse(s);
    console.log(JSON.stringify(o, null, 1).slice(0, 3000));
  } catch { console.log(s.replace(/\s+/g, ' ').slice(0, 2000)); }
};

show('mArg', m?.[1]);
show('attachments', att?.[1]);

console.log('\n=== keys found ===');
for (const k of ['jobid', 'objectId', 'duration', 'jobRate', 'type', 'otherInfo']) {
  console.log(`  ${k}: ${(html.match(new RegExp(k, 'gi')) || []).length}`);
}
