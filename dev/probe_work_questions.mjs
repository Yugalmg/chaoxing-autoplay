import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CID = '267906227', CLAZZ = '156814312', CPI = '571260325';
const WORKID = 'c6f8d7d9752f4d928bc18a48455fa9fc';

const get = async (label, u) => {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Cookie': getCookieHeader(), 'Referer': 'https://mooc1.chaoxing.com/' }, redirect: 'follow' });
    const t = await r.text();
    console.log(`\n[${label}] ${r.status} ${t.length} 字节`);
    return t;
  } catch (e) { console.log(`[${label}] ERR ${e.message}`); return ''; }
};

const urls = [
  ['doHomeWorkNew', `https://mooc1.chaoxing.com/mooc-ans/work/doHomeWorkNew?workId=${WORKID}&courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}&ut=s`],
  ['selectWorkQuestion', `https://mooc1.chaoxing.com/mooc-ans/work/selectWorkQuestionYiPiYue?workId=${WORKID}&classId=${CLAZZ}&courseId=${CID}&cpi=${CPI}`],
];

for (const [label, u] of urls) {
  const t = await get(label, u);
  if (!t) continue;
  const hasQ = /题目|题干|question|answer|选项/.test(t);
  console.log('  含题目关键词:', hasQ);
  if (hasQ) {
    fs.writeFileSync(path.join(ROOT, 'log', 'work_' + label + '.html'), t, 'utf8');
    const m = [...t.matchAll(/.{60}(题目|题干|questionList|answer).{100}/g)].slice(0, 5);
    for (const x of m) console.log('   …' + x[0].replace(/\s+/g, ' ').slice(0, 180));
  }
}
