import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\Users\\Admin（无密码）\\Documents\\deepseek-harness\\default-workspace\\xxt';
const cookies = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'cookies.json'), 'utf8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const get = (url) => fetch(url, { headers: { 'User-Agent': UA, 'Cookie': cookieHeader, 'Accept-Language': 'zh-CN,zh;q=0.9' }, redirect: 'follow' });

const courses = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'courses.json'), 'utf8'));
const target = courses.find(c => c.name.includes('军事理论')) || courses[0];

const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${target.courseid}&clazzid=${target.clazzid}&cpi=${target.cpi}&ut=s`;
const res = await get(url);
const html = await res.text();
fs.writeFileSync(path.join(ROOT, 'state', 'studentcourse.html'), html, 'utf8');

console.log(`course: ${target.name}  ${res.status}  len=${html.length}`);
console.log(`has chapter_item: ${/chapter_item/.test(html)}  has knowledgeid: ${/knowledgeid=/.test(html)}  has cards: ${/knowledge\/cards/.test(html)}`);

const kRe = /knowledgeid=(\d+)[^"'&]*/g;
const kids = [...new Set([...html.matchAll(kRe)].map(m => m[1]))];
console.log(`knowledge ids: ${kids.length} -> ${kids.slice(0, 20).join(',')}`);

// 章节标题
const titles = [...html.matchAll(/<div[^>]*class="[^"]*chapter_unit[^"]*"[\s\S]{0,400}?<span[^>]*>([\s\S]{1,60}?)<\/span>/g)]
  .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
console.log(`chapter titles: ${titles.length}`);
titles.slice(0, 15).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

const idx = html.indexOf('knowledgeid');
console.log('\n--- snippet around first knowledgeid ---');
console.log(html.slice(Math.max(0, idx - 600), idx + 600).replace(/\s+/g, ' '));
