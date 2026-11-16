import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));
const ch = s.chapters.find(x => x.no === '8.4.6');
console.log(`8.4.6 ${ch?.title}  kid=${ch?.kid}`);

for (const num of [0, 1]) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=${num}&ut=s&cpi=${c.cpi}&v=2025`;
  try {
    const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
    const raw = extractJsonObject(html, 'mArg');
    if (!raw) continue;
    const mArg = JSON.parse(raw);
    const vids = (mArg.attachments || []).filter(a => a.type === 'video');
    if (!vids.length) continue;
    for (const v of vids) {
      console.log(`\nnum=${num} 视频: ${v.property?.name}`);
      console.log(`  objectId: ${v.objectId}`);
      console.log(`  mid: ${v.mid}`);
      console.log(`  size: ${v.property?.size}  hsize: ${v.property?.hsize}`);
      console.log(`  type: ${v.property?.type}  module: ${v.property?.module}`);
      console.log(`  duration: ${v.attDuration}s`);
      // 拿播放地址
      const initUrl = `https://mooc1.chaoxing.com/mooc-ans/richvideo/initdatawithviewerV2?mid=${v.mid}&cpi=${c.cpi}&classid=${c.clazzid}&courseid=${CID}&ut=s`;
      try {
        const init = JSON.parse(await httpGet(initUrl, 'https://mooc1.chaoxing.com/'));
        if (Array.isArray(init) && init[0]?.datas) console.log(`  弹题: ${init[0].datas.length} 个`);
      } catch {}
    }
    break;
  } catch (e) { console.log(`num=${num} ERR ${e.message.slice(0,50)}`); }
}
