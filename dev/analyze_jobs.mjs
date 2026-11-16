import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));

const TYPE_CN = {
  video: '视频', document: '文档', work: '测验', workid: '测验', audio: '音频',
  bbs: '讨论', read: '阅读', vote: '投票', live: '直播', unknown: '其他',
};

const hms = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
};

const rows = [];
let gAllSec = 0, gPendSec = 0, gVid = 0, gDoneVid = 0;

for (const [cid, c] of Object.entries(index)) {
  const byType = {};
  let allSec = 0, pendSec = 0, vidN = 0, doneVid = 0, faceN = 0, switchN = 0;
  for (const j of c.jobs) {
    const k = (j.type || 'unknown').toLowerCase();
    byType[k] = (byType[k] || 0) + 1;
    if (k === 'video' || k === 'audio') {
      vidN++;
      allSec += j.duration;
      if (j.passed) doneVid++;
      else pendSec += j.duration;
      if (j.faceCapture) faceN++;
      if (j.switchWindow) switchN++;
    }
  }
  rows.push({ name: c.course, cid, total: c.jobs.length, byType, allSec, pendSec, vidN, doneVid, faceN, switchN });
  gAllSec += allSec; gPendSec += pendSec; gVid += vidN; gDoneVid += doneVid;
}

console.log('视频任务点时长统计');
console.log('='.repeat(104));
console.log('课程'.padEnd(32) + '视频数'.padStart(7) + '已通过'.padStart(7) + '总时长'.padStart(10) + '待看时长'.padStart(10) + '1.5x待看'.padStart(10) + '  人脸/切窗');
console.log('-'.repeat(104));
for (const r of rows.sort((a, b) => b.pendSec - a.pendSec)) {
  console.log(
    r.name.slice(0, 30).padEnd(32) +
    String(r.vidN).padStart(7) + String(r.doneVid).padStart(7) +
    hms(r.allSec).padStart(10) + hms(r.pendSec).padStart(10) +
    hms(Math.round(r.pendSec / 1.5)).padStart(10) +
    '  ' + `${r.faceN}/${r.switchN}`
  );
}
console.log('-'.repeat(104));
console.log('合计'.padEnd(32) + String(gVid).padStart(7) + String(gDoneVid).padStart(7) +
  hms(gAllSec).padStart(10) + hms(gPendSec).padStart(10) + hms(Math.round(gPendSec / 1.5)).padStart(10));

console.log(`\n【关键数字】`);
console.log(`  待看视频总时长      ${hms(gPendSec)}  (${(gPendSec / 3600).toFixed(1)} 小时，1.0x)`);
console.log(`  按 1.5x 代挂        ${(gPendSec / 1.5 / 3600).toFixed(1)} 小时`);
console.log(`  按每夜 8 小时窗口    ${Math.ceil(gPendSec / 1.5 / 3600 / 8)} 个晚上`);

const faceTotal = rows.reduce((a, r) => a + r.faceN, 0);
const swTotal = rows.reduce((a, r) => a + r.switchN, 0);
console.log(`\n【风控面】`);
console.log(`  启用随机人脸抓拍的视频    ${faceTotal} 个`);
console.log(`  启用切窗口检测的视频      ${swTotal} 个  ${swTotal ? '← 需伪造焦点' : '← 未启用'}`);

console.log('\n【任务点类型分布】');
const grand = {};
for (const r of rows) for (const [k, v] of Object.entries(r.byType)) grand[k] = (grand[k] || 0) + v;
for (const [k, v] of Object.entries(grand).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(TYPE_CN[k] || k).padEnd(6)} ${String(v).padStart(4)}`);
}

fs.writeFileSync(path.join(ROOT, 'state', 'jobs_summary.json'), JSON.stringify(rows, null, 2), 'utf8');
