import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const cid = '268918938';
const c = index[cid];
const target = c.jobs.filter(j => j.type === 'video' && !j.passed && j.jobid).sort((a, b) => a.duration - b.duration)[0];

const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${target.kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${target.kid}&courseId=${cid}&clazzid=${c.clazzid}`);
const mArg = JSON.parse(extractJsonObject(html, 'mArg'));

const a = (mArg.attachments || []).find(x => (x.objectId || '') === target.objectId);
console.log('目标视频:', target.name);
console.log('  之前: playTime=0  isPassed=false  attDuration=' + target.duration);
if (!a) { console.log('  !! 未找到该 attachment'); process.exit(0); }

console.log('\n=== 服务端最新状态 ===');
console.log(`  attDuration : ${a.attDuration} 秒`);
console.log(`  playTime    : ${a.playTime} 毫秒  => ${(a.playTime / 1000).toFixed(1)} 秒`);
console.log(`  isPassed    : ${a.isPassed}`);
console.log(`  进度        : ${((a.playTime / 1000 / a.attDuration) * 100).toFixed(1)}%`);
console.log(`  判定线      : 90% (${(a.attDuration * 0.9).toFixed(1)} 秒)`);

const others = (mArg.attachments || []).filter(x => x.type === 'video');
console.log(`\n本章共 ${others.length} 个视频任务点:`);
for (const o of others) {
  const pct = o.attDuration ? ((o.playTime / 1000 / o.attDuration) * 100).toFixed(0) : '0';
  console.log(`  ${String(o.objectId).slice(0, 12)}  ${o.property?.name?.slice(0, 26).padEnd(28)} ${(o.playTime / 1000).toFixed(0)}/${o.attDuration}s ${pct}% passed=${o.isPassed}`);
}
