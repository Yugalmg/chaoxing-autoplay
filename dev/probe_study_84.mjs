import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet } from './lib/core.mjs';

const CID = '267906227';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const kid = '1262060630';

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
console.log(`studentstudy 页面: ${html.length} 字节`);
fs.writeFileSync(path.join(ROOT, 'log', 'study_84.html'), html, 'utf8');

console.log('\n=== 测验相关线索 ===');
for (const kw of ['work', '测验', 'job', 'exam', 'test']) {
  const m = [...html.matchAll(new RegExp('.{60}' + kw + '.{100}', 'gi'))].slice(0, 3);
  if (m.length) {
    console.log(`\n[${kw}] ${m.length}+ 处，示例:`);
    for (const x of m) console.log('  ' + x[0].replace(/\s+/g, ' ').slice(0, 170));
  }
}

// 找一个已知的测验接口调用
console.log('\n=== 页面里的 ajax / url 配置 ===');
const urls = [...html.matchAll(/["'](\/[a-z-]+\/[a-z-\/]*(?:work|job)[a-z-\/]*[^"']*)["']/gi)].slice(0, 10);
for (const u of urls) console.log('  ' + u[1]);
