import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CID = '267906227', CLAZZ = '156814312', CPI = '571260325';

const tryUrl = async (label, u) => {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Cookie': getCookieHeader(), 'Referer': 'https://mooc1.chaoxing.com/' } });
    const t = await r.text();
    console.log(`\n[${label}] ${r.status}  ${t.length} 字节`);
    const hasWork = /章节测验|workid|doHomeWork|work\/doHomeWork|测验/.test(t);
    console.log('  含测验关键词:', hasWork);
    if (hasWork) {
      const m = [...t.matchAll(/.{80}(章节测验|workid|doHomeWork).{120}/g)].slice(0, 3);
      for (const x of m) console.log('   …' + x[0].replace(/\s+/g, ' ').slice(0, 200));
      fs.writeFileSync(path.join(ROOT, 'log', 'work_list_' + label.replace(/\W/g,'') + '.html'), t, 'utf8');
    }
    return t;
  } catch (e) { console.log(`[${label}] ERR ${e.message}`); return ''; }
};

await tryUrl('work-list', `https://mooc1.chaoxing.com/mooc-ans/work/list?courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}&ut=s`);
await tryUrl('work-index', `https://mooc1.chaoxing.com/mooc-ans/work/index?courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}`);
await tryUrl('work-list2', `https://mooc1.chaoxing.com/mooc-ans/work/list?courseId=${CID}&classId=${CLAZZ}&cpi=${CPI}&type=0&ut=s`);
