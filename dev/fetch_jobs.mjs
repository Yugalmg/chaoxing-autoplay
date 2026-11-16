import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cookies = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'cookies.json'), 'utf8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const course = { courseid: '267712938', clazzid: '156282586', cpi: '571260325', enc: '03f6d369036a3fc0742781e6da7a9337' };
const chapterId = '1258451860';

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${chapterId}&courseId=${course.courseid}&clazzid=${course.clazzid}&cpi=${course.cpi}&enc=${course.enc}&mooc2=1`;
const res = await fetch(url, {
  headers: { 'User-Agent': UA, 'Cookie': cookieHeader, 'Referer': 'https://mooc2-ans.chaoxing.com/', 'Accept-Language': 'zh-CN,zh;q=0.9' },
  redirect: 'follow',
});
const html = await res.text();
fs.writeFileSync(path.join(ROOT, 'state', 'studentstudy.html'), html, 'utf8');
console.log(`status=${res.status} len=${html.length}`);

const marks = {
  mArg: /mArg\s*=/.test(html),
  attachments: /attachments/.test(html),
  jobid: /jobid/i.test(html),
  objectid: /objectid/i.test(html),
  ans_job: /ans-job/.test(html),
  iframe: /<iframe/i.test(html),
  video: /\.mp4|video/i.test(html),
};
console.log(marks);

const grab = (re, n = 5) => [...html.matchAll(re)].slice(0, n).map(m => m[0].replace(/\s+/g, ' ').slice(0, 400));
console.log('\n--- jobid ---'); grab(/jobid["']?\s*[:=]\s*["']?[\w-]+/gi, 10).forEach(s => console.log('  ' + s));
console.log('\n--- objectid ---'); grab(/objectid["']?\s*[:=]\s*["']?[\w-]+/gi, 10).forEach(s => console.log('  ' + s));
console.log('\n--- attachments json ---');
const ai = html.indexOf('attachments');
if (ai > 0) console.log(html.slice(ai - 200, ai + 1500).replace(/\s+/g, ' '));
