import { getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OBJ = '8c1706eaabb510c84e3ad8e2763e7827';
const MID = '8451202714701574924517274';
const RES_ID = 2903445;
const CPI = '571260325';
const MID_MEMBER = '67b120e66d29a742996d7e724c4d5c28c31bdebdf4b20326';

async function probe(label, url, opts = {}) {
  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'User-Agent': UA, 'Cookie': getCookieHeader(),
        'Referer': 'https://mooc1.chaoxing.com/ananas/modules/video/index.html',
        'X-Requested-With': 'XMLHttpRequest',
        ...(opts.headers || {}),
      },
    });
    const t = await res.text();
    console.log(`\n[${label}] ${res.status}  ${t.slice(0, 300)}`);
    return t;
  } catch (e) { console.log(`\n[${label}] ERR ${e.message}`); return null; }
}

// 1. 空白探测，看服务端要什么参数
await probe('qv 空 body', 'https://mooc1.chaoxing.com/richvideo/qv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: '',
});

// 2. 带基本参数
await probe('qv 基本参数', 'https://mooc1.chaoxing.com/richvideo/qv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `resourceId=${RES_ID}&answer=A`,
});

// 3. 带完整参数
await probe('qv 完整参数', 'https://mooc1.chaoxing.com/richvideo/qv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `resourceId=${RES_ID}&answer=A&objectId=${OBJ}&mid=${MID}&cpi=${CPI}&memberinfo=${MID_MEMBER}`,
});

// 4. quiz-validation
await probe('quiz-validation', 'https://mooc1.chaoxing.com/question/quiz-validation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `resourceId=${RES_ID}&answer=A&objectId=${OBJ}&mid=${MID}`,
});
