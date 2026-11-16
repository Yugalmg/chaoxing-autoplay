import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const html = await httpGet(
  `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&ut=s`,
  'https://mooc2-ans.chaoxing.com/'
);
console.log(`目录页 ${html.length} 字节\n`);

// 按章节块解析完成状态
const chunks = html.split('<div class="chapter_item"').slice(1);
const rows = [];
for (const ch of chunks) {
  const kid = ch.match(/id="cur(\d+)"/)?.[1];
  if (!kid) continue;
  const title = ch.match(/^\s*id="cur\d+"[\s\S]{0,200}?title="([^"]*)"/)?.[1] || '';
  const stateClass = ch.match(/class="catalog_state ([^"]*)"/)?.[1] || '';
  const tip = ch.match(/bntHoverTips">([^<]*)</)?.[1] || '';
  rows.push({ kid, title, done: /yiwanc/.test(stateClass), tip });
}

// 只看 12.x 和 9.5.x
for (const r of rows) {
  if (!/^(12\.|9\.5|11\.1)/.test(r.title) && !r.title.startsWith('12')) continue;
}
console.log('=== 全部章节完成状态（后 25 个）===');
for (const r of rows.slice(-25)) {
  console.log(`  ${r.done ? '✓' : '✗'} ${String(r.title).slice(0,26).padEnd(28)} ${r.tip}`);
}
