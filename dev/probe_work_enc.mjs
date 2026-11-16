import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CID = '267906227', CLAZZ = '156814312', CPI = '571260325', KID = '1262060630';
const WORKID = 'c6f8d7d9752f4d928bc18a48455fa9fc';
const ENC = '52eab33e95fd3a181ba7f3cad41ca8b8';

const variants = [
  ['带enc', `https://mooc1.chaoxing.com/mooc-ans/work/doHomeWorkNew?workId=${WORKID}&courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}&enc=${ENC}&ut=s`],
  ['带knowledgeid', `https://mooc1.chaoxing.com/mooc-ans/work/doHomeWorkNew?workId=${WORKID}&courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}&enc=${ENC}&knowledgeid=${KID}&ut=s`],
  ['quiz-page', `https://mooc1.chaoxing.com/mooc-ans/work/quiz?workId=${WORKID}&courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}&enc=${ENC}`],
  ['work-newIndex', `https://mooc1.chaoxing.com/mooc-ans/work/newIndex?workId=${WORKID}&courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}&enc=${ENC}`],
];

for (const [label, u] of variants) {
  try {
    const r = await fetch(u, {
      headers: { 'User-Agent': UA, 'Cookie': getCookieHeader(), 'Referer': `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}` },
      redirect: 'follow',
    });
    const t = await r.text();
    const isErr = /3004|温馨提示|没有此页面访问权限/.test(t);
    const hasQ = /题目|题干|question|选项|answer/.test(t);
    console.log(`[${label}] ${r.status}  ${t.length}B  错误页=${isErr}  含题目=${hasQ}`);
    if (!isErr && t.length > 2000) {
      fs.writeFileSync(path.join(ROOT, 'log', 'work_ok_' + label + '.html'), t, 'utf8');
      const m = [...t.matchAll(/.{50}(questionId|题干|answerA|选项).{120}/g)].slice(0, 3);
      for (const x of m) console.log('   …' + x[0].replace(/\s+/g, ' ').slice(0, 180));
    }
  } catch (e) { console.log(`[${label}] ERR ${e.message.slice(0,50)}`); }
  await new Promise(r => setTimeout(r, 600));
}
