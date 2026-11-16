import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cookies = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'cookies.json'), 'utf8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function probe(label, url, opts = {}) {
  try {
    const res = await fetch(url, {
      ...opts,
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Cookie': cookieHeader,
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    const loc = res.headers.get('location') || '';
    const loginHit = /passport2\.chaoxing\.com|请先登录|登录超时|login/i.test(loc + text.slice(0, 4000));
    console.log(`\n[${label}] ${res.status}  len=${text.length}  redirect=${loc.slice(0, 120)}`);
    console.log(`  login_wall=${loginHit}`);
    console.log(`  head: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    return { status: res.status, text, loc };
  } catch (e) {
    console.log(`\n[${label}] ERROR ${e.message}`);
    return null;
  }
}

await probe('i.chaoxing.com/base', 'https://i.chaoxing.com/base');

await probe('courselistdata', 'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
  body: 'courseType=1&courseFolderId=0&courseFolderSize=0',
});

await probe('mooc1 interaction', 'https://mooc1.chaoxing.com/visit/interaction');
