import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const [cid, c] = Object.entries(index).find(([, x]) => x.course.includes('艺术哲学'));

const OBJ = '8c1706eaabb510c84e3ad8e2763e7827';
const RES = 2903445;
const MEMBER = '67b120e66d29a742996d7e724c4d5c28c31bdebdf4b20326';
const CLAZZ = c.clazzid;
const CPI = c.cpi;

const url = `https://mooc1.chaoxing.com/question/quiz-validation?classid=${CLAZZ}&cpi=${CPI}&objectId=${OBJ}`;
const body = `eventid=${RES}&memberinfo=${encodeURIComponent(MEMBER)}&answerContent=A`;

console.log('POST', url);
console.log('body:', body);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'User-Agent': UA,
    'Cookie': getCookieHeader(),
    'Referer': 'https://mooc1.chaoxing.com/ananas/modules/video/index.html',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
  },
  body,
});
const t = await res.text();
console.log(`\n=> ${res.status}`);
console.log(t.slice(0, 800));
