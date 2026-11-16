import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const target = Object.entries(index).find(([, c]) => c.course.includes('艺术哲学'));
if (!target) { console.log('没找到艺术哲学'); process.exit(0); }
const [cid, c] = target;
console.log(`课程: ${c.course}  courseid=${cid}`);

// 取前 3 个未完成章节，看视频的完整 attachment 结构
const kids = [...new Set(c.jobs.filter(j => j.type === 'video' && !j.passed).map(j => j.kid))].slice(0, 3);
console.log(`检查章节: ${kids.length} 个\n`);

for (const kid of kids) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
  const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
  const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
  const vids = (mArg.attachments || []).filter(a => a.type === 'video');
  for (const v of vids) {
    const keys = Object.keys(v);
    const interesting = {
      objectId: v.objectId,
      name: (v.property?.name || '').slice(0, 30),
      duration: v.attDuration,
      passed: v.isPassed,
      jumpTimePointList: v.jumpTimePointList,
      randomFaceCaptureTimeList: v.randomFaceCaptureTimeList,
      otherInfo: (v.otherInfo || '').slice(0, 120),
      extraKeys: keys.filter(k => !['begins','ends','jobid','mid','property','type','objectId','aid','otherInfo','jtoken','playTime','attDuration','isPassed','attDurationEnc','videoFaceCaptureEnc','randomFaceCaptureTimeList','randomCaptureTime','jumpTimePointList','customType','headOffset','headOffsetVersion','topicList'].includes(k))
    };
    console.log(JSON.stringify(interesting, null, 1));
    console.log('---');
  }
  await new Promise(r => setTimeout(r, 700));
}
