import { getCookieHeader } from './lib/core.mjs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const r = await fetch('https://mooc1.chaoxing.com/mooc-ans/work/doHomeWorkNew?workId=c6f8d7d9752f4d928bc18a48455fa9fc&courseId=267906227&classId=156814312&cpi=571260325&ut=s', {
  headers: { 'User-Agent': UA, 'Cookie': getCookieHeader(), 'Referer': 'https://mooc1.chaoxing.com/' },
  redirect: 'manual',
});
console.log('status:', r.status);
console.log('location:', r.headers.get('location'));
const t = await r.text();
console.log('body:', t.slice(0, 820));
