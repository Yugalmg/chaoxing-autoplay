import fs from 'node:fs';
import { getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const get = async (u) => {
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Cookie': getCookieHeader(), 'Referer': 'https://mooc1.chaoxing.com/' } });
  return await r.text();
};

const targets = [
  'https://mooc1.chaoxing.com/ananas/modules/video/index.js?v=2026-1027-001',
  'https://mooc1.chaoxing.com/ananas/videojs-ext/videojs-ext.min.js?v=2026-1110-1930',
  'https://mooc1.chaoxing.com/ananas/modules/video/form.utils.js',
];

for (const u of targets) {
  const name = u.split('/').pop().split('?')[0];
  try {
    const txt = await get(u);
    console.log(`\n===== ${name}  ${txt.length} 字节 =====`);
    fs.writeFileSync('log/js_' + name, txt, 'utf8');

    const pats = [
      /quiz-validation/gi,
      /richvideo\/qv/gi,
      /resourceId/gi,
      /\bQUIZ\b/g,
      /validationUrl/gi,
      /answer/gi,
      /questionType/gi,
    ];
    for (const p of pats) {
      const n = (txt.match(p) || []).length;
      if (n) console.log(`  ${p.source}: ${n} 次`);
    }

    // 抓 quiz 附近的片段
    const idxs = [];
    let m;
    const re = /quiz[-_]?validation|richvideo\/qv|validationUrl/g;
    while ((m = re.exec(txt)) && idxs.length < 6) idxs.push(m.index);
    for (const i of idxs) {
      console.log('  ---');
      console.log('  ' + txt.slice(Math.max(0, i - 300), i + 500).replace(/\s+/g, ' '));
    }
  } catch (e) { console.log(`  ${name}: ERR ${e.message}`); }
}
