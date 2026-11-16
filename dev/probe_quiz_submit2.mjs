import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const [cid, c] = Object.entries(index).find(([, x]) => x.course.includes('艺术哲学'));

const OBJ = '8c1706eaabb510c84e3ad8e2763e7827';
const MID = '8451202714701574924517274';
const RES_ID = 2903445;
const CLAZZ = c.clazzid;
const CPI = c.cpi;

const post = async (label, url, body) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA, 'Cookie': getCookieHeader(),
        'Referer': `https://mooc1.chaoxing.com/ananas/modules/video/index.html`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body || '',
    });
    const t = await res.text();
    console.log(`[${label}] ${res.status}  ${t.slice(0, 200)}`);
  } catch (e) { console.log(`[${label}] ERR ${e.message}`); }
};

const base = 'https://mooc1.chaoxing.com/question/quiz-validation';

// 各种 query 组合
await post('q1 classid+cpi+objectId',
  `${base}?classid=${CLAZZ}&cpi=${CPI}&objectId=${OBJ}`, '');

await post('q2 classid+cpi+objectId+resId',
  `${base}?classid=${CLAZZ}&cpi=${CPI}&objectId=${OBJ}&resourceId=${RES_ID}`, '');

await post('q3 带 body answer',
  `${base}?classid=${CLAZZ}&cpi=${CPI}&objectId=${OBJ}`,
  `resourceId=${RES_ID}&answer=A`);

await post('q4 带 mid',
  `${base}?classid=${CLAZZ}&cpi=${CPI}&objectId=${OBJ}&mid=${MID}`,
  `resourceId=${RES_ID}&answer=A&questionType=判断题`);

// richtext/qv 换 GET
try {
  const r = await fetch(`https://mooc1.chaoxing.com/richvideo/qv?resourceId=${RES_ID}&answer=A&objectId=${OBJ}&cpi=${CPI}`, {
    headers: { 'User-Agent': UA, 'Cookie': getCookieHeader(), 'Referer': 'https://mooc1.chaoxing.com/' },
  });
  console.log(`[qv GET] ${r.status}  ${(await r.text()).slice(0, 200)}`);
} catch (e) { console.log('[qv GET] ERR ' + e.message); }
