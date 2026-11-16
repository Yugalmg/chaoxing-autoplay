import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\Users\\Admin（无密码）\\Documents\\deepseek-harness\\default-workspace\\xxt';
const html = fs.readFileSync(path.join(ROOT, 'state', 'courselist.html'), 'utf8');

const order = [];
const seen = new Set();
const linkRe = /stucoursemiddle\?courseid=(\d+)&(?:amp;)?clazzid=(\d+)&(?:amp;)?cpi=(\d+)/g;
for (const m of html.matchAll(linkRe)) {
  const key = `${m[1]}_${m[2]}`;
  if (seen.has(key)) continue;
  seen.add(key);
  order.push({ courseid: m[1], clazzid: m[2], cpi: m[3] });
}

const names = [...html.matchAll(/class="course-name[^"]*"[^>]*title="([^"]+)"/g)].map(m => m[1]);

const list = order.map((c, i) => ({ ...c, name: names[i] || '' }));

// 教师名：卡片里 line3 段落
const teachers = [...html.matchAll(/<p[^>]*class="[^"]*line3[^"]*"[^>]*>([\s\S]*?)<\/p>/g)]
  .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
list.forEach((c, i) => { c.teacher = (teachers[i] || '').slice(0, 50); });

fs.writeFileSync(path.join(ROOT, 'state', 'courses.json'), JSON.stringify(list, null, 2), 'utf8');
console.log(`courses: ${list.length}`);
for (const c of list) {
  console.log(`  courseid=${c.courseid}\tclazzid=${c.clazzid}\tcpi=${c.cpi}\t${c.name}\t[${c.teacher}]`);
}
